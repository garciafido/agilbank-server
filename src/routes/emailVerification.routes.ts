import { Router } from 'express';
import { randomUUID } from 'crypto';
import { basePrisma } from '../prisma/client';
import { Prisma } from '../prisma/generated-client/client';
import { createContext, ServiceContext } from '../service-context';
import { Request as ExpressRequest } from '../types/express';
import { logger } from '../utils/logger';
import { redis } from '../services/redis/redisClient';
import { container, DependencyContainer } from 'tsyringe';
import { SchemaMetadataStore } from '../common/services/schemaMetadata';
import { SecurePrismaOps } from '../common/services/securePrismaOps';
import {
  generateVerificationSignature,
  verifySignature,
  buildVerificationUrl,
  maskEmail,
  normalizeEmail,
} from '../common/utils/emailVerification';
import { enqueueVerificationEmail } from '../workers/queues/emailQueue';
import { senderDisplayName } from '../common/emailVerification/senderDisplayName';
import { onExternalValidationSubmitted } from '../common/externalValidation/onSubmitted';
import type { ExternalValidationSubmittedResult } from '../common/externalValidation/onSubmitted';
import { runWithTransactionScope } from '../common/services/transactionScope';
import { isTransactionConflict } from '../common/services/saveRetry';
// Lo que va al log de un error: tipo, código y dónde falló, nunca su mensaje (ver utils/errorKind).
import { errorKind } from '../utils/errorKind';
import { DeadlineExceededError, withDeadline } from '../utils/withDeadline';
import { sseManager } from '../services/sse/SSEManager';
import {
  externalValidationRegistry,
  ExternalValidationConfig,
  ExternalValidationFieldConfig,
} from '../common/externalValidation/registry';

const router = Router();

const EXPIRATION_HOURS = 72;
const MIN_RESEND_INTERVAL_MS = 5 * 60 * 1000;
// El id más largo que el formulario público acepta para una referencia, muy por
// encima de uno real: un UUID tiene 36 caracteres, y el nombre de un país usado de
// id, unas decenas a lo sumo.
const REF_ID_MAX_LENGTH = 255;
// Lo más que una respuesta espera a Redis por los eventos en vivo, que se publican
// después de guardar: un Redis que no contesta no puede colgar la respuesta de
// algo ya guardado. Los eventos salen igual cuando Redis conteste.
const SSE_PUBLISH_TIMEOUT_MS = 1000;

function pascalToCamel(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

async function createRequestContainer(req: ExpressRequest) {
  const context = await createContext(req);
  const requestContainer = container.createChildContainer();
  requestContainer.register<ServiceContext>('ServiceContext', { useValue: context });
  requestContainer.register<DependencyContainer>('DependencyContainer', { useValue: requestContainer });
  return { context, requestContainer };
}

/**
 * El nombre con que se presenta la empresa ante el contacto. En la validación de
 * datos (el mail que le pide cargar y/o verificar sus datos y el formulario
 * público donde lo hace) es el del asiento del proyecto, senderDisplayName; si el
 * asiento no da ninguno (vacío o solo espacios), el de la empresa. En la
 * verificación simple de un email, siempre el de la empresa. Es texto plano: el
 * mail lo escapa y el formulario lo muestra como texto.
 */
async function shownTenantName(
  tenant: { id: string; name: string | null } | null | undefined,
  dataValidation: boolean
): Promise<string> {
  if (!tenant) return '';
  const projectName = dataValidation ? ((await senderDisplayName(tenant.id, basePrisma)) ?? '').trim() : '';
  return projectName || tenant.name || '';
}

/**
 * Lo que el mail y las páginas públicas muestran de la empresa. La URL pública es
 * opcional: se pide solo si el Tenant del proyecto la declara, porque un campo que el
 * modelo no tiene hace fallar la consulta entera.
 */
const TENANT_INFO_SELECT = {
  id: true,
  name: true,
  logo_data: true,
  ...(('publicUrl' in Prisma.TenantScalarFieldEnum ? { publicUrl: true } : {}) as {}),
} as const;

const publicUrlOf = (tenant: object | null | undefined): string | null | undefined =>
  (tenant as { publicUrl?: string | null } | null | undefined)?.publicUrl;

/**
 * Lo que las páginas públicas muestran de la empresa (encabezado y título).
 *
 * afterCommit: para la respuesta de una confirmación o una verificación que ya
 * quedó guardada (la de este pedido, o la de otro que la confirmó mientras
 * tanto). Lo que pasa después del commit no cambia la respuesta: si el asiento
 * senderDisplayName tira, va el nombre de la empresa, y al log solo el tipo, el
 * código y dónde falló (su mensaje puede traer un nombre o lo que el proyecto ponga).
 */
async function tenantInfoOf(
  record: {
    sourceEntity: string | null;
    sourceRecordId: string | null;
    tenant_: { id: string; name: string | null; logo_data: any } | null;
  },
  options: { afterCommit?: boolean } = {}
) {
  let tenantName: string;
  try {
    tenantName = await shownTenantName(record.tenant_, !!(record.sourceEntity && record.sourceRecordId));
  } catch (err) {
    if (!options.afterCommit) throw err;
    logger.error(
      { entity: record.sourceEntity, ...errorKind(err) },
      'Public verification: senderDisplayName failed after the commit; showing the tenant name'
    );
    tenantName = record.tenant_?.name || '';
  }
  return {
    tenantName,
    tenantLogo: record.tenant_?.logo_data,
    tenantPublicUrl: publicUrlOf(record.tenant_),
  };
}

/**
 * El nombre del contacto para el saludo del mail de validación de datos ("Hola
 * Ana"): el campo que la configuración de la entidad declara con .contactName,
 * leído del registro al que apunta la verificación guardada y de la empresa de
 * quien la pide. Sin campo declarado, sin registro, con el nombre en blanco o si
 * leerlo falla: sin nombre (el saludo va solo).
 */
async function contactNameOf(
  sourceEntity: string,
  sourceRecordId: string,
  tenantId: string
): Promise<string | undefined> {
  const evConfig = externalValidationRegistry[sourceEntity];
  if (!evConfig?.contactNameField) return undefined;
  const model = (basePrisma as any)[evConfig.prismaModel];
  if (!model) return undefined;
  try {
    const row = await model.findFirst({
      where: { id: sourceRecordId, tenant_id_: tenantId },
      select: { [evConfig.contactNameField]: true },
    });
    const value = row?.[evConfig.contactNameField];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  } catch {
    // El nombre solo completa el saludo: si leerlo falla, el mail sale igual, sin
    // él. El aviso no lleva el error (el de Prisma puede traer la consulta, con el
    // id) ni el nombre: solo la entidad.
    logger.warn({ sourceEntity }, 'Could not read the contact name for the data validation email; sending it without the name');
    return undefined;
  }
}

/**
 * La verificación ya no estaba pendiente dentro de la transacción de la
 * confirmación (otro envío del mismo formulario la confirmó, o la revocaron o
 * venció): la transacción se revierte entera, sin cambios ni asiento. status es
 * el estado que encontró (null si la verificación ya no existe).
 */
class VerificationNotPending extends Error {
  constructor(readonly status: string | null) {
    super('Email verification is no longer pending');
  }
}

/**
 * El campo de un error de validación del UpdateService, para que el formulario
 * público lo marque: el de meta.field (ValidationError) o, si falta un
 * obligatorio (NullValueError, VALIDATION_REQUIRED, que no trae meta), el que
 * sigue a "args." en su customMessage ("args.firstName" → "firstName"). Si el
 * customMessage no tiene esa forma, ninguno.
 */
function invalidFieldOf(err: any): string | undefined {
  const fromMeta = err?.extensions?.meta?.field;
  if (typeof fromMeta === 'string' && fromMeta !== '') return fromMeta;
  if (err?.extensions?.code !== 'VALIDATION_REQUIRED' || typeof err.customMessage !== 'string') return undefined;
  const match = /^args\.(.+)$/.exec(err.customMessage);
  return match ? match[1] : undefined;
}

/**
 * El aviso guardado de que un contacto confirmó sus datos: uno por cada
 * administrador de sitio activo de la empresa (rol SiteAdmin), con el enlace al
 * formulario del registro. La empresa es la de la verificación guardada (la
 * pasa la ruta; nunca sale del pedido), y el registro y los administradores se
 * buscan solo en ella. Va después del commit y nunca hace fallar la
 * confirmación: si algo falla, queda en el log, sin el error entero ni el
 * nombre. El texto lo escribe el cliente con la clave (metadata.i18nKey), sus
 * parámetros y la variante ("verified" si el proyecto verificó algún dato);
 * title y body son el respaldo en castellano.
 */
async function notifySiteAdmins(args: {
  evConfig: ExternalValidationConfig;
  tenantId: string;
  recordId: string;
  email: string;
  verified: boolean;
}): Promise<void> {
  const { evConfig, tenantId, recordId, email, verified } = args;
  try {
    const model = (basePrisma as any)[evConfig.prismaModel];
    const row = model
      ? await model.findFirst({ where: { id: recordId, tenant_id_: tenantId }, select: evConfig.displayNameSelect })
      : null;
    // El nombre visible, sin las partes vacías ("∅"); sin nombre, el e-mail.
    const shown = row ? String(evConfig.displayName(row) ?? '').replace(/∅/g, '').replace(/\s+/g, ' ').trim() : '';
    const contactName = shown || email;
    const admins: { id: string }[] = await basePrisma.user.findMany({
      where: { tenant_id_: tenantId, active: true, roles: { some: { id: 'SiteAdmin' } } },
      select: { id: true },
    });
    if (admins.length === 0) {
      logger.warn({ tenantId, entity: evConfig.entityName }, 'External validation submitted: no active SiteAdmin to notify');
      return;
    }
    await sseManager.createAndSendNotificationToMultiple(
      admins.map((admin) => ({ userId: admin.id, tenantId })),
      {
        type: 'system',
        priority: 'medium',
        title: 'Validación de datos recibida',
        body: verified ? `${contactName} cargó y validó sus datos.` : `${contactName} cargó sus datos.`,
        objectType: evConfig.entityName,
        objectId: recordId,
        actionUrl: `/${evConfig.entityRoute}/view/${recordId}`,
        metadata: {
          i18nKey: 'externalValidationSubmitted',
          params: { contactName, verified },
          ...(verified ? { variant: 'verified' } : {}),
        },
      }
    );
  } catch (err) {
    // El mensaje de un error de la base puede traer el aviso, con el nombre.
    logger.error(
      { tenantId, entity: evConfig.entityName, ...errorKind(err) },
      'External validation submitted: could not notify SiteAdmins'
    );
  }
}

/**
 * Los eventos en vivo de algo ya guardado: `publish` hace los redis.publish (en
 * orden, si son varios) y se espera a lo sumo SSE_PUBLISH_TIMEOUT_MS. Nunca tira:
 * - si Redis falla antes del plazo, queda en el log y la respuesta sigue;
 * - si vence el plazo, el log lo dice (no es una falla: los eventos salen cuando
 *   Redis conteste) y la respuesta sigue; si Redis falla después, también queda
 *   en el log.
 * Al log va el tipo y el código del error (errorKind), nunca el error entero: el
 * de Redis puede traer el comando, con el evento.
 */
async function publishLiveEvents(
  site: 'external validation' | 'email verification',
  verificationId: string,
  publish: () => Promise<unknown>
): Promise<void> {
  // Un throw sincrónico de publish también queda como rechazo.
  const pending = (async () => publish())();
  try {
    await withDeadline(pending, SSE_PUBLISH_TIMEOUT_MS, `SSE publish (${site})`);
  } catch (err) {
    if (!(err instanceof DeadlineExceededError)) {
      logger.warn({ verificationId, ...errorKind(err) }, `Failed to publish SSE for ${site}`);
      return;
    }
    logger.warn(
      { verificationId, timeoutMs: SSE_PUBLISH_TIMEOUT_MS },
      `SSE for ${site} still pending after the deadline; it goes out when Redis answers`
    );
    pending.catch((late) =>
      logger.warn({ verificationId, ...errorKind(late) }, `Failed to publish SSE for ${site} after the deadline`)
    );
  }
}

/**
 * Validate HMAC + lookup record. Shared by info and submit endpoints.
 */
async function validatePublicRequest(vid: string, sig: string) {
  const record = await basePrisma.emailVerification.findUnique({
    where: { id: vid },
    include: {
      tenant_: {
        select: TENANT_INFO_SELECT,
      },
    },
  });

  if (!record) return { error: 'not_found', status: 404 } as const;

  if (!verifySignature(record.id, record.email, record.tenant_id_, sig)) {
    return { error: 'invalid_signature', status: 400 } as const;
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return { error: 'expired', status: 410 } as const;
  }

  if (record.status === 'revoked') {
    return { error: 'revoked', status: 410 } as const;
  }

  return { record } as const;
}

/**
 * POST /api/email-verification/send
 * Authenticated — operator requests verification for a contact email.
 * Body: { email: string, sourceEntity: string, sourceRecordId?: string }
 */
router.post('/email-verification/send', async (req, res) => {
  let context: ServiceContext;
  let requestContainer: DependencyContainer;
  try {
    const result = await createRequestContainer(req as ExpressRequest);
    context = result.context;
    requestContainer = result.requestContainer;
  } catch {
    return res.status(401).json({ success: false, error: 'authentication_required' });
  }

  if (!context.currentUser) {
    return res.status(401).json({ success: false, error: 'authentication_required' });
  }

  try {
    const { email, sourceEntity, sourceRecordId, resend } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'invalid_email' });
    }
    if (!sourceEntity || typeof sourceEntity !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_source_entity' });
    }

    // Permission check: user must have _update on the source entity
    const camelEntity = pascalToCamel(sourceEntity);
    if (!context.permissions().has(`${camelEntity}_update`)) {
      return res.status(403).json({ success: false, error: 'permission_denied' });
    }

    const schemaMetaStore = requestContainer.resolve<SchemaMetadataStore>('SchemaMetadataStore');
    const db = new SecurePrismaOps(context, context.prisma, schemaMetaStore, 'EmailVerification', {});

    const normalized = normalizeEmail(email);
    const tenantId = context.currentUser.tenant_id_;
    const userId = context.currentUser.id;

    // Determine if this entity has external validation
    const hasDataValidation = !!(sourceRecordId && externalValidationRegistry[sourceEntity]);

    // Look up existing verification for (email, tenant) — tenant filter applied by SecurePrismaOps
    let record = await db.findFirst({
      where: { email: normalized },
    });

    // Already verified — return status unless resend requested
    if (record && record.status === 'verified' && !resend) {
      return res.json({
        success: true,
        status: 'already_verified',
        verifiedAt: record.verifiedAt,
      });
    }

    // Resend: reset status so email can be re-sent
    if (record && resend) {
      await db.update({
        where: { id: record.id },
        data: {
          status: 'pending',
          verifiedAt: null,
          validationChanges: null,
          validationSubmittedAt: null,
        },
      });
      record = { ...record, status: 'pending', lastSentAt: null };
    }

    // Cooldown: minimum 5 minutes between sends
    if (record && record.lastSentAt) {
      const elapsed = Date.now() - record.lastSentAt.getTime();
      if (elapsed < MIN_RESEND_INTERVAL_MS) {
        const retryAfter = new Date(record.lastSentAt.getTime() + MIN_RESEND_INTERVAL_MS);
        return res.status(429).json({
          success: false,
          error: 'rate_limited',
          retryAfter: retryAfter.toISOString(),
        });
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPIRATION_HOURS * 60 * 60 * 1000);

    // Build data with optional sourceEntity/sourceRecordId
    const sourceFields: Record<string, any> = {};
    if (hasDataValidation && sourceRecordId) {
      sourceFields.sourceEntity = sourceEntity;
      sourceFields.sourceRecordId = sourceRecordId;
    }

    if (!record) {
      // Create new PENDING record — tenant + audit fields injected by SecurePrismaOps
      record = await db.create({
        data: {
          email: normalized,
          status: 'pending',
          expiresAt,
          sentAt: now,
          sentCount: 1,
          lastSentAt: now,
          requestedBy: { connect: { id: userId } },
          ...sourceFields,
        },
      });
    } else {
      // Update existing: new expiration, increment sentCount (audit fields auto-injected)
      record = await db.update({
        where: { id: record.id },
        data: {
          status: 'pending',
          expiresAt,
          sentAt: now,
          sentCount: { increment: 1 },
          lastSentAt: now,
          requestedBy: { connect: { id: userId } },
          ...sourceFields,
        },
      });
    }

    // El nombre del contacto para el saludo, solo en la validación de datos. Sale
    // de lo que quedó guardado en la verificación (como en info y submit), no del
    // cuerpo del pedido. La guarda hasDataValidation hace falta: un envío simple
    // no toca sourceEntity ni sourceRecordId, y la verificación puede seguir con
    // los de una validación anterior.
    const recipientName =
      hasDataValidation && record.sourceEntity && record.sourceRecordId
        ? await contactNameOf(record.sourceEntity, record.sourceRecordId, tenantId)
        : undefined;

    // Fetch tenant info for email branding
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
      select: TENANT_INFO_SELECT,
    });

    const verificationUrl = buildVerificationUrl(record.id, normalized, tenantId);

    // Enqueue email
    await enqueueVerificationEmail({
      verificationId: record.id,
      email: normalized,
      tenantId,
      tenantName: await shownTenantName(tenant, hasDataValidation),
      tenantLogo: tenant?.logo_data || undefined,
      tenantPublicUrl: publicUrlOf(tenant) || undefined,
      verificationUrl,
      requestedByUserId: userId,
      language: (process.env.DEFAULT_LANGUAGE as any) || 'es',
      hasDataValidation,
      ...(recipientName ? { recipientName } : {}),
    });

    // En los logs de esta ruta, la verificación (o la entidad y el registro) en vez
    // del mail del contacto, que es un dato personal; de un error, solo su tipo y
    // su código (su mensaje puede traer el mail: Prisma copia la consulta con sus valores).
    logger.info({ tenantId, verificationId: record.id, hasDataValidation }, 'Email verification sent');

    return res.json({ success: true, status: 'sent' });
  } catch (error) {
    logger.error(errorKind(error), 'Error in email-verification/send');
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * GET /api/public/verify-email/info
 * Public — returns verification mode and entity data for data validation.
 */
router.get('/public/verify-email/info', async (req, res) => {
  try {
    const vid = req.query.vid as string;
    const sig = req.query.sig as string;

    if (!vid || !sig) {
      return res.status(400).json({ success: false, error: 'invalid_request' });
    }

    const result = await validatePublicRequest(vid, sig);
    if ('error' in result) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    const { record } = result;
    const tenantInfo = await tenantInfoOf(record);

    // Already verified — return idempotent response
    if (record.status === 'verified') {
      return res.json({
        success: true,
        mode: 'already_verified',
        tenantInfo,
      });
    }

    // Check if this has external validation data
    const evConfig = record.sourceEntity ? externalValidationRegistry[record.sourceEntity] : null;

    if (evConfig && record.sourceRecordId) {
      // Data validation mode — fetch entity data
      try {
        const prismaModel = (basePrisma as any)[evConfig.prismaModel];
        if (!prismaModel) {
          logger.error({ model: evConfig.prismaModel }, 'Prisma model not found for external validation');
          return res.json({ success: true, mode: 'emailOnly', tenantInfo });
        }

        const entityRecord = await prismaModel.findFirst({
          where: {
            id: record.sourceRecordId,
            tenant_id_: record.tenant_id_,
          },
          select: { id: true, ...evConfig.selectFields },
        });

        if (!entityRecord) {
          // Record not found — fall back to email-only
          return res.json({ success: true, mode: 'emailOnly', tenantInfo });
        }

        // Fetch lookup data for editable ref fields (sharedAcrossTenants only)
        type LookupRow = { id: string; displayId: string; parentId?: string; [field: string]: string | undefined };
        const lookups: Record<string, LookupRow[]> = {};
        const defaultLang = process.env.DEFAULT_LANGUAGE || 'es';

        for (const lookup of evConfig.refLookups || []) {
          const lookupModel = (basePrisma as any)[lookup.prismaModel];
          if (!lookupModel) continue;

          const orderField = lookup.displayMultilang
            ? `${lookup.displayField}_${defaultLang}`
            : lookup.displayField;

          const records = await lookupModel.findMany({
            select: lookup.selectFields,
            orderBy: { [orderField]: 'asc' },
          });

          lookups[lookup.entityName] = records.map((r: any) => {
            const row: LookupRow = {
              id: r.id,
              displayId: lookup.displayMultilang
                ? (r[`${lookup.displayField}_${defaultLang}`] || '')
                : (r[lookup.displayField] || ''),
              ...(lookup.compositeRefField ? { parentId: r[`${lookup.compositeRefField}_id`] } : {}),
            };
            // Los códigos de la fila (extraFields del registry, como el code de un
            // país), con su nombre y solo si son un texto no vacío: con ellos la
            // pantalla del proyecto elige una fila por su código y no por el nombre.
            for (const field of lookup.extraFields ?? []) {
              const value = r[field];
              if (typeof value === 'string' && value.trim() !== '') row[field] = value;
            }
            return row;
          });
        }

        return res.json({
          success: true,
          mode: 'dataValidation',
          // De qué entidad es: la página pública elige con esto la pantalla
          // propia del proyecto (src/common/pages/externalValidationPages.tsx).
          entityName: record.sourceEntity,
          entityData: entityRecord,
          fields: evConfig.fields,
          groups: evConfig.groups,
          editableFields: evConfig.editableFields,
          lookups,
          tenantInfo,
        });
      } catch (fetchError) {
        logger.error({ entity: record.sourceEntity, ...errorKind(fetchError) }, 'Error fetching entity for external validation');
        return res.json({ success: true, mode: 'emailOnly', tenantInfo });
      }
    }

    // Email-only mode
    return res.json({ success: true, mode: 'emailOnly', tenantInfo });
  } catch (error) {
    logger.error(errorKind(error), 'Error in public/verify-email/info');
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * POST /api/public/external-validation/submit
 * Public — external person submits verified data changes.
 * Body: { vid: string, sig: string, data: Record<string, any> }
 */
router.post('/public/external-validation/submit', async (req, res) => {
  try {
    const { vid, sig, data } = req.body;

    if (!vid || !sig || typeof vid !== 'string' || typeof sig !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_request' });
    }
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, error: 'invalid_data' });
    }

    const result = await validatePublicRequest(vid, sig);
    if ('error' in result) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    const { record } = result;

    // Ya confirmada (este formulario se envió antes, o lo envió otra pestaña): no
    // se vuelve a aplicar. Es la respuesta de una confirmación ya guardada, como
    // la de más abajo: un asiento que tira no la vuelve un error.
    if (record.status === 'verified') {
      return res.json({
        success: true,
        message: 'already_verified',
        tenantInfo: await tenantInfoOf(record, { afterCommit: true }),
      });
    }

    // Must have source entity + record
    if (!record.sourceEntity || !record.sourceRecordId) {
      return res.status(400).json({ success: false, error: 'no_validation_context' });
    }

    const evConfig = externalValidationRegistry[record.sourceEntity];
    if (!evConfig) {
      return res.status(400).json({ success: false, error: 'entity_not_configured' });
    }

    // Validate submitted fields
    const editableSet = new Set(evConfig.editableFields);
    const fieldConfigByName: Record<string, ExternalValidationFieldConfig> = {};
    for (const f of evConfig.fields) {
      fieldConfigByName[f.name] = f;
    }

    const sanitizedData: Record<string, any> = {};
    const rejectedFields: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const fieldConfig = fieldConfigByName[key];
      if (!fieldConfig) {
        rejectedFields.push(key);
        continue;
      }
      if (!editableSet.has(key)) {
        rejectedFields.push(key);
        continue;
      }

      // Type coercion and validation
      let coerced: any = value;
      try {
        switch (fieldConfig.type) {
          case 'String':
            // Vacío o solo espacios: null en un campo opcional (no choca con otro
            // vacío en un índice único); "" en uno obligatorio, que el
            // UpdateService rechaza como faltante.
            if (value == null || String(value).trim() === '') {
              coerced = fieldConfig.nullable ? null : '';
            } else {
              coerced = String(value);
            }
            break;
          case 'Enum':
            // Vacío o solo espacios: null siempre. En uno obligatorio el
            // UpdateService lo rechaza como faltante (VALIDATION_REQUIRED, y la
            // respuesta dice el campo); "" llegaba a Prisma como un valor inválido.
            if (value == null || String(value).trim() === '') {
              coerced = null;
            } else {
              coerced = String(value);
              // Un valor fuera de sus opciones no llega al servicio ni a Prisma (su
              // error traería el valor): 422 con el campo, sin el valor. Sin
              // opciones declaradas, ningún valor pasa.
              if (!fieldConfig.options?.some((option) => option.value === coerced)) {
                return res.status(422).json({
                  success: false,
                  error: 'validation_failed',
                  code: 'VALIDATION_INVALID_OPTION',
                  field: key,
                  message: 'VALIDATION_INVALID_OPTION',
                  meta: null,
                });
              }
            }
            break;
          case 'Int':
            if (value != null && value !== '') {
              coerced = parseInt(String(value), 10);
              if (isNaN(coerced)) { rejectedFields.push(key); continue; }
            } else {
              // En blanco: null, también en uno obligatorio, que el UpdateService
              // rechaza como faltante (y la respuesta dice el campo); no un 0.
              coerced = null;
            }
            break;
          case 'Decimal':
            if (value != null && value !== '') {
              coerced = parseFloat(String(value));
              if (isNaN(coerced)) { rejectedFields.push(key); continue; }
            } else {
              // En blanco: null, como en Int.
              coerced = null;
            }
            break;
          case 'Boolean':
            // Uno obligatorio en blanco llega null (el UpdateService lo rechaza como
            // faltante), no false; uno opcional, como siempre.
            coerced = !fieldConfig.nullable && (value == null || String(value).trim() === '') ? null : !!value;
            break;
          case 'Date':
          case 'DateTime':
            if (value != null && value !== '') {
              const d = new Date(String(value));
              if (isNaN(d.getTime())) { rejectedFields.push(key); continue; }
              coerced = d;
            } else {
              coerced = fieldConfig.nullable ? null : null;
            }
            break;
          case 'Ref':
            if (value != null && value !== '') {
              // Se acepta si la fila existe, sea o no su id un UUID: un catálogo
              // sembrado puede usar el nombre de id (los países). Lo que no es un
              // texto, o un texto más largo que cualquier id, se rechaza sin
              // consultar; sin el modelo de la fila en el registry, también (falla
              // cerrado). Si la consulta tira (una columna uuid en la base y un
              // valor que no lo es), el catch de abajo rechaza el campo.
              const refModel = fieldConfig.refPrismaModel ? (basePrisma as any)[fieldConfig.refPrismaModel] : undefined;
              if (typeof value !== 'string' || value.length > REF_ID_MAX_LENGTH || !refModel) { rejectedFields.push(key); continue; }
              const exists = await refModel.findUnique({ where: { id: value }, select: { id: true } });
              if (!exists) { rejectedFields.push(key); continue; }
              coerced = value;
            } else {
              // En blanco: null, también en una obligatoria, que el UpdateService
              // rechaza como faltante (y la respuesta dice el campo).
              coerced = null;
            }
            break;
          default:
            coerced = value;
        }
      } catch (err) {
        // Una consulta que tira (la de existencia de una referencia: una falla de
        // la base, o una columna uuid y un valor que no lo es) rechaza el campo y
        // la confirmación sigue; el log dice cuál campo y el tipo del error, nunca
        // el valor ni el mensaje.
        logger.warn({ vid, field: key, ...errorKind(err) }, 'External validation: a submitted field could not be checked');
        rejectedFields.push(key);
        continue;
      }

      sanitizedData[key] = coerced;
    }

    if (rejectedFields.length > 0) {
      // Al log van los campos de la entidad que no se aceptaron; de una clave que
      // la entidad no tiene, solo cuántas: la escribió el contacto.
      const entityFields = new Set(Object.keys(fieldConfigByName));
      logger.warn(
        {
          vid,
          rejectedFields: rejectedFields.filter((key) => entityFields.has(key)),
          unknownFields: rejectedFields.filter((key) => !entityFields.has(key)).length,
        },
        'External validation rejected fields'
      );
    }

    // Fetch old values for diff
    const prismaModel = (basePrisma as any)[evConfig.prismaModel];
    if (!prismaModel) {
      return res.status(500).json({ success: false, error: 'internal_error' });
    }

    const oldRecord = await prismaModel.findFirst({
      where: {
        id: record.sourceRecordId,
        tenant_id_: record.tenant_id_,
      },
      select: { id: true, version_: true, ...evConfig.selectFields },
    });

    if (!oldRecord) {
      return res.status(404).json({ success: false, error: 'record_not_found' });
    }

    // Validate compositeWith relationships (e.g., province belongs to selected country)
    for (const [key, value] of Object.entries(sanitizedData)) {
      const fc = fieldConfigByName[key];
      if (fc?.type === 'Ref' && fc.compositeWith && fc.compositeRefField && value) {
        const parentValue = sanitizedData[fc.compositeWith] || oldRecord[`${fc.compositeWith}_id`];
        if (parentValue) {
          const refModel = (basePrisma as any)[fc.refPrismaModel];
          if (refModel) {
            const valid = await refModel.findFirst({
              where: { id: value, [`${fc.compositeRefField}_id`]: parentValue },
              select: { id: true },
            });
            if (!valid) {
              rejectedFields.push(key);
              delete sanitizedData[key];
            }
          }
        }
      }
    }

    // Compute diff (only fields that actually changed)
    const changes: { field: string; oldValue: any; newValue: any }[] = [];
    for (const [key, newValue] of Object.entries(sanitizedData)) {
      const fc = fieldConfigByName[key];
      const dbKey = fc?.type === 'Ref' ? `${key}_id` : key;
      const oldValue = oldRecord[dbKey];
      // Compare as strings for dates, direct comparison otherwise
      const oldStr = oldValue instanceof Date ? oldValue.toISOString() : String(oldValue ?? '');
      const newStr = newValue instanceof Date ? (newValue as Date).toISOString() : String(newValue ?? '');
      if (oldStr !== newStr) {
        changes.push({ field: key, oldValue, newValue });
      }
    }

    const now = new Date();
    // La sesión del UpdateService: tenant del token + usuario SYSTEM (auditoría).
    // isSystemMode saltea permisos/inyección de tenant; el WHERE por id y el
    // findFirst previo (scoped al tenant) garantizan que solo se toca el record
    // autorizado por el token.
    const baseContext = changes.length > 0 ? await createContext(req as any, true) : null;

    // Los cambios (por el UpdateService real de la entidad: la MISMA pila de
    // validación que el guardado normal, requeridos + customValidations/reglas
    // de negocio + unique, que el submit público NO puede saltarse), el asiento
    // del proyecto y la marca de verificado van en UNA transacción: si
    // cualquiera tira, no queda nada aplicado. Lo que el UpdateService difiera
    // al commit (runAfterCommit) sale recién al commitear, y cada intento tiene
    // su propio alcance: lo de un intento que no confirmó se descarta.
    //
    // Solo confirma una verificación que, dentro de la transacción, sigue
    // pendiente: el estado de más arriba se leyó antes, y un doble envío del
    // mismo formulario (doble clic, dos pestañas) llega hasta acá dos veces.
    const confirmOnce = () =>
      runWithTransactionScope(() =>
        basePrisma.$transaction(
          async (tx): Promise<ExternalValidationSubmittedResult> => {
            const current = await tx.emailVerification.findUnique({
              where: { id: record.id },
              select: { status: true },
            });
            if (current?.status !== 'pending') throw new VerificationNotPending(current?.status ?? null);

            if (changes.length > 0 && baseContext) {
              // Args en shape de input GraphQL: refs → `${campo}Id`, escalares directos.
              const serviceArgs: Record<string, any> = {
                id: record.sourceRecordId,
                version_: (oldRecord as any).version_,
              };
              for (const change of changes) {
                const fc = fieldConfigByName[change.field];
                if (fc?.type === 'Ref') {
                  serviceArgs[`${change.field}Id`] = change.newValue || null;
                } else {
                  serviceArgs[change.field] = change.newValue;
                }
              }
              const systemContext = {
                ...baseContext,
                isSystemMode: true,
                currentUser: {
                  id: 'SYSTEM',
                  tenant_id_: record.tenant_id_,
                  tenant_: { id: record.tenant_id_ },
                  roles: [],
                },
                // El UpdateService corre adentro de esta transacción (executeUpdate con txPrisma).
                txPrisma: tx,
              } as unknown as ServiceContext;
              const svcContainer = container.createChildContainer();
              svcContainer.register<ServiceContext>('ServiceContext', { useValue: systemContext });
              svcContainer.register<DependencyContainer>('DependencyContainer', { useValue: svcContainer });
              const updateService: any = svcContainer.resolve(evConfig.updateService);
              await updateService[evConfig.updateMethod](serviceArgs, undefined);
            }

            // Lo que el contacto confirmó, ya normalizado (fechas como Date,
            // referencias como id, un texto vacío de un campo opcional como null):
            // lo recibe el asiento del proyecto, una copia nueva en cada intento.
            const applied: Record<string, unknown> = { ...sanitizedData };

            // El asiento del proyecto, con los cambios ya aplicados y en la transacción.
            // En un reintento corre de nuevo: lo que hizo en el intento que chocó
            // se revirtió con él, y su afterCommit no corre.
            const result =
              (await onExternalValidationSubmitted({
                entityName: evConfig.entityName,
                recordId: record.sourceRecordId as string,
                tenantId: record.tenant_id_,
                verificationId: record.id,
                applied,
                tx,
              })) ?? {};

            // Mark email as verified + store audit trail, solo si sigue pendiente.
            const marked = await tx.emailVerification.updateMany({
              where: { id: record.id, status: 'pending' },
              data: {
                status: 'verified',
                verifiedAt: now,
                validationChanges: changes.length > 0 ? changes : undefined,
                validationSubmittedAt: now,
                version_: randomUUID(),
                lastUpdatedAt_: now,
              },
            });
            if (marked.count !== 1) {
              const after = await tx.emailVerification.findUnique({
                where: { id: record.id },
                select: { status: true },
              });
              throw new VerificationNotPending(after?.status ?? null);
            }
            return result;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 30000,
          }
        )
      );

    let submitted: ExternalValidationSubmittedResult;
    try {
      try {
        submitted = await confirmOnce();
      } catch (err) {
        if (!isTransactionConflict(err)) throw err;
        // Un choque con otra transacción (P2034: crudo, envuelto por el
        // UpdateService o al confirmar): una vez más. Lo más probable es un doble
        // envío del mismo formulario, y el reintento lo ve ya confirmado.
        logger.info({ entity: record.sourceEntity }, 'External validation submit: transaction conflict; retrying once');
        submitted = await confirmOnce();
      }
    } catch (err: any) {
      if (err instanceof VerificationNotPending) {
        // Otro envío la confirmó (o la revocaron, o venció) mientras tanto: la
        // misma respuesta que si ya lo estaba al llegar.
        if (err.status === 'revoked' || err.status === 'expired' || err.status === null) {
          const error = err.status ?? 'not_found';
          return res.status(error === 'not_found' ? 404 : 410).json({ success: false, error });
        }
        return res.json({
          success: true,
          message: 'already_verified',
          tenantInfo: await tenantInfoOf(record, { afterCommit: true }),
        });
      }
      // Un choque que se repitió no es un error del contacto: nunca un 422.
      if (isTransactionConflict(err)) {
        logger.error({ entity: record.sourceEntity, ...errorKind(err) }, 'External validation submit failed; nothing applied');
        return res.status(500).json({ success: false, error: 'internal_error' });
      }
      // ValidationError del server → devolver estructurado para que el form lo
      // muestre por-campo (field/meta) hasta que el usuario corrija.
      const ext = err?.extensions;
      if (ext?.code) {
        const field = invalidFieldOf(err);
        return res.status(422).json({
          success: false,
          error: 'validation_failed',
          code: ext.code,
          ...(field ? { field } : {}),
          message: err.message,
          meta: ext.meta ?? null,
        });
      }
      logger.error({ entity: record.sourceEntity, ...errorKind(err) }, 'External validation submit failed; nothing applied');
      return res.status(500).json({ success: false, error: 'internal_error' });
    }
    const verified = submitted.verified === true;

    // Lo que el asiento dejó para después del commit (lo de afuera de la base que
    // se puede perder sin daño: Redis, caché): el del intento que confirmó, una
    // sola vez, antes del aviso. No es durable (si el proceso muere antes de acá,
    // no corre) y se espera en serie antes del evento en vivo, del aviso y de la
    // respuesta: tiene que ser breve. Si falla, la confirmación queda; al log va
    // sin su mensaje.
    if (typeof submitted.afterCommit === 'function') {
      try {
        await submitted.afterCommit();
      } catch (err) {
        logger.error(
          { entity: record.sourceEntity, ...errorKind(err) },
          'External validation submitted: the afterCommit of the project failed'
        );
      }
    }

    // Publish SSE events (después del commit), en orden: el segundo espera al
    // primero. Con plazo (publishLiveEvents): si Redis no contesta, la respuesta
    // sigue y los dos eventos salen cuando conteste.
    await publishLiveEvents('external validation', record.id, async () => {
      // Email verified event
      await redis.publish(
        'sse:events',
        JSON.stringify({
          type: 'emailVerification.verified',
          tenantId: record.tenant_id_,
          payload: {
            email: maskEmail(record.email),
            verifiedAt: now.toISOString(),
          },
        })
      );

      // External validation submitted: siempre, también sin cambios (el asiento
      // del proyecto pudo cambiar el registro); con el id, para que los
      // formularios abiertos de ese registro lo relean.
      await redis.publish(
        'sse:events',
        JSON.stringify({
          type: 'externalValidation.submitted',
          tenantId: record.tenant_id_,
          payload: {
            email: maskEmail(record.email),
            entityName: record.sourceEntity,
            recordId: record.sourceRecordId,
            changedFields: changes.map(c => c.field),
            verified,
            submittedAt: now.toISOString(),
          },
        })
      );
    });

    // El aviso guardado a los administradores, después del commit, en la empresa
    // de la verificación guardada.
    await notifySiteAdmins({
      evConfig,
      tenantId: record.tenant_id_,
      recordId: record.sourceRecordId as string,
      email: record.email,
      verified,
    });

    logger.info({
      verificationId: record.id,
      entity: record.sourceEntity,
      recordId: record.sourceRecordId,
      changesCount: changes.length,
      verified,
    }, 'External validation submitted');

    return res.json({
      success: true,
      message: 'verified',
      changes: changes.length,
      verified,
      tenantInfo: await tenantInfoOf(record, { afterCommit: true }),
    });
  } catch (error) {
    // Sin el error entero: su mensaje puede traer lo que mandó el contacto.
    logger.error(errorKind(error), 'Error in public/external-validation/submit');
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * POST /api/public/verify-email
 * Public — contact clicks button on landing page (email-only verification).
 */
router.post('/public/verify-email', async (req, res) => {
  try {
    const { vid, sig } = req.body;

    if (!vid || !sig || typeof vid !== 'string' || typeof sig !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_request' });
    }

    const result = await validatePublicRequest(vid, sig);
    if ('error' in result) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    const { record } = result;

    // Ya verificada (idempotente): la respuesta de una verificación ya guardada,
    // como la de más abajo: un asiento que tira no la vuelve un error.
    if (record.status === 'verified') {
      return res.json({
        success: true,
        message: 'already_verified',
        ...(await tenantInfoOf(record, { afterCommit: true })),
      });
    }

    // Mark as VERIFIED
    const now = new Date();
    await basePrisma.emailVerification.update({
      where: { id: record.id },
      data: {
        status: 'verified',
        verifiedAt: now,
        version_: randomUUID(),
        lastUpdatedAt_: now,
      },
    });

    // Publish SSE event, con plazo (publishLiveEvents): la verificación ya quedó guardada.
    await publishLiveEvents('email verification', record.id, () =>
      redis.publish(
        'sse:events',
        JSON.stringify({
          type: 'emailVerification.verified',
          tenantId: record.tenant_id_,
          payload: {
            email: maskEmail(record.email),
            verifiedAt: now.toISOString(),
          },
        })
      )
    );

    logger.info({ verificationId: record.id }, 'Email verified');

    // Después del update la verificación ya quedó guardada: lo que falle al armar la
    // respuesta (el asiento senderDisplayName) no la vuelve un 500.
    return res.json({
      success: true,
      message: 'verified',
      ...(await tenantInfoOf(record, { afterCommit: true })),
    });
  } catch (error) {
    logger.error(errorKind(error), 'Error in public/verify-email');
    return res.status(500).json({ success: false, error: 'internal_error' });
  }
});

export default router;
