import { injectable, inject } from "tsyringe";
import { Prisma, PrismaClient } from "../../../prisma/generated-client/client";
import { ServiceContext } from "../../../service-context";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import {
  runWithTransactionScope,
  runAfterCommit,
} from "../../../common/services/transactionScope";
import {
  UnauthorizedError,
  PrismaError,
  UnknownError,
  ValidationError,
  NotFoundError,
  getErrorMessage,
} from "../../../common/errors";
import {
  MutationUserCreateArgs,
  User as UserGraphQL,
} from "../../../graphql/types";
import { moveUploadedFiles } from "../../../common/utils/moveUploadedFiles";
import { enqueueFilesDeletion } from "../../../workers/queues/fileDeletionQueue";
import { UploadedFile } from "../../../graphql/types";
import * as customValidations from "./customValidations";
import * as afterCreateHooks from "./afterCreate";
import { NullValueError } from "../../../common/errors";
import { emailOrNull, generatePassword } from "../../../common/utils";
import {
  generateResetToken,
  hashToken,
  getTokenExpiration,
} from "../../../common/utils/passwordUtils";
import { ApiError } from "../../../common/errors";
import { hash } from "bcrypt";
import { enqueueWelcomeEmail } from "../../../workers/queues/emailQueue";
import {
  deriveCreateId,
  saveAttemptOf,
} from "../../../common/services/saveRetry";
import { isNil } from "../../../common/utils";
import {
  fileServerDataSetter,
  fileClientDataSetter,
  getDatePath,
} from "../../../common/utils/fileSetter";

// Tipo Omit para los datos que PREPARA este servicio (sin auditoría/tenant)
type UserCreateDataInput = Omit<
  Prisma.UserCreateInput,
  | "version_"
  | "createdAt_"
  | "createdBy_"
  | "lastUpdatedAt_"
  | "lastUpdatedBy_"
  | "tenant_"
>;

/**
 * Servicio para manejar la creación de entidades User.
 * Utiliza SecurePrismaOps para interacción segura con la BD y aplica lógica de negocio específica.
 */
@injectable()
export class UserCreateService {
  private db: SecurePrismaOps<"User">;

  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient,
    @inject("SchemaMetadataStore") private schemaMetaStore: SchemaMetadataStore
  ) {
    // Determinar si la aplicación es multitenant
    // Crear la instancia segura específica para este modelo
    this.db = new SecurePrismaOps(
      this.context,
      this.prisma,
      this.schemaMetaStore, // Pasar la instancia del Store inyectada
      "User",
      {} // Configuración vacía
    );
  }

  /** Validación de negocio específica para la creación de User. */
  private validateCreateArgs(args: MutationUserCreateArgs): void {
    if (
      isNil(args.email) ||
      (typeof args.email === "string" && args.email.trim() === "")
    ) {
      throw new NullValueError("args.email");
    }
    if (
      isNil(args.name) ||
      (typeof args.name === "string" && args.name.trim() === "")
    ) {
      throw new NullValueError("args.name");
    }
    if (isNil(args.active)) {
      throw new NullValueError("args.active");
    }
  }

  /** Crea una nueva instancia de User aplicando seguridad y lógica de negocio. */
  async createUser(
    args: MutationUserCreateArgs,
    select: Prisma.UserSelect | undefined
  ): Promise<UserGraphQL> {
    // Chequeo básico de usuario (permiso real lo chequea this.db.create)
    if (!this.context.isSystemMode && !this.context.currentUser?.id) {
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }

    // El permiso, antes de cualquier otra cosa. Después de acá corren
    // consultas a la base, trabajo de CPU y las validaciones custom del
    // proyecto: todo eso lo disparaba alguien sin permiso sobre la entidad,
    // y el mensaje de error resultante es un oráculo sobre datos que no
    // puede ver. En el alta, además, evita quemar un hash de contraseña
    // completo para terminar en un rechazo.
    this.db.assertCan("create");

    // 1. Validaciones de Negocio Específicas
    this.validateCreateArgs(args);

    // La clave de idempotencia del alta: el id del registro sale del usuario y del
    // intento (la clave y el hash de lo que pide). Si ya hay uno con ese id, de la
    // empresa en la que nace este alta y creado por este usuario, es este mismo
    // alta reintentado (se perdió la respuesta): se devuelve ese registro, sin
    // crear otro. Uno ajeno, o de otra empresa, no: sigue el alta, que choca por
    // el id con el error de siempre.
    const saveAttempt = saveAttemptOf(args);
    const idempotencyUserId = this.context.currentUser?.id;
    const idempotencyTenantId =
      args.targetTenantId ?? this.context.currentUser?.tenant_id_;
    const idempotentId =
      saveAttempt && idempotencyUserId
        ? deriveCreateId("User", idempotencyUserId, saveAttempt)
        : null;
    const alreadyCreated = async (): Promise<boolean> => {
      // Solo un alta atribuible a un usuario en una empresa. En modo sistema la
      // identidad puede ser compartida entre empresas y la lectura no filtra
      // por empresa; sin empresa efectiva no hay con qué filtrar. Ahí nunca se
      // devuelve un registro existente: sigue el alta, con el error de siempre.
      if (!idempotentId || this.context.isSystemMode || !idempotencyTenantId)
        return false;
      const found = await (args.targetTenantId
        ? this.db.forTenant(args.targetTenantId)
        : this.db
      ).findFirst({
        where: { id: idempotentId, tenant_id_: idempotencyTenantId },
        select: { id: true, createdBy_id_: true },
      });
      return !!found && found.createdBy_id_ === idempotencyUserId;
    };
    if (idempotentId && (await alreadyCreated())) {
      console.info(
        `[UserCreateService] ${idempotentId}: same create (user, idempotency key and content) already done; returning that record`
      );
      return await (args.targetTenantId
        ? this.db.forTenant(args.targetTenantId)
        : this.db
      ).findUniqueOrThrow({
        where: { id: idempotentId },
        select,
      });
    }

    // 2. Preparación de Datos (Archivos y objeto 'data' base)
    const filesToMove: { name: string; uploadedFile: UploadedFile }[] = [];
    const nowForService = new Date(); // Fecha consistente para uso dentro del servicio

    // Construir objeto 'data' SÓLO con campos de negocio/args
    // Los campos de auditoría y tenant serán manejados por middleware y SecurePrismaOps
    const data: Partial<UserCreateDataInput> = {
      email: args.email,
      name: args.name,
      active: args.active,
      language: args.language,
      avatar_server_data:
        args.avatar === undefined
          ? null
          : fileServerDataSetter(
              `User.avatar/${getDatePath(nowForService)}/`,
              args.avatar,
              filesToMove
            ),
      avatar_data:
        args.avatar === undefined
          ? null
          : fileClientDataSetter("User.avatar", args.avatar),
      avatar: args.avatar?.filename,
      cellphone: args.cellphone,
      twoFaseAuth: args.twoFaseAuth,
      roles: args.rolesIds
        ? {
            connect: args.rolesIds.map((x: any) => {
              return { id: x };
            }),
          }
        : undefined,
    };

    // Hook para posible lógica adicional de relleno/modificación de 'data'
    const password = await generatePassword(12);
    const hashedPassword = await hash(password, 10);
    const normalizedEmail = emailOrNull(args.email);
    if (!normalizedEmail) {
      throw new ApiError("Invalid email", "InvalidEmail");
    }
    data.email = normalizedEmail;
    data.password = hashedPassword;

    // Generate reset token for first password setup
    const resetToken = generateResetToken();
    data.passwordResetToken = hashToken(resetToken);
    data.passwordResetExpiresAt = getTokenExpiration(24);

    // El id derivado de la clave de idempotencia (si llegó una válida).
    if (idempotentId) data.id = idempotentId;

    // 3. Ejecución Segura y Transacción
    let createdEntityId: string | null = null;
    const __archivosMovidos: typeof filesToMove = [];

    const executeCreate = async (txPrisma: PrismaClient) => {
      // --- Custom intra-service validations (cross-aggregate invariants) ---
      // Importadas desde ./customValidations.ts (archivo manual editable por el user).
      // Si alguna tira, la tx aborta automáticamente — no se escribe nada ni se mueven files.
      // Un validator envuelto en skipOnCreate(...) (common/validation/validationPhase) se saltea acá.
      for (const validator of Object.values(customValidations)) {
        if (
          typeof validator === "function" &&
          !(validator as any).__skipOnCreate
        ) {
          await (validator as (a: any, c: any, p: any) => Promise<void>)(
            args,
            this.context,
            txPrisma
          );
        }
      }

      // Crear instancia de SecurePrismaOps con el cliente transaccional
      let txDb = new SecurePrismaOps(
        this.context,
        txPrisma,
        this.schemaMetaStore, // Pasar la instancia Store inyectada
        "User",
        {} // Configuración vacía
      );

      // .tenantSelectableBy: el alta puede indicar en qué empresa se
      // guarda. Se pide EXPLÍCITO —forTenant valida el rol— en vez de
      // viajar como un campo más del payload, que es como un ref de
      // negocio homónimo terminaba decidiéndolo sin declararlo.
      //
      // El nombre del arg sale del campo que el atributo NOMBRA, no de una
      // convención: así el campo puede llamarse distinto de `tenant`, que está
      // a un guión bajo de las claves que el guardián del create borra por
      // string. Sin cast, porque el generador ya validó que ese campo existe.
      if (args.targetTenantId) {
        txDb = txDb.forTenant(args.targetTenantId);
      }

      // Ejecutar lógica de secuencias DENTRO de la transacción

      // Llamar al método seguro de creación.
      // Este método internamente:
      // 1. Chequea permiso 'create'.
      // 2. Inyecta 'tenant_' (si es multitenant).
      // 3. Valida relaciones 'connect' (chequeando tenant si es multitenant).
      // 4. Llama a prisma.create (middleware inyectará auditoría).
      const result = await txDb.create({
        // Pasar 'data' que ahora incluye valores de secuencia si los había
        data: data as Prisma.UserCreateInput, // Cast a CreateInput completo
        select: { id: true }, // Seleccionar solo ID dentro de la tx
      });
      createdEntityId = result?.id;

      if (!createdEntityId) {
        throw new Error(
          "La creación de User en la base de datos falló o no devolvió un ID."
        );
      }

      // Mover archivos después de confirmar creación en BD.
      // Se anotan para poder deshacerlo: la copia al almacenamiento definitivo
      // no participa de la transacción, así que si ésta revierte los objetos
      // quedan sin ninguna fila que los nombre.
      if (filesToMove.length > 0) {
        await moveUploadedFiles(createdEntityId, filesToMove);
        __archivosMovidos.push(...filesToMove);
      }

      // --- After-create hooks (./afterCreate.ts, archivo manual editable por el user) ---
      // Corren DESPUÉS del insert, dentro de la MISMA transacción, con el id del registro
      // creado. Si alguno tira, la tx aborta (no queda el registro). Útil para crear
      // registros dependientes (p.ej. un perfil 1:1) de forma atómica con el padre.
      // Firma: (createdId, context, txPrisma, args) => Promise<void>
      for (const hook of Object.values(afterCreateHooks)) {
        if (typeof hook === "function") {
          await (hook as (id: string, c: any, p: any, a: any) => Promise<void>)(
            createdEntityId,
            this.context,
            txPrisma,
            args
          );
        }
      }
    };

    try {
      const isInTransaction = (this.context as any).txPrisma !== undefined;

      if (isInTransaction) {
        await executeCreate((this.context as any).txPrisma);
      } else {
        // runWithTransactionScope: lo que la mutación despache sale al
        // commitear, no antes. Ver common/services/transactionScope.
        await runWithTransactionScope(() =>
          this.prisma.$transaction(executeCreate, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 500,
            timeout: 10000,
          })
        );
      }

      // Hook post-transacción
      if (args.active) {
        // La empresa se LEE de la fila recién creada, igual que en la activación
        // (userUpdateService). El objeto `data` no la tiene: SecurePrismaOps la
        // asigna sobre una copia, así que lo que quedó acá nunca es lo que se
        // guardó. Y como WorkerEvent.tenant_id_ es NOT NULL, pasar undefined no
        // dejaba el evento sin empresa: hacía que el mail no se encolara.
        const creado = await this.prisma.user.findUnique({
          where: { id: createdEntityId },
          select: { tenant_id_: true },
        });
        await enqueueWelcomeEmail(
          createdEntityId,
          normalizedEmail,
          resetToken,
          creado?.tenant_id_ ?? undefined
        );
      }

      // 4. Recuperar y Devolver Resultado Completo y Seguro
      if (!createdEntityId) {
        // Este error no debería ocurrir si la transacción no lanzó excepción, pero por si acaso.
        throw new Error(
          "No se pudo obtener el ID de User creado post-transacción."
        );
      }

      // Usar la instancia 'this.db' (no transaccional) para la búsqueda final.
      // Este método aplicará seguridad de lectura (permisos, filtro tenant, poda de includes).
      // La lectura va a la MISMA empresa en la que se guardó: el filtro de
      // lectura sale de `tenantEfectivo`, que sin `forTenant` es la empresa de
      // quien opera. Leer con la propia después de haber escrito en otra no
      // encuentra el registro recién creado, y la operación termina en NotFound
      // cuando en realidad se guardó bien.
      const dbLectura = args.targetTenantId
        ? this.db.forTenant(args.targetTenantId)
        : this.db;
      return await dbLectura.findUniqueOrThrow({
        where: { id: createdEntityId },
        select: select, // Pasar el select solicitado
      });
    } catch (error) {
      // La transacción revirtió: los archivos que sí se alcanzaron a copiar
      // quedaron huérfanos. Se encolan para borrar. Fuera de transacción, a
      // propósito: ya no hay ninguna que respetar. Y nunca puede tapar el
      // error original.
      await this.__descartarArchivosHuerfanos(
        __archivosMovidos,
        createdEntityId
      );

      // Manejo de errores centralizado y consistente
      // Dos reintentos del mismo alta a la vez: el segundo choca por el id con el
      // primero. Si ese registro es de este usuario y de esta empresa, es el mismo alta.
      if (
        idempotentId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (await alreadyCreated())
      ) {
        console.info(
          `[UserCreateService] ${idempotentId}: same create (user, idempotency key and content) already done, its id collided; returning that record`
        );
        return await (args.targetTenantId
          ? this.db.forTenant(args.targetTenantId)
          : this.db
        ).findUniqueOrThrow({
          where: { id: idempotentId },
          select,
        });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "[UserCreateService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        throw new PrismaError(error, undefined, undefined, this.context);
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof NullValueError
      ) {
        // Re-lanzar errores de negocio/permiso/validación conocidos
        throw error;
      } else {
        // Envolver errores desconocidos
        console.error("[UserCreateService] Unknown Error:", error);
        throw new UnknownError(getErrorMessage(error));
      }
    }
  } // Fin createUser

  /**
   * Borra los archivos que se alcanzaron a copiar al almacenamiento definitivo
   * antes de que la transacción reviertiera. Sin esto quedan objetos que ninguna
   * fila nombra: invisibles, y por lo tanto para siempre.
   *
   * Se copian adentro de la transacción a propósito. Al revés —copiar después
   * del commit— el registro quedaría apuntando a un archivo que puede no existir,
   * y eso el usuario sí lo ve. Entre un huérfano y un adjunto roto, el huérfano,
   * que además se puede juntar.
   *
   * Nunca tira: el error que se está manejando es el que importa.
   */
  private async __descartarArchivosHuerfanos(
    movidos: { name: string; uploadedFile: UploadedFile }[],
    entityId: string | null
  ): Promise<void> {
    if (movidos.length === 0) return;
    try {
      await enqueueFilesDeletion(
        "User",
        entityId ?? "rolled-back",
        movidos.map((f) => ({
          fieldName: f.name,
          serverData: {
            baseName: f.name,
            uuid: (f as any).uuid,
            filename: f.uploadedFile.filename,
          } as any,
        })),
        this.context.currentUser!.id,
        this.context.currentUser?.tenant_?.id
      );
    } catch (e) {
      console.error(
        "[UserCreateService] no se pudieron encolar para borrar los archivos huérfanos de una transacción revertida:",
        e
      );
    }
  }
} // Fin clase UserCreateService
