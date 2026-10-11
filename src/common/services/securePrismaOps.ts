/**
 * @file securePrismaOps.ts
 * @description Defines the SecurePrismaOps class, a generic data access layer
 * that enforces permissions, tenancy rules, relation validation, include/select pruning,
 * AND injects standard audit fields (version_, createdBy_, etc.).
 * This class is intended to be instantiated manually by specific entity services,
 * receiving necessary dependencies like ServiceContext and PrismaClient.
 */

import { PrismaClient } from "../../prisma/generated-client/client";
import { ServiceContext } from "../../service-context";
import { UnauthorizedError, NotFoundError, ValidationError } from "../errors";
import {
  SchemaMetadataMap,
  ModelMetadata,
  SchemaMetadataStore,
} from "./schemaMetadata";
import { cloneDeep, isPlainObject } from "lodash";
import { randomUUID } from "crypto";
import type { Prisma as PrismaNS } from "../../prisma/generated-client/client";
import { deriveVersion, SaveAttempt } from "./saveRetry";

// --- Importar el Event Bus ---
import { publishEvent, getChangedFields, PrismaAction } from "./eventBus"; // Ajusta la ruta según tu estructura

// --- Type Aliases ---

type PrismaModelName = PrismaNS.ModelName;
// Get the specific Prisma delegate type instance (e.g., typeof prisma.user)
type Delegate<M extends PrismaModelName> = PrismaClient[Uncapitalize<M>];
// Get the complete Arguments type for a specific action on a model delegate
type Args<
  M extends PrismaModelName,
  A extends PrismaNS.PrismaAction
> = PrismaNS.Args<Delegate<M>, A>;
// Get the Select type for a model (example using findMany args)
type SelectInput<M extends PrismaModelName> = PrismaNS.Args<
  Delegate<M>,
  "findMany"
>["select"];

// --- Campos que jamás salen del backend ---
// Denylist base con los campos de auth de User (password, secreto y códigos de 2FA,
// token de reset) y el hash del token de dispositivo de confianza (TrustedDevice).
// Hoy se ocultan SOLO por no figurar en el SDL: no son campos del DSL, así que no
// están en secretFieldNames. Login, 2FA y device-trust los leen con el PrismaClient
// crudo (this.prisma.user.*, this.prisma.trustedDevice.*), nunca por esta capa, así
// que redactarlos acá no rompe la autenticación — solo cierra el path genérico de
// lectura, donde un campo con este nombre no tiene uso legítimo. Son nombres
// globalmente inequívocos, por eso el barrido profundo (_deepDeleteDenylisted) puede
// borrarlos a cualquier nivel sin riesgo de pisar un campo legítimo homónimo.
// (RefreshToken.token —el token crudo— vive fuera de esta capa: RefreshTokenService
//  lo lee con prisma crudo; no se agrega "token" por ser un nombre demasiado común.)
const ALWAYS_REDACTED_FIELDS: readonly string[] = [
  "password",
  "twoFaSecret",
  "twoFaBackupCodes",
  "passwordResetToken",
  "tokenHash",
];

// --- SecurePrismaOps Class ---

// NOTE: This class is NOT managed by DI (@injectable) itself.
// It's instantiated manually by injectable services (like ObraService).
export class SecurePrismaOps<M extends PrismaModelName> {
  // --- Properties ---
  private readonly context: ServiceContext;
  private readonly prisma: PrismaClient; // Base or Transactional Client
  private readonly schemaMetadataStoreInstance: SchemaMetadataStore;
  private readonly modelNamePascal: M;
  private readonly modelNameCamel: Uncapitalize<M>;
  private readonly prismaDelegate: Delegate<M>;
  private readonly modelMeta: ModelMetadata | undefined;
  private readonly allSchemaMeta: SchemaMetadataMap;
  /** Señal POR-OPERACIÓN (instancia derivada vía forAllTenants(), jamás mutación
   *  del contexto): esta lectura pidió cruce de tenants (modo onRequest). */
  private allTenantsRequested = false;
  /** Empresa destino pedida por `forTenant`. undefined = la de quien escribe. */
  private writeTenantId: string | undefined = undefined;

  /** ¿El usuario actual tiene un rol con privilegio cross-tenant sobre el modelo? */
  private hasCrossTenantRole(meta: ModelMetadata | undefined): boolean {
    const ct = meta?.crossTenantForRoles;
    if (!ct) return false;
    const userRoles =
      this.context.currentUser?.roles?.map((r: any) => r.id) ?? [];
    return userRoles.some((r: string) => ct.roles.includes(r));
  }

  /**
   * ¿Este usuario puede leer cruzando empresas sobre este modelo?
   *
   * Espejo NO-LANZANTE de `forAllTenants()`, para el llamador que necesita
   * DECIDIR si pedir el privilegio en vez de intentarlo y atajar la excepción.
   * Lee las MISMAS dos condiciones que el guard —que el modelo lo declare y que
   * el rol esté entre los declarados—, así que si esto devuelve true,
   * `forAllTenants()` no tira. Que las dos se muevan juntas es la única razón
   * por la que este predicado puede existir: preguntar por un lado y autorizar
   * por otro es cómo un privilegio queda concedido sin estar declarado.
   */
  canForAllTenants(): boolean {
    return (
      !!this.modelMeta?.crossTenantForRoles &&
      this.hasCrossTenantRole(this.modelMeta)
    );
  }

  /**
   * Devuelve una instancia DERIVADA que omite el filtro de tenant en las lecturas
   * (privilegio administrativo crossTenantForRoles en modo onRequest). Valida el
   * privilegio acá: pedir allTenants sin rol autorizado es un error explícito.
   * No muta ni el contexto ni esta instancia.
   */
  forAllTenants(): SecurePrismaOps<M> {
    if (!this.modelMeta?.crossTenantForRoles) {
      throw new UnauthorizedError(
        `allTenants no soportado para ${this.modelNamePascal}`
      );
    }
    if (!this.hasCrossTenantRole(this.modelMeta)) {
      throw new UnauthorizedError(
        `allTenants requiere un rol autorizado (${this.modelMeta.crossTenantForRoles.roles.join(
          ", "
        )}) para ${this.modelNamePascal}`
      );
    }
    const derived = Object.create(
      Object.getPrototypeOf(this)
    ) as SecurePrismaOps<M>;
    Object.assign(derived, this);
    (derived as any).allTenantsRequested = true;
    return derived;
  }

  /**
   * La empresa en la que ESCRIBIR, para las altas administrativas cross-tenant.
   *
   * Espejo de `forAllTenants()`, y por el mismo motivo: el privilegio se pide
   * en el call site, donde se puede auditar, y no viajando como una clave más
   * del payload. Un nombre mágico dentro de `data` no se ve al leer el código
   * que llama, y no se distingue de un campo de negocio homónimo.
   *
   * Valida acá, como la lectura: sin `crossTenantForRoles` o sin el rol, es un
   * error explícito. No muta ni el contexto ni esta instancia.
   */
  forTenant(tenantId: string): SecurePrismaOps<M> {
    const habilitados = this.modelMeta?.tenantSelectableBy;
    if (!habilitados || habilitados.length === 0) {
      throw new UnauthorizedError(
        `Escribir en otra empresa no está habilitado para ${this.modelNamePascal}`
      );
    }
    const rolesDelUsuario =
      this.context.currentUser?.roles?.map((r: any) => r.id) ?? [];
    if (!rolesDelUsuario.some((r: string) => habilitados.includes(r))) {
      throw new UnauthorizedError(
        `Escribir en otra empresa requiere un rol autorizado (${habilitados.join(
          ", "
        )}) para ${this.modelNamePascal}`
      );
    }
    const derived = Object.create(
      Object.getPrototypeOf(this)
    ) as SecurePrismaOps<M>;
    Object.assign(derived, this);
    (derived as any).writeTenantId = tenantId;
    return derived;
  }

  /**
   * La empresa sobre la que opera esta instancia.
   *
   * Una sola fuente para las tres inyecciones —raíz, upsert y anidados—, para
   * la validación de relaciones y para el evento: que difieran entre sí es lo
   * que produce un registro partido entre dos empresas. Sin `forTenant` es la
   * de quien opera, así que no cambia nada de lo que ya existía.
   */
  private get tenantEfectivo(): string | undefined {
    return this.writeTenantId ?? this.context.currentUser?.tenant_id_;
  }

  /**
   * Creates an instance of SecurePrismaOps.
   * @param context The request-specific ServiceContext.
   * @param prisma The base PrismaClient instance (or transactional client).
   * @param schemaMetadataStore The initialized singleton instance of SchemaMetadataStore.
   * @param modelName The PascalCase name of the Prisma model this instance manages.
   * @param config Configuration options, including the multitenancy flag.
   */
  constructor(
    context: ServiceContext,
    prisma: PrismaClient, // Can also accept Prisma.TransactionClient
    schemaMetadataStore: SchemaMetadataStore, // Expects the CLASS INSTANCE
    modelName: M,
    _config: {}
  ) {
    this.context = context;
    this.prisma = prisma;
    this.schemaMetadataStoreInstance = schemaMetadataStore;
    this.modelNamePascal = modelName;

    // --- Constructor Validations ---
    if (
      !this.context ||
      !this.prisma ||
      !this.schemaMetadataStoreInstance ||
      !this.modelNamePascal
    ) {
      throw new Error(
        "SecurePrismaOps constructor received invalid or missing arguments."
      );
    }
    // Validate the received SchemaMetadataStore instance before using it
    if (
      !(this.schemaMetadataStoreInstance instanceof SchemaMetadataStore) ||
      typeof this.schemaMetadataStoreInstance.getAll !== "function"
    ) {
      console.error(
        "SecurePrismaOps received an invalid SchemaMetadataStore object:",
        this.schemaMetadataStoreInstance
      );
      throw new TypeError(
        `SecurePrismaOps received an invalid SchemaMetadataStore object for ${modelName}. Expected instance of SchemaMetadataStore.`
      );
    }

    // --- Initialize Properties ---
    try {
      // Get all metadata using the validated instance method
      this.allSchemaMeta = this.schemaMetadataStoreInstance.getAll();
    } catch (e) {
      console.error(
        "[SecurePrismaOps Constructor] ERROR calling getAll() on SchemaMetadataStore instance:",
        e
      );
      throw e; // Re-throw critical error
    }

    this.modelNameCamel = this.pascalToCamelCase(modelName) as Uncapitalize<M>;
    // Assign the specific delegate using the PASSED prisma instance
    this.prismaDelegate = this.prisma[this.modelNameCamel] as Delegate<M>;
    if (!this.prismaDelegate) {
      throw new Error(
        `[SecurePrismaOps] Prisma delegate not found for model: ${modelName} (tried '${this.modelNameCamel}')`
      );
    }

    this.modelMeta = this.allSchemaMeta.get(this.modelNamePascal);
    if (!this.modelMeta) {
      console.warn(
        `[SecurePrismaOps] Schema metadata not found for model: ${this.modelNamePascal}. Tenant/relation features might be limited.`
      );
    }
  }

  // --- Internal Audit Field Injection Helpers ---

  /** Injects creation audit fields into a single data item if userId exists. */
  private _injectCreateAuditFields(item: any): void {
    if (item && typeof item === "object") {
      const now = new Date();
      const userId = this.context.currentUser?.id;
      if (!userId) return; // Safety check - caller already validated

      item.version_ = item.version_ ?? randomUUID();
      item.createdAt_ = item.createdAt_ ?? now;
      item.createdBy_ = item.createdBy_ ?? { connect: { id: userId } };
      item.lastUpdatedAt_ = item.lastUpdatedAt_ ?? now;
      item.lastUpdatedBy_ = item.lastUpdatedBy_ ?? { connect: { id: userId } };
    }
  }

  /**
   * Injects update audit fields into a single data item if userId exists. La
   * versión nueva, al azar; o la que deriva de la versión leída y la clave de
   * idempotencia del guardado (ver common/services/saveRetry), si llegan.
   */
  private _injectUpdateAuditFields(item: any, version?: string): void {
    if (item && typeof item === "object") {
      const now = new Date();
      const userId = this.context.currentUser?.id;
      if (!userId) return; // Safety check - caller already validated

      item.version_ = version ?? randomUUID();
      item.lastUpdatedAt_ = now;
      item.lastUpdatedBy_ = { connect: { id: userId } };
    }
  }

  /**
   * Processes a 'create' block (object or array), injecting necessary context fields (tenant + audit)
   * for creation, and then calls the main recursive injector for further nested structures.
   * Modifies the `createData` object/array in-place.
   * @param createData The data for the create operation (can be an object or array of objects).
   * @param relatedModelMeta Metadata for the model(s) being created in this block.
   */
  private _processAndRecurseCreateBlockForContext(
    createData: any,
    relatedModelMeta: ModelMetadata | undefined
  ): void {
    if (!createData || typeof createData !== "object") return;
    const userId = this.context.currentUser?.id;
    const tenantId = this.tenantEfectivo;

    // Pre-check if context is sufficient for injection (if not system mode)
    if (!this.context.isSystemMode) {
      if (!userId)
        throw new Error(
          "Audit/Tenant Error: User ID missing for nested create block processing."
        );
      // Check tenantId only if multitenant AND the specific related model needs a tenant
      if (relatedModelMeta?.tenantIdField && !tenantId) {
        throw new Error(
          `Tenant Error: Tenant ID missing for nested create block on tenant-aware model ${relatedModelMeta?.modelName}.`
        );
      }
    }

    // Helper to inject all necessary fields for a single item being created
    const injectAllCreateContext = (item: any) => {
      if (item && typeof item === "object") {
        // Inject Create Audit Fields (handles isSystemMode internally)
        this._injectCreateAuditFields(item);

        // Inject Tenant Field (if applicable and not system mode)
        if (
          !this.context.isSystemMode &&
          tenantId &&
          relatedModelMeta?.tenantIdField
        ) {
          // Fail-closed: se BORRA lo que venga y se asigna siempre.
          //
          // La versión anterior inyectaba solo si el campo faltaba, así que un
          // `tenant_id_` ajeno en el hijo pasaba derecho: el padre nacía bien y
          // el hijo en otra empresa, sin ningún error. Un registro partido en
          // dos, que es peor que un rechazo.
          //
          // Acá no hay caso legítimo que preservar: los hijos de una creación
          // anidada pertenecen, por definición, a la misma empresa que el padre.
          // Quien necesite escribir en otra tiene el modo sistema.
          delete item[relatedModelMeta.tenantIdField];
          item.tenant_ = { connect: { id: tenantId } };
        }
        // After injecting this item, recurse into it for further nested creates
        this._recursiveInjectNestedCreateContext(item, relatedModelMeta);
      }
    };

    if (Array.isArray(createData)) {
      createData.forEach(injectAllCreateContext);
    } else {
      injectAllCreateContext(createData);
    }
  }

  /**
   * Recursively traverses a data payload (for create or update operations) and injects
   * tenant and creation audit fields into any nested 'create', 'connectOrCreate.create',
   * or 'upsert.create' blocks found under relation keys.
   * Modifies the `data` object in-place.
   * @param data The data object/array to traverse.
   * @param parentMeta Metadata of the PARENT model whose data is being traversed.
   */
  private _recursiveInjectNestedCreateContext(
    data: any,
    parentMeta: ModelMetadata | undefined
  ): void {
    // Base cases: no data, not an object, or parent has no relations to look for.
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      !parentMeta?.relations ||
      parentMeta.relations.size === 0
    ) {
      return;
    }
    // No injection needed in system mode.
    if (this.context.isSystemMode) return;

    // Keys to completely ignore during traversal for injection purposes (structural or non-data)
    const nonDataKeys = new Set([
      "where",
      "select",
      "include",
      "orderBy",
      "connect",
      "disconnect",
      "set",
      "skip",
      "take",
      "cursor",
      "_count",
      "tenant_",
      "tenant_id_",
    ]);

    for (const key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      const value = data[key];
      if (nonDataKeys.has(key)) continue;

      // Is the current key ('key') a known relation field of the 'parentMeta' model?
      const relationMeta = parentMeta.relations.get(key);
      if (relationMeta && value && typeof value === "object") {
        const relatedModelMeta = this.allSchemaMeta.get(
          relationMeta.relatedModelName
        );
        if (value.create) {
          this._processAndRecurseCreateBlockForContext(
            value.create,
            relatedModelMeta
          );
        }
        if (value.connectOrCreate) {
          const cocList = Array.isArray(value.connectOrCreate)
            ? value.connectOrCreate
            : [value.connectOrCreate];
          cocList.forEach((coc: any) =>
            this._processAndRecurseCreateBlockForContext(
              coc?.create,
              relatedModelMeta
            )
          );
        }
        if (value.upsert) {
          const upsertList = Array.isArray(value.upsert)
            ? value.upsert
            : [value.upsert];
          upsertList.forEach((up: any) => {
            this._processAndRecurseCreateBlockForContext(
              up?.create,
              relatedModelMeta
            );
            if (up?.update)
              this._recursiveInjectNestedCreateContext(
                up.update,
                relatedModelMeta
              );
          });
        }
        // If nested update operations can also contain creates (e.g., update.data.nestedCreate)
        if (value.update) {
          const updateList = Array.isArray(value.update)
            ? value.update
            : [value.update];
          updateList.forEach((up: any) => {
            if (up?.data && typeof up.data === "object")
              this._recursiveInjectNestedCreateContext(
                up.data,
                relatedModelMeta
              );
          });
        }
        if (value.updateMany) {
          const updateManyList = Array.isArray(value.updateMany)
            ? value.updateMany
            : [value.updateMany];
          updateManyList.forEach((um: any) => {
            if (um?.data && typeof um.data === "object")
              this._recursiveInjectNestedCreateContext(
                um.data,
                relatedModelMeta
              );
          });
        }
      } else if (
        !relationMeta &&
        value &&
        typeof value === "object" &&
        key === "data"
      ) {
        this._recursiveInjectNestedCreateContext(value, parentMeta);
      }
    }
  }

  // --- Internal Security Helper Methods ---

  /** Converts PascalCase to camelCase. */
  private pascalToCamelCase(str: string): string {
    if (!str) return "";
    return str[0].toLowerCase() + str.slice(1);
  }

  /**
   * Verifica el permiso SIN consultar la base.
   *
   * Existe para que las escrituras lo comprueben ANTES de correr las
   * validaciones custom del proyecto. Hasta que se expuso, el chequeo vivía
   * dentro de la operación segura —que se invoca después de los validadores—,
   * así que alguien sin permiso sobre la entidad igual disparaba código del
   * proyecto y sus consultas. Una lectura de esas moldea el mensaje de error:
   * un oráculo sobre datos que el usuario no puede ver.
   */
  assertCan(action: "create" | "retrieve" | "update" | "delete"): void {
    this.checkPermission(
      `_${action}` as "_create" | "_retrieve" | "_update" | "_delete"
    );
  }

  /** Checks if the current user has the required permission for the action. Throws UnauthorizedError if not. */
  private checkPermission(
    actionSuffix: "_create" | "_retrieve" | "_update" | "_delete"
  ): void {
    const permission = `${this.modelNameCamel}${actionSuffix}`;
    if (
      !this.context.isSystemMode &&
      !this.context.permissions().has(permission)
    ) {
      console.warn(
        `[Permission Denied] User ${this.context.currentUser?.id} lacks permission: ${permission} for ${this.modelNamePascal}`
      );
      throw new UnauthorizedError(
        `Permission denied: '${permission}' required for ${this.modelNamePascal}.`
      );
    }
  }

  /** Builds the secure WHERE clause for checking accessibility of a related record or the current model. */
  private buildTenantFilterForRelatedModel(
    modelName: PrismaModelName,
    originalWhere: any
  ): any {
    let where = cloneDeep(originalWhere) ?? {};
    if (!this.context.isSystemMode) {
      // La empresa destino, no la del operador: un alta administrativa conecta
      // relaciones de la empresa en la que escribe.
      const currentTenantId = this.tenantEfectivo;
      const targetMeta = this.allSchemaMeta.get(modelName);
      const tenantIdFieldOnTarget = targetMeta?.tenantIdField;
      const hybridFlagFieldOnTarget = targetMeta?.hybridTenantFlagField;

      // Privilegio administrativo cross-tenant (crossTenantForRoles): omite SOLO
      // el filtro de tenant — permisos y demás validaciones siguen intactos.
      // "always": automático para el rol (entidades de administración del sistema).
      // "onRequest": solo si la operación lo pidió (forAllTenants / arg allTenants).
      const crossTenant = targetMeta?.crossTenantForRoles;
      const crossTenantGranted =
        !!crossTenant &&
        this.hasCrossTenantRole(targetMeta) &&
        (crossTenant.mode === "always" || this.allTenantsRequested);
      if (
        crossTenantGranted &&
        (tenantIdFieldOnTarget || hybridFlagFieldOnTarget)
      ) {
        console.info(
          `[SecurePrismaOps] cross-tenant read: user=${
            this.context.currentUser?.id
          } model=${modelName} mode=${crossTenant!.mode}`
        );
      }

      // Only apply tenant filters if the target model is actually tenant-aware
      if (
        !crossTenantGranted &&
        (tenantIdFieldOnTarget || hybridFlagFieldOnTarget)
      ) {
        if (!currentTenantId) {
          // This context must have a tenantId if filtering is to occur
          throw new Error(
            `[SecurePrismaOps] Tenant ID missing in current user's context for multitenant check on ${modelName}.`
          );
        }
        if (hybridFlagFieldOnTarget && tenantIdFieldOnTarget) {
          const hybridCondition = {
            OR: [
              { [hybridFlagFieldOnTarget]: true },
              { [tenantIdFieldOnTarget]: currentTenantId },
            ],
          };
          where = { AND: [where, hybridCondition] };
        } else if (tenantIdFieldOnTarget) {
          where[tenantIdFieldOnTarget] = currentTenantId;
        }
      }

      // Filtrado por usuario para roles específicos
      const userScopedRoles = targetMeta?.userScopedForRoles || [];
      if (userScopedRoles.length > 0) {
        const currentUserId = this.context.currentUser?.id;
        const currentUserRoles =
          this.context.currentUser?.roles?.map((r) => r.id) || [];

        // Si TODOS los roles del usuario están en userScopedForRoles, aplicar filtro
        const allRolesAreScoped =
          currentUserRoles.length > 0 &&
          currentUserRoles.every((role) => userScopedRoles.includes(role));

        if (allRolesAreScoped) {
          if (!currentUserId) {
            throw new Error(
              `[SecurePrismaOps] User ID missing for user-scoped filter on ${modelName}.`
            );
          }
          // Filtrar por createdBy_id_
          where["createdBy_id_"] = currentUserId;
        }
      }

      // Filtrado por owner (siempre, independiente del rol)
      if (targetMeta?.ownerScoped) {
        const currentUserId = this.context.currentUser?.id;
        if (!currentUserId) {
          throw new Error(
            `[SecurePrismaOps] User ID missing for owner-scoped filter on ${modelName}.`
          );
        }
        // Siempre filtrar por createdBy_id_
        where["createdBy_id_"] = currentUserId;
      }
      // If model has no tenant fields in metadata, it's considered global, no filter added here.
    }
    return where;
  }

  /** Applies tenant filtering to a WHERE clause for the *current* model instance operates on. */
  private applyTenantFilter(originalWhere?: any): any {
    const rooted = this.buildTenantFilterForRelatedModel(
      this.modelNamePascal,
      originalWhere
    );
    // El filtro de empresa en la raíz no alcanza a los predicados de relación
    // DENTRO del where. Sin este descenso, `where: { createdBy_: { email } }` sobre
    // un modelo global (Tenant no tiene tenant_id_) llega a User de CUALQUIER
    // empresa: enumeración cross-tenant. Baja el mismo filtro a cada nivel anidado.
    this._descendTenantIntoWhere(rooted, this.modelNamePascal);
    return rooted;
  }

  /**
   * Baja el filtro de empresa a los predicados de relación dentro de un where ya
   * filtrado en su raíz. Reusa `buildTenantFilterForRelatedModel` en cada nivel, así
   * que respeta lo mismo que la raíz: crossTenantForRoles, userScoped, ownerScoped, y
   * los modelos globales (sin tenant) a los que no agrega nada. Muta el árbol recibido,
   * que ya es un clon propio (`buildTenantFilterForRelatedModel` clona).
   *
   * No poda por permiso: filtrar por una relación sin `_retrieve` sigue siendo un
   * oráculo intra-empresa, pero cerrarlo cambia la semántica del resultado (rechaza
   * consultas) y se decide aparte. Esto cierra solo la fuga cross-tenant.
   */
  /** Relaciones que el `_Filter` de GraphQL expone pero `meta.relations` no tiene: las
   *  de auditoría, que el schema inyecta como baseFields (no son `entity.fields`) y que
   *  apuntan siempre a User. `tenant_` no se mapea a propósito: apunta a Tenant (global),
   *  `buildTenantFilterForRelatedModel` no le agregaría nada. `parent_*` (subentidades)
   *  queda sin resolver: el padre es same-tenant por construcción, y su filtro usa forma
   *  corta (sin contenedor), así que no dispara el fallo-cerrado. */
  private _frameworkRelationModel(key: string): PrismaModelName | undefined {
    if (key === "createdBy_" || key === "lastUpdatedBy_") {
      return "User" as PrismaModelName;
    }
    return undefined;
  }

  private _descendTenantIntoWhere(
    where: any,
    modelName: PrismaModelName
  ): void {
    if (this.context.isSystemMode || !where || typeof where !== "object")
      return;
    const meta = this.allSchemaMeta.get(modelName);
    if (!meta?.relations) return;

    for (const key in where) {
      if (!Object.prototype.hasOwnProperty.call(where, key)) continue;
      const value = where[key];
      if (!value || typeof value !== "object") continue;

      // Operadores lógicos: mismo modelo, se recorren sus ramas.
      if (key === "AND" || key === "OR" || key === "NOT") {
        if (Array.isArray(value)) {
          for (const sub of value) this._descendTenantIntoWhere(sub, modelName);
        } else {
          this._descendTenantIntoWhere(value, modelName);
        }
        continue;
      }

      const CONTAINERS = ["some", "every", "none", "is", "isNot"];
      const hasContainer = CONTAINERS.some((c) => c in value);

      // meta.relations solo tiene las refs forward del DSL. Las relaciones de auditoría
      // (createdBy_/lastUpdatedBy_ → User) las inyecta el schema como baseFields y el
      // _Filter de GraphQL las expone: sin resolverlas, el descenso saltaría justo su
      // caso motivador. Ver `_frameworkRelationModel`.
      const relatedModel =
        meta.relations.get(key)?.relatedModelName ??
        this._frameworkRelationModel(key);

      if (!relatedModel) {
        // Clave-objeto que no resolvemos a un modelo. Un contenedor de relación prueba
        // que ES una relación cuya empresa no podemos acotar → fallar CERRADO (default
        // seguro, como el resto de la capa). Un filtro escalar nunca usa esos
        // contenedores, así que no se ve afectado; una relación inversa/no-DSL sí, y esa
        // es la única forma de que llegue acá.
        if (hasContainer) {
          throw new UnauthorizedError(
            `No se puede acotar por empresa el filtro de relación '${key}' en ${modelName}.`
          );
        }
        continue; // sin relación anidada: nada que bajar
      }

      if (hasContainer) {
        // A-muchos (some/every/none) o a-uno (is/isNot). Se acota cada contenedor con
        // where; un contenedor nulo (`is: null`, "relación ausente") no tiene where
        // donde bajar empresa y se deja intacto — sumarle `tenant_id_` como hermano
        // haría un input inválido para Prisma.
        for (const c of CONTAINERS) {
          if (value[c] && typeof value[c] === "object") {
            value[c] = this.buildTenantFilterForRelatedModel(
              relatedModel,
              value[c]
            );
            this._descendTenantIntoWhere(value[c], relatedModel);
          }
        }
      } else {
        // A-uno en forma corta: `rel: { campo: x }`.
        where[key] = this.buildTenantFilterForRelatedModel(relatedModel, value);
        this._descendTenantIntoWhere(where[key], relatedModel);
      }
    }
  }

  /** Validates that records specified in 'connect' operations within 'data' are accessible by the current tenant. */
  private async validateTenantRelations(data: any): Promise<void> {
    if (this.context.isSystemMode || !data || typeof data !== "object") return;
    const currentModelRelations = this.modelMeta?.relations;
    if (!currentModelRelations || currentModelRelations.size === 0) return;

    const idsToValidateByModel = new Map<PrismaModelName, Set<string>>();

    // Phase 1: Collect IDs from 'connect' operations in the provided 'data'
    // This simple traversal looks for { relationField: { connect: { id: '...' } } }
    for (const fieldName in data) {
      if (!Object.prototype.hasOwnProperty.call(data, fieldName)) continue;
      const relationMeta = currentModelRelations.get(fieldName);
      const connectData = data[fieldName]?.connect;

      if (relationMeta && connectData && typeof connectData === "object") {
        const relatedModelName = relationMeta.relatedModelName;
        const relatedMetaFromStore = this.allSchemaMeta.get(relatedModelName);
        if (
          relatedMetaFromStore?.tenantIdField ||
          relatedMetaFromStore?.hybridTenantFlagField
        ) {
          const connections = Array.isArray(connectData)
            ? connectData
            : [connectData];
          for (const conn of connections) {
            const idToCheck = conn?.id;
            if (idToCheck && typeof idToCheck === "string") {
              if (!idsToValidateByModel.has(relatedModelName))
                idsToValidateByModel.set(relatedModelName, new Set<string>());
              idsToValidateByModel.get(relatedModelName)!.add(idToCheck);
            }
          }
        }
      }
    }

    // Phase 2: Perform batched validation checks if any IDs were collected
    if (idsToValidateByModel.size === 0) return;

    const validationPromises = Array.from(idsToValidateByModel.entries()).map(
      async ([modelToValidate, ids]) => {
        if (ids.size === 0) return;
        const targetDelegate =
          this.prisma[
            this.pascalToCamelCase(modelToValidate) as keyof PrismaClient
          ];
        if (!targetDelegate) {
          console.warn(
            `[Validation] Delegate not found for model ${modelToValidate}, skipping relation validation.`
          );
          return;
        }
        const idArray = Array.from(ids);
        const whereClause = this.buildTenantFilterForRelatedModel(
          modelToValidate,
          { id: { in: idArray } }
        );
        const count = await (targetDelegate as any).count({
          where: whereClause,
        });
        if (count !== ids.size) {
          console.error(
            `[Validation] Found ${count} accessible records for ${modelToValidate}, expected ${
              ids.size
            }. IDs: ${idArray.join(", ")} for tenant ${
              this.context.currentUser?.tenant_id_
            }`
          );
          throw new ValidationError(
            `One or more references to ${modelToValidate} are invalid or inaccessible by the current tenant.`
          );
        }
      }
    );
    await Promise.all(validationPromises);
  }

  private _sanitizeTenantChange(
    updateData: any,
    idValueForLog?: string | undefined
  ): void {
    if (
      !this.modelMeta?.tenantIdField ||
      !updateData ||
      typeof updateData !== "object"
    )
      return;
    const tenantIdFieldName = this.modelMeta.tenantIdField;
    const logId = idValueForLog ?? "unknown";
    let tenantRelationName = "tenant_";
    if (this.modelMeta.relations) {
      for (const [relName, relMeta] of this.modelMeta.relations.entries()) {
        if (relMeta.relationFromFields?.includes(tenantIdFieldName)) {
          tenantRelationName = relName;
          break;
        }
      }
    }
    if (updateData[tenantRelationName]) {
      console.warn(
        `[Secure Update] Attempt to modify '${tenantRelationName}' relation blocked for ${this.modelNamePascal} ID ${logId}`
      );
      delete updateData[tenantRelationName];
    }
    if (updateData[tenantIdFieldName]) {
      console.warn(
        `[Secure Update] Attempt to modify '${tenantIdFieldName}' field blocked for ${this.modelNamePascal} ID ${logId}`
      );
      delete updateData[tenantIdFieldName];
    }
  }

  /** Los campos que jamás salen por esta capa en lectura: SOLO la denylist de auth
   *  (`ALWAYS_REDACTED_FIELDS`).
   *
   *  Los `.secret`/`.secret.encrypted` del DSL (`secretFieldNames`) NO se redactan acá,
   *  a propósito: sus columnas `_encrypted/_iv/_tag` son la FUENTE de los resolvers de
   *  descifrado (que exponen `apiKey`, `sadaicFtpPassword` al admin por decisión) y de
   *  presencia (`dndaUploadPasswordHasValue`), que las inyectan al select server-side.
   *  La exposición al cliente la gobierna el resolver — enmascarar, booleano o claro —,
   *  no este cuello de botella; redactarlas acá los starva y devuelven null/false. El
   *  bus de eventos SÍ las redacta, por `_redactedColumnsOf`, que es un consumidor
   *  distinto (el payload viaja crudo; la respuesta GraphQL solo serializa campos del
   *  tipo, y el secreto no es uno). Los campos de auth, en cambio, no alimentan ningún
   *  resolver y se leen solo con prisma crudo, así que redactarlos acá es seguro. */
  private _redactedScalarsFor(_modelName: PrismaModelName): Set<string> {
    return new Set<string>(ALWAYS_REDACTED_FIELDS);
  }

  /** Saca los campos redactados de un `orderBy` (objeto, array, o con relaciones a-uno
   *  anidadas). Ordenar por un secreto es un oráculo: filtra su valor por el orden del
   *  resultado, campo que el select ya no devuelve. Muta el nodo recibido. */
  private _stripRedactedFromOrderBy(
    node: any,
    modelName: PrismaModelName
  ): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) this._stripRedactedFromOrderBy(item, modelName);
      return;
    }
    const redacted = this._redactedScalarsFor(modelName);
    const meta = this.allSchemaMeta.get(modelName);
    for (const key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      if (redacted.has(key)) {
        delete node[key];
        continue;
      }
      // orderBy por relevancia full-text (`_relevance: { fields, search }`): los
      // `fields` son un oráculo de contenido igual que ordenar por el campo.
      if (
        key === "_relevance" &&
        node[key] &&
        Array.isArray(node[key].fields)
      ) {
        node[key].fields = node[key].fields.filter(
          (f: any) => typeof f !== "string" || !redacted.has(f)
        );
        continue;
      }
      const relationMeta = meta?.relations?.get(key);
      if (relationMeta && node[key] && typeof node[key] === "object") {
        this._stripRedactedFromOrderBy(
          node[key],
          relationMeta.relatedModelName
        );
      }
    }
  }

  /** Barrido de red: borra cualquier clave de `ALWAYS_REDACTED_FIELDS` en CUALQUIER
   *  profundidad del select, incluso bajo relaciones que el metadata no conoce
   *  (inversas, modelos framework) y que `_pruneRecursive` conserva enteras al
   *  clasificarlas como escalar. Seguro por barrer SOLO la denylist de auth: esos
   *  nombres no son campo legítimo de ningún modelo. Los `.secret` por-modelo bajo
   *  relaciones no-DSL quedan para la poda de relaciones/where (paso 4), que sí
   *  resuelve el modelo de cada nivel. Muta el nodo. */
  private _deepDeleteDenylisted(node: any): void {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) this._deepDeleteDenylisted(item);
      return;
    }
    for (const key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      if (ALWAYS_REDACTED_FIELDS.includes(key)) {
        delete node[key];
        continue;
      }
      this._deepDeleteDenylisted(node[key]);
    }
  }

  /** Saca los campos redactados del `distinct` del modelo raíz: `distinct:[secreto]`
   *  colapsa el resultado por valor distinto del secreto, un oráculo observable. */
  private _stripRedactedFromDistinct(distinct: any): any {
    if (!Array.isArray(distinct)) return distinct;
    const redacted = this._redactedScalarsFor(this.modelNamePascal);
    return distinct.filter(
      (f: any) => typeof f !== "string" || !redacted.has(f)
    );
  }

  /** Saca los campos redactados de un mapa plano `{ campo: X }` — `groupBy.by` (que
   *  devolvería los valores distintos del secreto) y los agregados `_min/_max/_sum/_avg`
   *  (que devolverían el propio valor). Muta el nodo recibido. */
  private _stripRedactedFromFieldMap(
    node: any,
    modelName: PrismaModelName
  ): void {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const redacted = this._redactedScalarsFor(modelName);
    for (const key in node) {
      if (
        Object.prototype.hasOwnProperty.call(node, key) &&
        redacted.has(key)
      ) {
        delete node[key];
      }
    }
  }

  /** Clona y redacta un `orderBy` del modelo raíz, para no mutar los `args` del caller. */
  private _secureOrderBy(orderBy: any): any {
    if (!orderBy || typeof orderBy !== "object") return orderBy;
    const cloned = cloneDeep(orderBy);
    this._stripRedactedFromOrderBy(cloned, this.modelNamePascal);
    return cloned;
  }

  /** Redacta los mapas de agregación `_min/_max/_sum/_avg` (de aggregate y groupBy)
   *  sobre el modelo raíz. Clona cada mapa desde los `args` originales para no mutarlos. */
  private _redactAggregates(secureArgs: any, originalArgs: any): void {
    // `_count` puede ser `true` (cuenta filas, sin campo) o `{ campo: true }`; solo el
    // segundo llega acá y expone el conteo de no-nulos de un secreto.
    for (const agg of ["_min", "_max", "_sum", "_avg", "_count"]) {
      const original = originalArgs[agg];
      if (
        original &&
        typeof original === "object" &&
        !Array.isArray(original)
      ) {
        const cloned = cloneDeep(original);
        this._stripRedactedFromFieldMap(cloned, this.modelNamePascal);
        // Vaciado por redacción: quitar la clave en vez de dejar `{}`, que Prisma
        // rechaza ("Expected at least one field"). El caso solo surge si el agregado
        // apuntaba únicamente a un secreto — sin uso legítimo.
        if (Object.keys(cloned).length === 0) {
          delete secureArgs[agg];
        } else {
          secureArgs[agg] = cloned;
        }
      }
    }
  }

  private _pruneRecursive(
    currentLevelObj: any,
    currentModelName: PrismaModelName
  ): void {
    if (
      !currentLevelObj ||
      typeof currentLevelObj !== "object" ||
      Array.isArray(currentLevelObj)
    )
      return;
    const currentMeta = this.allSchemaMeta.get(currentModelName);
    if (!currentMeta) return;

    // Campos redactados: nunca se proyectan, aunque el select los pida.
    const redactedScalars = this._redactedScalarsFor(currentModelName);
    const relations = currentMeta.relations;

    for (const key in currentLevelObj) {
      if (!Object.prototype.hasOwnProperty.call(currentLevelObj, key)) continue;
      const value = currentLevelObj[key];
      const structuralKeys = new Set([
        "select",
        "include",
        "where",
        "orderBy",
        "cursor",
        "take",
        "skip",
        "_count",
      ]);
      if (structuralKeys.has(key)) {
        if (
          (key === "select" || key === "include") &&
          value &&
          typeof value === "object"
        ) {
          this._pruneRecursive(value, currentModelName);
        } else if (key === "orderBy" && value && typeof value === "object") {
          // El orderBy de un select-relación es el mismo oráculo que en la raíz.
          this._stripRedactedFromOrderBy(value, currentModelName);
        }
        continue;
      }

      // Campo redactado (secreto declarado o auth de User): fuera, aunque se pida.
      if (redactedScalars.has(key)) {
        delete currentLevelObj[key];
        continue;
      }

      // Assume other keys are potential relations or scalar fields
      const relationMeta = relations?.get(key);
      if (relationMeta) {
        // It's a relation
        const relatedModelName = relationMeta.relatedModelName;
        const permissionModelName = this.pascalToCamelCase(relatedModelName);
        const requiredPermission = `${permissionModelName}_retrieve`;
        if (
          !this.context.isSystemMode &&
          !this.context.permissions().has(requiredPermission)
        ) {
          delete currentLevelObj[key];
        } else if (value && typeof value === "object") {
          // Has permission and value is object (nested select/include) -> Recurse deeper
          this._pruneRecursive(value, relatedModelName);
          this._aplicarTenantAnidado(
            currentLevelObj,
            key,
            relationMeta,
            relatedModelName
          );
        } else if (value === true) {
          // `rel: true` no admite `where`: hay que expandirlo a objeto para poder
          // filtrarlo. Sin esto, la forma corta sería la puerta abierta.
          const expandido = this._aplicarTenantAnidado(
            { [key]: {} },
            key,
            relationMeta,
            relatedModelName
          );
          if (expandido) currentLevelObj[key] = expandido[key];
        }
      }
      // If key is not structural and not a relation -> assume scalar field, keep it
    }
  }

  /**
   * El filtro de empresa en una relación pedida dentro de un select.
   *
   * La poda mira el PERMISO; esto mira la EMPRESA. Son cosas distintas: tener
   * `musicalWork_retrieve` no habilita ver las obras de otra empresa, y sin
   * este filtro lo único que lo impedía era que el schema GraphQL no proyecte
   * esas relaciones inversas — una defensa accidental, no del cuello de botella.
   *
   * Solo aplica a relaciones a-muchos: Prisma no acepta `where` en una
   * relación a-uno. Ese caso queda cubierto por la clave foránea, que apunta a
   * una fila alcanzada desde un padre ya filtrado.
   */
  private _aplicarTenantAnidado(
    contenedor: any,
    key: string,
    relationMeta: any,
    relatedModelName: PrismaModelName
  ): any | undefined {
    if (this.context.isSystemMode) return undefined;
    if (!relationMeta?.isList) return undefined;

    const metaHijo = this.allSchemaMeta.get(relatedModelName);
    const campoTenant = metaHijo?.tenantIdField;
    if (!campoTenant) return undefined;

    const tenantId = this.tenantEfectivo;
    if (!tenantId) return undefined;

    const actual = contenedor[key];
    if (!actual || typeof actual !== "object") return undefined;

    const whereActual = actual.where;
    contenedor[key] = {
      ...actual,
      where: whereActual
        ? { AND: [whereActual, { [campoTenant]: tenantId }] }
        : { [campoTenant]: tenantId },
    };
    return contenedor;
  }

  private async buildSecureSelect(
    requested: SelectInput<M>
  ): Promise<SelectInput<M> | undefined> {
    if (
      !requested ||
      typeof requested !== "object" ||
      Object.keys(requested).length === 0 ||
      this.context.isSystemMode
    ) {
      return requested;
    }
    const secureRequested = cloneDeep(requested);
    this._pruneRecursive(secureRequested, this.modelNamePascal);
    // Red de seguridad: la denylist de auth se barre en TODA profundidad, incluso
    // bajo relaciones que el metadata no conoce (inversas, modelos framework), que
    // _pruneRecursive clasifica como escalar y conserva enteras. Ver `_deepDeleteDenylisted`.
    this._deepDeleteDenylisted(secureRequested);
    // Si el select venía no-vacío y quedó vacío por redacción/poda, devolver
    // `undefined` haría que Prisma traiga TODOS los escalares por default — incluido
    // el secreto que se acaba de sacar. Se acota a un select mínimo seguro.
    if (Object.keys(secureRequested).length === 0) {
      console.warn(
        `[Secure Select] Pruning removed all requested fields/relations for ${this.modelNamePascal}. Falling back to id-only select.`
      );
      return { id: true } as SelectInput<M>;
    }
    return secureRequested;
  }

  /** Columnas que un modelo nunca publica: las de sus campos `.secret` y las columnas
   *  JSON que rematerializan el record de otro modelo (el `data` del historial). */
  private _redactedColumnsOf(meta: ModelMetadata): string[] {
    return [
      ...(meta.secretFieldNames ?? []),
      ...(meta.opaqueRecordFields ?? []),
    ];
  }

  /**
   * Copia redactada de un record para el payload del bus.
   *
   * Recorre también los records anidados, cada uno con la lista de SU modelo. No alcanza
   * con redactar la raíz: el select del llamador se reenvía tal cual a la lectura previa,
   * y en `isSystemMode` —como corren pipelines y hooks— el pruning por permisos devuelve
   * ese select intacto, así que un `historySet_ { data }` anidado llegaría entero.
   *
   * La decisión se toma sobre las CLAVES DEL RECORD, no sobre `relations`: esa metadata
   * sólo tiene las relaciones directas del DSL, mientras que el schema emite además todas
   * las inversas y las de modelos que no vienen del DSL (`user.refreshTokens`). Por eso
   * toda clave con valor objeto o array que no sea una relación conocida NI una columna
   * declarada del modelo se cae del payload: no se puede saber qué esconde.
   *
   * Sólo copia records: un array se recorre elemento por elemento y cualquier otro objeto
   * (Date, Decimal, Buffer, instancias de clase) se devuelve tal cual — un spread lo
   * aplanaría a `{}` y el payload perdería el valor en silencio.
   *
   * El payload es SIEMPRE una copia: el record que la operación devuelve al llamador no se
   * toca nunca, y ninguna rama del payload comparte objeto con él.
   *
   * LO QUE NO CUBRE, y lo que se lleva puesto:
   * - El contenido de una columna Json declarada viaja entero (salvo la del historial, que
   *   se omite): un secreto que código de proyecto haya escrito adentro de un Json llega.
   * - Redactar no es autorizar: una relación inversa nombrada en un select nunca pasó por
   *   el permiso `<modelo>_retrieve`; acá sólo se decide qué se publica.
   * - La regla borra de más, siempre en dirección segura. Se caen del payload las columnas
   *   Json de los campos `file` (`<campo>_data`, `<campo>_server_data`), un
   *   `set(enum(...))`, el `_count` de Prisma y las relaciones de auditoría
   *   (`tenant_`, `createdBy_`, `lastUpdatedBy_`): ninguna está declarada como relación
   *   del DSL, así que caen por desconocidas. Un listener que las espere no las encuentra.
   */
  private _redactRecordForEvent<R>(
    record: R,
    meta: ModelMetadata,
    seen: Map<any, any>
  ): R {
    if (!record || typeof record !== "object") return record;
    // La copia se registra ANTES de bajar. Un ciclo por relaciones declaradas —o el mismo
    // objeto aliasado en dos ramas— vuelve a esta entrada y recibe la copia REDACTADA, no
    // el original: devolver el original acá sería un agujero fail-open.
    const alreadyRedacted = seen.get(record);
    if (alreadyRedacted !== undefined) return alreadyRedacted as R;

    if (Array.isArray(record)) {
      const items: any[] = [];
      seen.set(record, items);
      for (const item of record) {
        items.push(this._redactRecordForEvent(item, meta, seen));
      }
      return items as any as R;
    }
    if (!isPlainObject(record)) return record;

    const sanitized: any = { ...(record as any) };
    seen.set(record, sanitized);

    for (const column of this._redactedColumnsOf(meta)) {
      delete sanitized[column];
    }

    for (const key of Object.keys(record as any)) {
      if (!(key in sanitized)) continue; // ya se redactó como columna
      const value = (record as any)[key];
      if (!value || typeof value !== "object") continue;
      if (!Array.isArray(value) && !isPlainObject(value)) continue; // Date, Decimal, Buffer...

      const relation = meta.relations?.get(key);
      const relatedMeta = relation
        ? this.allSchemaMeta.get(relation.relatedModelName)
        : undefined;
      if (relatedMeta) {
        sanitized[key] = this._redactRecordForEvent(value, relatedMeta, seen);
        continue;
      }
      // Columna declarada del modelo (típicamente un Json): se conserva, no se mira adentro.
      if (!relation && meta.fields?.get(key)?.kind === "scalar") continue;
      // Relación inversa, relación hacia un modelo sin metadata, o clave desconocida.
      delete sanitized[key];
    }

    return sanitized as R;
  }

  /**
   * Fragmento del payload del event bus con el record ya redactado.
   *
   * Se aplica SÓLO al payload, nunca al valor que la operación devuelve al llamador: el
   * bus es in-process y entrega el payload entero a cada listener, que puede loguearlo o
   * reenviarlo. Sin `select` explícito Prisma trae todos los escalares, así que la
   * columna plana de un `.secret` sin `.encrypted` entraría sola.
   *
   * Se redactan dos cosas, en el record raíz y en cada record anidado que el select haya
   * traído: las columnas de los campos `.secret` del modelo, y las columnas JSON que
   * rematerializan el record de otro modelo (el `data` del historial), donde el secreto
   * del padre queda fuera del alcance de una redacción por nombre.
   *
   * Sin metadata del modelo no se puede saber qué columna respalda un `.secret` — pasa
   * con los modelos Prisma que no vienen del DSL (RefreshToken, TrustedDevice,
   * SystemStatus). Ahí el record NO se publica: la ausencia de metadata no puede leerse
   * como "no hay secretos". Se retiene en vez de fallar porque la clase ya declara ese
   * estado como degradado y tolerado (el constructor sólo avisa), y porque abortar la
   * mutación por un evento sería peor; `recordWithheld` deja la retención declarada en
   * el payload en lugar de silenciosa.
   *
   * `redactedFields` enumera SÓLO las columnas del record raíz. Los records anidados se
   * redactan con la lista de su propio modelo, que esta lista no nombra.
   */
  private _recordForEvent(records: { data?: any; previousData?: any }): {
    data?: any;
    previousData?: any;
    redactedFields?: string[];
    recordWithheld?: boolean;
  } {
    if (!this.modelMeta) {
      return { recordWithheld: true };
    }
    const redacted: {
      data?: any;
      previousData?: any;
      redactedFields?: string[];
    } = {};
    // Array nuevo por payload: el bus entrega el payload entero a cada listener, y una
    // referencia a la metadata del proceso sería mutable desde cualquiera de ellos —
    // vaciarla desactivaría la redacción para todas las mutaciones siguientes.
    const rootRedactedColumns = this._redactedColumnsOf(this.modelMeta);
    if (rootRedactedColumns.length)
      redacted.redactedFields = rootRedactedColumns;
    if ("data" in records) {
      redacted.data = this._redactRecordForEvent(
        records.data,
        this.modelMeta,
        new Map()
      );
    }
    if ("previousData" in records) {
      redacted.previousData = this._redactRecordForEvent(
        records.previousData,
        this.modelMeta,
        new Map()
      );
    }
    return redacted;
  }

  // --- Public Secure CRUD Methods ---

  /** Finds many records, applying permissions, tenant filters, and select pruning. */
  async findMany(args: Args<M, "findMany">): Promise<any[]> {
    this.checkPermission("_retrieve");
    const secureArgs = { ...args };
    secureArgs.where = this.applyTenantFilter(args.where);
    secureArgs.select = await this.buildSecureSelect(args.select);
    secureArgs.orderBy = this._secureOrderBy(args.orderBy);
    (secureArgs as any).distinct = this._stripRedactedFromDistinct(
      (args as any).distinct
    );
    secureArgs.include = undefined;
    return this.prismaDelegate.findMany(secureArgs);
  }

  /** Finds a unique record or throws NotFoundError, applying security. */
  async findUniqueOrThrow(args: Args<M, "findUniqueOrThrow">): Promise<any> {
    this.checkPermission("_retrieve");
    const secureWhere = this.applyTenantFilter(args.where);
    const idValueForLog = JSON.stringify(args.where);
    const exists = await this.prismaDelegate.findFirst({
      where: secureWhere,
      // Usar el select de args para que previousData tenga la misma forma que el resultado esperado
      select: args.select ? cloneDeep(args.select) : { id: true }, // Asegurar al menos el ID
    });
    if (!exists)
      throw new NotFoundError(
        `${this.modelNamePascal} matching ${idValueForLog} not found or not accessible.`
      );
    const secureSelect = await this.buildSecureSelect(args.select);
    return this.prismaDelegate.findUniqueOrThrow({
      where: args.where,
      select: secureSelect,
    });
  }

  /** Finds a unique record or returns null, applying security. */
  async findUnique(args: Args<M, "findUnique">): Promise<any | null> {
    this.checkPermission("_retrieve");
    const secureWhere = this.applyTenantFilter(args.where);
    const exists = await this.prismaDelegate.findFirst({
      where: secureWhere,
      // Seleccionar todos los campos escalares o un conjunto relevante para changedFields y previousData
      // Aquí usamos el select de args, pero podría ser uno más amplio si es necesario.
      select: args.select ? cloneDeep(args.select) : undefined,
    });
    if (!exists) return null;
    const secureSelect = await this.buildSecureSelect(args.select);
    return this.prismaDelegate.findUnique({
      where: args.where,
      select: secureSelect,
    });
  }

  /** Finds the first record, applying security. */
  async findFirst(args: Args<M, "findFirst">): Promise<any | null> {
    this.checkPermission("_retrieve");
    const secureArgs = { ...args };
    secureArgs.where = this.applyTenantFilter(args.where);
    secureArgs.select = await this.buildSecureSelect(args.select);
    secureArgs.orderBy = this._secureOrderBy(args.orderBy);
    (secureArgs as any).distinct = this._stripRedactedFromDistinct(
      (args as any).distinct
    );
    secureArgs.include = undefined;
    return this.prismaDelegate.findFirst(secureArgs);
  }

  /** Creates a record, applying permissions, tenant injection, audit fields, relation validation, and select pruning. */
  async create(args: Args<M, "create">): Promise<any> {
    this.checkPermission("_create");
    const secureArgs = { ...args, data: cloneDeep(args.data ?? {}) };

    // 1. La empresa donde nace el registro
    if (this.modelMeta?.tenantIdField) {
      const tenantRelationName =
        this.modelMeta.relations?.get(
          this.modelMeta.tenantIdField.replace(/_id_?$/, "_")
        )?.fieldName || "tenant_";
      const tenantIdToUse = this.tenantEfectivo;

      if (this.context.isSystemMode) {
        // Modo sistema: se confía en lo que traiga. Seeds, migraciones y
        // procesos internos escriben para la empresa que corresponda, y no hay
        // usuario del cual deducirla.
        if (
          !(secureArgs.data as any)[tenantRelationName] &&
          !(secureArgs.data as any)[this.modelMeta.tenantIdField] &&
          tenantIdToUse
        ) {
          (secureArgs.data as any)[tenantRelationName] = {
            connect: { id: tenantIdToUse },
          };
        }
      } else {
        // Fail-closed: se descarta lo que venga y se asigna siempre.
        //
        // Antes se inyectaba solo si el campo faltaba, así que un tenant ajeno
        // en el payload pasaba derecho. Quien necesite escribir en otra empresa
        // lo declara con .tenantSelectableBy y lo pide con forTenant(), que
        // valida el rol — el privilegio se ve en el call site y no se deduce
        // de una clave del payload.
        delete (secureArgs.data as any)[this.modelMeta.tenantIdField];
        delete (secureArgs.data as any)[tenantRelationName];

        if (tenantIdToUse) {
          (secureArgs.data as any)[tenantRelationName] = {
            connect: { id: tenantIdToUse },
          };
        } else {
          throw new Error(
            "Tenant Error: Could not determine tenant for create operation."
          );
        }
      }
    }
    // 2. Inject Audit Fields (Top Level + Recursively into nested CREATES)
    const userId = this.context.currentUser?.id;
    if (userId) {
      // If user is authenticated, ALWAYS audit (even in isSystemMode)
      this._injectCreateAuditFields(secureArgs.data);
      await this._recursiveInjectNestedCreateContext(
        secureArgs.data,
        this.modelMeta
      );
    } else if (!this.context.isSystemMode) {
      // No user and NOT system mode → security error
      throw new Error("Audit Error: User ID missing for create operation.");
    }
    // If no user AND system mode → legitimate system operation, skip silently

    // 3. Validate connected relations against tenant rules (AFTER all injections)
    await this.validateTenantRelations(secureArgs.data);

    // 4. Secure select for the return value
    secureArgs.select = await this.buildSecureSelect(args.select);
    secureArgs.include = undefined;

    const createdRecord = await this.prismaDelegate.create(secureArgs);

    // --- Publicar Evento ---
    if (createdRecord && createdRecord.id) {
      await publishEvent(this.modelNamePascal, "CREATE", {
        tenantId: this.tenantEfectivo,
        entityId: createdRecord.id,
        ...this._recordForEvent({ data: createdRecord }),
        context: {
          userId: this.context.currentUser?.id,
          traceId: this.context.traceId,
        }, // Ejemplo de contexto adicional
      });
    }
    return createdRecord;
  }

  /**
   * Updates a record, applying security checks, audit fields, and select pruning.
   *
   * `options.saveAttempt` (el intento del guardado: la clave de idempotencia y el
   * hash de su contenido) con `options.expectedVersion` (la versión que leyó el
   * cliente): la versión nueva es la derivada, y un reintento del mismo guardado
   * la reconoce (ver common/services/saveRetry). Sin intento, versión al azar.
   */
  async update(
    args: Args<M, "update">,
    options: {
      expectedVersion?: string | null;
      saveAttempt?: SaveAttempt | null;
    } = {}
  ): Promise<any> {
    const newVersion =
      options.saveAttempt && typeof options.expectedVersion === "string"
        ? deriveVersion(options.expectedVersion, options.saveAttempt)
        : undefined;
    this.checkPermission("_update");
    const secureArgs = { ...args, data: cloneDeep(args.data ?? {}) };
    const secureWhere = this.applyTenantFilter(args.where);
    const idValueForLog = JSON.stringify(args.where);

    // Un solo select podado para las dos lecturas: el que devuelve la operación y el que
    // arma previousData para el evento. previousData va al payload del bus, así que no
    // puede traer relaciones que el pruning por permisos le saca a data — ahí viajaban
    // subregistros de modelos sin permiso de lectura, con sus secretos adentro, fuera del
    // alcance de la redacción superficial.
    const secureSelect = await this.buildSecureSelect(args.select);

    const recordToUpdate = await this.prismaDelegate.findFirst({
      where: secureWhere,
      select: secureSelect,
    });

    if (!recordToUpdate) {
      throw new NotFoundError(
        `${this.modelNamePascal} matching ${idValueForLog} not found or not accessible for update.`
      );
    }
    // Guardar una copia profunda para previousData ANTES de cualquier inyección de auditoría o modificación
    const previousData = cloneDeep(recordToUpdate);

    // 2. Validate connected relations
    await this.validateTenantRelations(secureArgs.data);
    // 3. Sanitize: Prevent tenant change
    this._sanitizeTenantChange(secureArgs.data, idValueForLog);

    // 4. Inject Audit Fields (Update Top Level + Create Context for Nested Creates)
    const userIdForUpdate = this.context.currentUser?.id;
    if (userIdForUpdate) {
      // If user is authenticated, ALWAYS audit (even in isSystemMode)
      this._injectUpdateAuditFields(secureArgs.data, newVersion);
      await this._recursiveInjectNestedCreateContext(
        secureArgs.data,
        this.modelMeta
      );
    } else if (!this.context.isSystemMode) {
      // No user and NOT system mode → security error
      throw new Error("Audit Error: User ID missing for update operation.");
    }
    // If no user AND system mode → legitimate system operation, skip silently

    // 5. Secure select for return
    secureArgs.select = secureSelect;
    secureArgs.include = undefined;

    const updatedRecord = await this.prismaDelegate.update({
      where: args.where,
      data: secureArgs.data,
      select: secureArgs.select,
    });

    // --- Publicar Evento ---
    if (updatedRecord && updatedRecord.id) {
      const changedFields = getChangedFields(previousData, updatedRecord);
      await publishEvent(this.modelNamePascal, "UPDATE", {
        tenantId: this.tenantEfectivo,
        entityId: updatedRecord.id,
        ...this._recordForEvent({ data: updatedRecord, previousData }),
        // changedFields se calcula sobre los records sin redactar: que un secreto cambió
        // es señal legítima para un listener, el valor no. Las claves redactadas del
        // payload van en redactedFields, así que el consumidor las distingue de las que
        // simplemente no se seleccionaron.
        changedFields: changedFields,
        context: {
          userId: this.context.currentUser?.id,
          traceId: this.context.traceId,
        },
      });
    }
    return updatedRecord;
  }

  /** Deletes a record, applying security checks and select pruning. */
  async delete(args: Args<M, "delete">): Promise<any> {
    this.checkPermission("_delete");
    const secureArgs = { ...args };
    const secureWhere = this.applyTenantFilter(args.where);
    const idValue = JSON.stringify(args.where);

    // Un solo select podado para la lectura previa y para el retorno: previousData va al
    // payload del bus y no puede traer relaciones que data no puede ver. Sin select
    // pedido — o si el pruning lo vació — queda el ID solo, que es lo que la operación
    // necesita para el evento.
    const secureSelect = await this.buildSecureSelect(args.select);

    // Obtener el registro ANTES de eliminarlo para previousData
    const recordToDelete = await this.prismaDelegate.findFirst({
      where: secureWhere,
      select: secureSelect ?? { id: true },
    });

    if (!recordToDelete) {
      throw new NotFoundError(
        `${this.modelNamePascal} matching ${idValue} not found or not accessible for delete.`
      );
    }
    const previousData = cloneDeep(recordToDelete); // Guardar antes de eliminar

    // 2. Secure select for return
    secureArgs.select = secureSelect;
    secureArgs.include = undefined;

    const deletedRecord = await this.prismaDelegate.delete({
      where: args.where,
      select: secureArgs.select,
    });

    // --- Publicar Evento ---
    // Usamos previousData como 'data' del evento ya que el registro ya no existe.
    // El 'deletedRecord' devuelto por Prisma puede tener una selección limitada.
    // 'previousData' tiene la forma que se esperaba antes de la eliminación.
    if (previousData && previousData.id) {
      await publishEvent(this.modelNamePascal, "DELETE", {
        tenantId: this.tenantEfectivo,
        entityId: previousData.id, // ID del registro eliminado
        ...this._recordForEvent({ previousData }), // El estado del registro antes de ser eliminado
        // data: deletedRecord, // Opcionalmente, el resultado de la operación delete si es útil
        context: {
          userId: this.context.currentUser?.id,
          traceId: this.context.traceId,
        },
      });
    }
    return deletedRecord; // O previousData si se prefiere devolver el objeto completo
  }

  /** Upserts a record, applying all security checks, injections, and pruning. */
  async upsert(args: Args<M, "upsert">): Promise<any> {
    this.checkPermission("_create");
    this.checkPermission("_update");
    const secureArgs = {
      ...args,
      create: cloneDeep(args.create ?? {}),
      update: cloneDeep(args.update ?? {}),
    };
    // Aplicar filtro de tenant al 'where' para la lógica de upsert (determinar si existe)
    const upsertWhere = this.applyTenantFilter(args.where);
    const idValueForLog = JSON.stringify(args.where);

    const userId = this.context.currentUser?.id;
    const tenantId = this.context.currentUser?.tenant_id_;

    if (!this.context.isSystemMode && !userId)
      throw new Error("Context Error: User ID missing for upsert.");

    // Determinar si será un create o un update para el evento
    let actionType: PrismaAction = "UPSERT_CREATE";
    let previousDataForEvent: any = undefined;

    // Un solo select podado para la lectura previa y para el retorno, igual que update y
    // delete: este record es el previousData del evento, así que no puede traer
    // relaciones que el retorno no puede ver.
    const secureSelect = await this.buildSecureSelect(args.select);

    const existingRecord = await this.prismaDelegate.findFirst({
      where: upsertWhere, // Usar el where con filtro de tenant
      select: secureSelect ?? { id: true }, // Para previousData y changedFields
    });

    if (existingRecord) {
      actionType = "UPSERT_UPDATE";
      previousDataForEvent = cloneDeep(existingRecord);
    } else {
      // El sondeo va FILTRADO por tenant, así que "no la encontré" tiene dos
      // significados muy distintos: que no exista, o que sea de otra empresa.
      // Prisma no distingue: como la llave única sí existe, `upsert` toma la
      // rama UPDATE y escribe encima de lo ajeno — sin que nadie haya tocado
      // el tenant, y publicando el evento rotulado como alta.
      //
      // `update` y `delete` no tienen este problema porque cortan con
      // NotFound cuando su lectura filtrada no encuentra nada. Acá no se puede
      // cortar igual —no encontrar es el caso normal del upsert— así que hace
      // falta la segunda pregunta: ¿la llave está tomada por otro?
      const ocupadaPorOtro = await this.prismaDelegate.findFirst({
        where: args.where,
        select: { id: true },
      });
      if (ocupadaPorOtro) {
        throw new NotFoundError(
          `${this.modelNamePascal} matching ${idValueForLog} not found or not accessible.`
        );
      }
    }

    // --- Process 'create' block (se ejecutará si no existe el registro) ---
    // Inject tenant for create block
    if (this.modelMeta?.tenantIdField) {
      const relationName = this.pascalToCamelCase(
        this.modelMeta.relations?.get(
          this.modelMeta.tenantIdField.replace(/_id_?$/, "_")
        )?.fieldName || "tenant_"
      );
      const tenantIdToUse = this.tenantEfectivo;

      if (this.context.isSystemMode) {
        // Modo sistema: se confía en lo que traiga, igual que en create.
        if (
          !(secureArgs.create as any)[relationName] &&
          !(secureArgs.create as any)[this.modelMeta.tenantIdField] &&
          tenantIdToUse
        ) {
          (secureArgs.create as any)[relationName] = {
            connect: { id: tenantIdToUse },
          };
        }
      } else {
        // Fail-closed, igual que create: se BORRA lo que venga y se asigna
        // siempre. La versión anterior inyectaba SOLO si el campo faltaba, así
        // que un `tenant_id_` ajeno en el bloque create pasaba derecho y la
        // fila nacía en otra empresa — sin tocar ninguna otra defensa, porque
        // validateTenantRelations mira las relaciones, no este escalar.
        //
        // Era el mismo agujero que create() ya tenía cerrado. Que upsert sea
        // "create o update" no lo hace menos alta: cuando crea, crea.
        delete (secureArgs.create as any)[this.modelMeta.tenantIdField];
        delete (secureArgs.create as any)[relationName];
        if (tenantIdToUse) {
          (secureArgs.create as any)[relationName] = {
            connect: { id: tenantIdToUse },
          };
        } else {
          throw new Error(
            "Context Error: Could not determine tenant for upsert.create."
          );
        }
      }
    }
    if (userId) {
      // If user is authenticated, ALWAYS audit (even in isSystemMode)
      this._injectCreateAuditFields(secureArgs.create);
      await this._recursiveInjectNestedCreateContext(
        secureArgs.create,
        this.modelMeta
      );
    }
    await this.validateTenantRelations(secureArgs.create);

    // --- Process 'update' block (se ejecutará si existe el registro) ---
    await this.validateTenantRelations(secureArgs.update);
    this._sanitizeTenantChange(secureArgs.update, idValueForLog);
    if (userId) {
      // If user is authenticated, ALWAYS audit (even in isSystemMode)
      this._injectUpdateAuditFields(secureArgs.update);
      await this._recursiveInjectNestedCreateContext(
        secureArgs.update,
        this.modelMeta
      );
    }

    // --- Secure select & Execute ---
    secureArgs.select = secureSelect;
    secureArgs.include = undefined;

    const upsertedRecord = await this.prismaDelegate.upsert({
      where: args.where, // Usar el args.where original para la operación de upsert final
      create: secureArgs.create,
      update: secureArgs.update,
      select: secureArgs.select,
    });

    // --- Publicar Evento ---
    if (upsertedRecord && upsertedRecord.id) {
      let changedFieldsForEvent: string[] | undefined = undefined;
      if (actionType === "UPSERT_UPDATE" && previousDataForEvent) {
        changedFieldsForEvent = getChangedFields(
          previousDataForEvent,
          upsertedRecord
        );
      }
      await publishEvent(this.modelNamePascal, actionType, {
        tenantId: this.tenantEfectivo,
        entityId: upsertedRecord.id,
        ...this._recordForEvent({
          data: upsertedRecord,
          previousData: previousDataForEvent,
        }),
        changedFields: changedFieldsForEvent,
        context: {
          userId: this.context.currentUser?.id,
          traceId: this.context.traceId,
        },
      });
    }
    return upsertedRecord;
  }

  /** Executes a count operation, applying tenant filters. */
  async count(args: Args<M, "count">): Promise<number> {
    this.checkPermission("_retrieve");
    const secureArgs = { ...args } as any;
    secureArgs.where = this.applyTenantFilter(args.where);
    delete secureArgs.select;
    delete secureArgs.include;
    return this.prismaDelegate.count(secureArgs);
  }

  /** Executes an aggregate operation, applying tenant filters. */
  async aggregate(
    args: Args<M, "aggregate">
  ): Promise<
    PrismaNS.GetResult<Delegate<M>, Args<M, "aggregate">, "aggregate">
  > {
    this.checkPermission("_retrieve");
    const secureArgs = { ...args } as any;
    secureArgs.where = this.applyTenantFilter(args.where);
    delete secureArgs.select;
    delete secureArgs.include;
    this._redactAggregates(secureArgs, args as any);
    return this.prismaDelegate.aggregate(secureArgs);
  }

  /** Executes a groupBy operation, applying tenant filters and security. */
  async groupBy(args: {
    by: string[];
    where?: any;
    orderBy?: any;
    take?: number;
    _count?: any;
    _sum?: any;
    _avg?: any;
    _min?: any;
    _max?: any;
  }): Promise<any[]> {
    this.checkPermission("_retrieve");
    const secureArgs = { ...args } as any;
    secureArgs.where = this.applyTenantFilter(args.where);
    // `by` devuelve los valores distintos de cada campo agrupado: un secreto ahí es
    // el propio dato. `orderBy` y los agregados, el mismo oráculo que en la lectura.
    if (Array.isArray(secureArgs.by)) {
      const redacted = this._redactedScalarsFor(this.modelNamePascal);
      secureArgs.by = secureArgs.by.filter((f: string) => !redacted.has(f));
      // Sin `by` Prisma rechaza el groupBy; si solo agrupaba por un secreto (sin uso
      // legítimo) se devuelve vacío en vez de propagar el error.
      if (secureArgs.by.length === 0) return [];
    }
    secureArgs.orderBy = this._secureOrderBy(args.orderBy);
    // `having` filtra por agregados y acepta el campo secreto en su raíz (oráculo de
    // binary-search). Se poda el nivel superior; el anidado profundo lo cubre la poda
    // del where (paso 4).
    if (secureArgs.having && typeof secureArgs.having === "object") {
      secureArgs.having = cloneDeep((args as any).having);
      this._stripRedactedFromFieldMap(secureArgs.having, this.modelNamePascal);
    }
    this._redactAggregates(secureArgs, args as any);
    return (this.prismaDelegate as any).groupBy(secureArgs);
  }

  /**
   * Returns the secure WHERE clause with all tenant/user filters applied.
   * Useful for cases where you need the secure filter without executing a query.
   */
  getSecureWhere(originalWhere?: any): any {
    return this.applyTenantFilter(originalWhere);
  }
} // End Class SecurePrismaOps
