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
import { NotFoundError } from '../common/errors/NotFoundError';
import {
  generateVerificationSignature,
  verifySignature,
  buildVerificationUrl,
  maskEmail,
  normalizeEmail,
  verificationScopeOf,
  EmailVerificationScopeValue,
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
// Un campo `date` es un día de calendario ("AAAA-MM-DD", sin hora ni zona).
import { calendarDateToDate, diaDeCalendario, isCalendarDate } from '../common/utils/calendarDate';
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
 * Si el proyecto declara el campo scope de EmailVerification: lo que pide el
 * enlace vigente, verificar solo el email ('email') o además validar los datos
 * del registro al que apunta ('data'). Sin el campo, el alcance se deduce de
 * sourceEntity y sourceRecordId (verificationScopeOf), como antes de existir.
 * Se mira en cada pedido (es una lectura barata), no al cargar el módulo.
 */
const hasScopeColumn = (): boolean => 'scope' in Prisma.EmailVerificationScalarFieldEnum;

/** El scope guardado, en un proyecto que puede no declararlo. */
const storedScopeOf = (record: object): string | null =>
  (record as { scope?: string | null }).scope ?? null;

/**
 * La escritura condicionada del envío no encontró la verificación como se leyó
 * (SecurePrismaOps no la encuentra, o Prisma no actualiza nada: P2025) o el alta
 * chocó con la de otro envío al mismo email (P2002): otro envío ganó.
 */
const otherSendWon = (error: unknown): boolean => {
  if (error instanceof NotFoundError) return true;
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === 'P2025' || code === 'P2002';
};

/**
 * Los datos de este registro ya están validados en esta verificación: apunta a
 * él y el contacto envió el formulario de datos (validationSubmittedAt). Un
 * email verificado por otro origen (otro registro, o solo el email) no cuenta.
 */
const dataValidatedFor = (
  record: { sourceEntity: string | null; sourceRecordId: string | null; validationSubmittedAt: Date | null },
  sourceEntity: string,
  sourceRecordId: unknown
): boolean =>
  record.sourceEntity === sourceEntity && record.sourceRecordId === sourceRecordId && record.validationSubmittedAt != null;

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
    scope?: string | null;
    sourceEntity: string | null;
    sourceRecordId: string | null;
    tenant_: { id: string; name: string | null; logo_data: any } | null;
  },
  options: { afterCommit?: boolean } = {}
) {
  let tenantName: string;
  try {
    // El nombre de la validación de datos solo si el enlace vigente la pide: un
    // envío de solo email sobre una verificación que antes fue de datos se
    // presenta con el de la empresa, como el mail que lo pidió.
    tenantName = await shownTenantName(record.tenant_, verificationScopeOf(record) === 'data');
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
 * El enlace dejó de pedir la validación de datos de este registro entre que se
 * cargó la verificación y la transacción de la confirmación (un envío de solo
 * email, o uno de datos para otro registro, con el mismo enlace): no se aplica
 * nada.
 */
class VerificationScopeChanged extends Error {
  constructor() {
    super('Email verification no longer asks for this data validation');
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
 * Los campos `date` (día de calendario) del registro, como "AAAA-MM-DD": Prisma los
 * da como el Date de su medianoche UTC, y por JSON saldrían con hora.
 */
function withCalendarDays(entityRecord: Record<string, unknown>, evConfig: ExternalValidationConfig): Record<string, unknown> {
  const out: Record<string, unknown> = { ...entityRecord };
  for (const field of evConfig.fields) {
    if (field.type === 'Date' && field.name in out) {
      out[field.name] = diaDeCalendario(out[field.name] as Date | string | null | undefined);
    }
  }
  return out;
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
 * Body: { email: string, sourceEntity: string, sourceRecordId?: string, resend?: boolean, scope?: 'email' | 'data' }
 *
 * scope dice qué pide el enlace: 'email', verificar solo la dirección; 'data'
 * (por defecto), además validar los datos del registro, si la entidad tiene
 * validación de datos y hay sourceRecordId (si no, es 'email'). Un pedido de
 * solo email nunca toca lo de la validación de datos (sourceEntity,
 * sourceRecordId, validationSubmittedAt, validationChanges): no marca datos ni
 * pisa una validación anterior.
 *
 * Respuestas: { success, status: 'sent' | 'already_verified' | 'already_validated', scope }.
 * Errores propios: 400 invalid_scope; 409 data_validation_pending (solo email
 * con una validación de datos pendiente, que ya verifica el email al enviarse);
 * 409 scope_not_supported (solo email sobre una verificación de datos, en un
 * proyecto sin el campo scope: el enlace abriría el formulario de datos); 409
 * concurrent_send (otro envío al mismo email cambió o creó la verificación entre
 * la lectura y la escritura: no se escribe ni se manda nada).
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
    const { email, sourceEntity, sourceRecordId, resend, scope: requestedScope } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'invalid_email' });
    }
    if (!sourceEntity || typeof sourceEntity !== 'string') {
      return res.status(400).json({ success: false, error: 'invalid_source_entity' });
    }
    if (requestedScope != null && requestedScope !== 'email' && requestedScope !== 'data') {
      return res.status(400).json({ success: false, error: 'invalid_scope' });
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

    // El alcance del pedido: 'data' si no pide solo el email, apunta a un
    // registro y la entidad tiene validación de datos; si no, 'email'. Sin scope
    // en el cuerpo, como antes de existir el campo.
    const scope: EmailVerificationScopeValue =
      requestedScope !== 'email' && sourceRecordId && externalValidationRegistry[sourceEntity] ? 'data' : 'email';
    const hasDataValidation = scope === 'data';
    const withScope = hasScopeColumn();

    // Look up existing verification for (email, tenant) — tenant filter applied by SecurePrismaOps
    let record = await db.findFirst({
      where: { email: normalized },
    });
    // Lo que pide el enlace vigente de la verificación guardada.
    const recordScope = record ? verificationScopeOf(record) : null;
    const now = new Date();

    // Sin el campo scope, el alcance se deduce de sourceEntity y sourceRecordId,
    // que un pedido de solo email no borra: el enlace abriría el formulario de datos.
    if (!withScope && scope === 'email' && recordScope === 'data') {
      return res.status(409).json({ success: false, error: 'scope_not_supported' });
    }

    // Ya hecho (sin resend): el email ya verificado, o los datos de este registro
    // ya validados con el email verificado. Un email verificado por otro origen
    // no frena la validación de datos.
    if (record && record.status === 'verified' && !resend) {
      if (scope === 'email') {
        return res.json({
          success: true,
          status: 'already_verified',
          verifiedAt: record.verifiedAt,
          scope,
        });
      }
      if (dataValidatedFor(record, sourceEntity, sourceRecordId)) {
        return res.json({
          success: true,
          status: 'already_validated',
          verifiedAt: record.verifiedAt,
          validationSubmittedAt: record.validationSubmittedAt,
          scope,
        });
      }
    }

    // Una validación de datos pendiente (sin vencer) ya verifica el email al
    // enviarse: un pedido de solo email la reemplazaría (el enlace es el mismo).
    if (
      scope === 'email' &&
      record &&
      record.status === 'pending' &&
      recordScope === 'data' &&
      !(record.expiresAt && record.expiresAt < now)
    ) {
      return res.status(409).json({ success: false, error: 'data_validation_pending' });
    }

    // Cooldown: minimum 5 minutes between sends (un reenvío pedido no lo espera).
    if (record && !resend && record.lastSentAt) {
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

    const expiresAt = new Date(now.getTime() + EXPIRATION_HOURS * 60 * 60 * 1000);

    // Lo que pide el enlace, si el proyecto declara el campo.
    const scopeFields: Record<string, any> = withScope ? { scope } : {};
    // Con 'data', el registro al que apunta. La validación hecha (fecha y cambios)
    // queda mientras siga apuntando al mismo registro; si pasa a otro, se borra:
    // era de aquel. Con 'email' no se toca nada de esto.
    const sourceFields: Record<string, any> = {};
    if (hasDataValidation) {
      sourceFields.sourceEntity = sourceEntity;
      sourceFields.sourceRecordId = sourceRecordId;
      if (record && (record.sourceEntity !== sourceEntity || record.sourceRecordId !== sourceRecordId)) {
        sourceFields.validationChanges = Prisma.DbNull;
        sourceFields.validationSubmittedAt = null;
      }
    }

    // Que dos envíos simultáneos no se pisen: la escritura vale solo si la
    // verificación sigue como se leyó (el mismo estado, el mismo último envío y lo
    // mismo pedido), como la marca de verify-email. Si en el medio otro envío (o
    // la verificación, o el vencimiento) la cambió, o la creó, no se escribe ni se
    // manda nada: 409 concurrent_send. Sin esto, un pedido de solo email podía
    // dejar scope: email justo después de un pedido de datos ya enviado por mail.
    try {
      if (!record) {
        // Create new PENDING record — tenant + audit fields injected by SecurePrismaOps.
        // Si otro envío la creó en el medio, choca con (empresa, email): P2002.
        record = await db.create({
          data: {
            email: normalized,
            status: 'pending',
            expiresAt,
            sentAt: now,
            sentCount: 1,
            lastSentAt: now,
            requestedBy: { connect: { id: userId } },
            ...scopeFields,
            ...sourceFields,
          },
        });
      } else {
        // Update existing: un enlace nuevo, pendiente (el email deja de estar
        // verificado hasta que se use), new expiration, increment sentCount (audit
        // fields auto-injected). Si la verificación ya no está como se leyó,
        // SecurePrismaOps no la encuentra (NotFoundError) o Prisma no actualiza
        // nada (P2025).
        record = await db.update({
          where: {
            id: record.id,
            status: record.status,
            lastSentAt: record.lastSentAt,
            sourceEntity: record.sourceEntity,
            sourceRecordId: record.sourceRecordId,
            ...((withScope ? { scope: storedScopeOf(record) } : {}) as {}),
          },
          data: {
            status: 'pending',
            verifiedAt: null,
            expiresAt,
            sentAt: now,
            sentCount: { increment: 1 },
            lastSentAt: now,
            requestedBy: { connect: { id: userId } },
            ...scopeFields,
            ...sourceFields,
          },
        });
      }
    } catch (error) {
      if (!otherSendWon(error)) throw error;
      logger.info({ tenantId, verificationId: record?.id }, 'Email verification send: changed by a concurrent send; nothing written');
      return res.status(409).json({ success: false, error: 'concurrent_send' });
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

    return res.json({ success: true, status: 'sent', scope });
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

    // Check if this has external validation data: solo si el enlace vigente pide
    // los datos (un envío de solo email sobre una verificación que antes fue de
    // datos abre la página del email).
    const evConfig =
      verificationScopeOf(record) === 'data' && record.sourceEntity
        ? externalValidationRegistry[record.sourceEntity]
        : null;

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
          entityData: withCalendarDays(entityRecord, evConfig),
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

    // Must have source entity + record, y que el enlace vigente pida los datos: un
    // envío de solo email (aunque la verificación apunte a un registro de antes)
    // no acepta el formulario. Antes que "ya confirmada": un email verificado con
    // un enlace de solo email no es una confirmación de datos.
    if (verificationScopeOf(record) !== 'data' || !record.sourceEntity || !record.sourceRecordId) {
      return res.status(400).json({ success: false, error: 'no_validation_context' });
    }

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
            // Un día de calendario: solo "AAAA-MM-DD" de un día que existe. Al servicio
            // va el Date de su medianoche UTC, que es lo que Prisma escribe en la
            // columna date: la zona del proceso no interviene. En blanco, null (en uno
            // obligatorio, el UpdateService lo rechaza como faltante).
            if (value == null || (typeof value === 'string' && value.trim() === '')) {
              coerced = null;
            } else if (isCalendarDate(value)) {
              coerced = calendarDateToDate(value);
            } else {
              rejectedFields.push(key); continue;
            }
            break;
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
    // Un día de calendario se compara por su texto ("AAAA-MM-DD"): lo guardado a otra
    // hora del mismo día (un dato de antes de la fecha sin hora) no es un cambio. Las
    // demás fechas, por su instante; lo demás, como texto.
    const asText = (fc: ExternalValidationFieldConfig | undefined, v: unknown): string =>
      fc?.type === 'Date'
        ? diaDeCalendario(v as Date | string | null | undefined) ?? ''
        : v instanceof Date ? v.toISOString() : String(v ?? '');
    for (const [key, newValue] of Object.entries(sanitizedData)) {
      const fc = fieldConfigByName[key];
      const dbKey = fc?.type === 'Ref' ? `${key}_id` : key;
      const oldValue = oldRecord[dbKey];
      if (asText(fc, oldValue) !== asText(fc, newValue)) {
        changes.push({ field: key, oldValue, newValue });
      }
    }

    // El registro de cambios guarda un día de calendario como "AAAA-MM-DD" (sin hora);
    // al UpdateService le siguen llegando los valores de changes (el Date del día).
    const auditChange = (c: { field: string; oldValue: any; newValue: any }) =>
      fieldConfigByName[c.field]?.type === 'Date'
        ? { ...c, oldValue: diaDeCalendario(c.oldValue), newValue: diaDeCalendario(c.newValue) }
        : c;

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
    // mismo formulario (doble clic, dos pestañas) llega hasta acá dos veces. Y
    // solo si el enlace sigue pidiendo los datos de este registro: entre la carga
    // y acá pudo salir otro envío con el mismo enlace (de solo email, o de datos
    // para otro registro).
    const confirmOnce = () =>
      runWithTransactionScope(() =>
        basePrisma.$transaction(
          async (tx): Promise<ExternalValidationSubmittedResult> => {
            const current = await tx.emailVerification.findUnique({
              where: { id: record.id },
              select: {
                status: true,
                sourceEntity: true,
                sourceRecordId: true,
                ...((hasScopeColumn() ? { scope: true } : {}) as {}),
              },
            });
            if (current?.status !== 'pending') throw new VerificationNotPending(current?.status ?? null);
            if (
              verificationScopeOf(current) !== 'data' ||
              current.sourceEntity !== record.sourceEntity ||
              current.sourceRecordId !== record.sourceRecordId
            ) {
              throw new VerificationScopeChanged();
            }

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
                // Sin cambios, vacío: no queda el diff de una validación anterior
                // junto a la fecha de esta.
                validationChanges: changes.length > 0 ? changes.map(auditChange) : Prisma.DbNull,
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
      if (err instanceof VerificationScopeChanged) {
        return res.status(409).json({ success: false, error: 'scope_changed' });
      }
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
 *
 * Solo con un enlace de solo email: uno que pide los datos se confirma con el
 * formulario (external-validation/submit), nunca acá (409
 * data_validation_required). Nunca toca lo de la validación de datos.
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

    if (verificationScopeOf(record) === 'data') {
      return res.status(409).json({ success: false, error: 'data_validation_required' });
    }

    // Mark as VERIFIED, solo si nada cambió desde que se leyó: sigue pendiente y
    // con el mismo alcance (otro envío con el mismo enlace pudo pedir los datos).
    const now = new Date();
    const marked = await basePrisma.emailVerification.updateMany({
      where: {
        id: record.id,
        status: 'pending',
        sourceEntity: record.sourceEntity,
        sourceRecordId: record.sourceRecordId,
        ...((hasScopeColumn() ? { scope: storedScopeOf(record) } : {}) as {}),
      },
      data: {
        status: 'verified',
        verifiedAt: now,
        version_: randomUUID(),
        lastUpdatedAt_: now,
      },
    });
    if (marked.count !== 1) {
      const after = await basePrisma.emailVerification.findUnique({
        where: { id: record.id },
        select: { status: true },
      });
      if (after?.status === 'verified') {
        return res.json({
          success: true,
          message: 'already_verified',
          ...(await tenantInfoOf(record, { afterCommit: true })),
        });
      }
      if (!after) return res.status(404).json({ success: false, error: 'not_found' });
      if (after.status === 'revoked' || after.status === 'expired') {
        return res.status(410).json({ success: false, error: after.status });
      }
      return res.status(409).json({ success: false, error: 'scope_changed' });
    }

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
