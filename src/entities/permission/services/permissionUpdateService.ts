import { injectable, inject } from "tsyringe";
import { Prisma, PrismaClient } from "../../../prisma/generated-client/client";
import { ServiceContext } from "../../../service-context";
import { SchemaMetadataStore } from "../../../common/services/schemaMetadata";
import { SecurePrismaOps } from "../../../common/services/securePrismaOps";
import {
  runWithTransactionScope,
  runAfterCommit,
  pendientesDelAlcance,
} from "../../../common/services/transactionScope";
import {
  checkSaveVersion,
  isTransactionConflict,
  restorableArgs,
  saveAttemptOf,
} from "../../../common/services/saveRetry";
import {
  UnauthorizedError,
  ConcurrencyError,
  PrismaError,
  UnknownError,
  ValidationError,
  NotFoundError,
  getErrorMessage,
} from "../../../common/errors";
import {
  MutationPermissionUpdateArgs,
  Permission as PermissionGraphQL,
} from "../../../graphql/types";
import { moveUploadedFiles } from "../../../common/utils/moveUploadedFiles";
import { enqueueFilesDeletion } from "../../../workers/queues/fileDeletionQueue";
import { UploadedFile } from "../../../graphql/types";
import * as customValidations from "./customValidations";
import * as afterUpdateHooks from "./afterUpdate";
import { NullValueError } from "../../../common/errors";

// Tipo Omit para datos que prepara este servicio (sin auditoría/tenant)
type PermissionUpdateDataInput = Omit<
  Prisma.PermissionUpdateInput,
  "version_" | "lastUpdatedAt_" | "lastUpdatedBy_" | "tenant_"
>;

// Tipo para la entidad leída antes de actualizar (para check de versión e historial)
type OldPermissionSelect = Prisma.PermissionGetPayload<{
  select: {
    id: true;
    version_: true;
    createdAt_: true;
    createdBy_id_: true;
    lastUpdatedAt_: true;
    lastUpdatedBy_id_: true;
  };
}>;

@injectable()
export class PermissionUpdateService {
  private db: SecurePrismaOps<"Permission">;

  constructor(
    @inject("ServiceContext") private context: ServiceContext,
    @inject("PrismaClient") private prisma: PrismaClient,
    @inject("SchemaMetadataStore") private schemaMetaStore: SchemaMetadataStore
  ) {
    this.db = new SecurePrismaOps(
      this.context,
      this.prisma,
      this.schemaMetaStore, // Pasar instancia Store
      "Permission",
      {} // Configuración vacía
    );
  }

  /**
   * El mismo guardado, ya aplicado (common/services/saveRetry): los datos
   * actuales, con la misma lectura y el mismo select que un guardado exitoso,
   * sin volver a aplicar nada.
   */
  private async alreadyApplied(
    id: string,
    select: Prisma.PermissionSelect | undefined
  ) {
    console.info(
      `[PermissionUpdateService] ${id}: same save (read version, idempotency key and content) already applied; returning the current record`
    );
    return await this.db.findUniqueOrThrow({
      where: { id },
      select,
    });
  }

  /**
   * El conflicto de versión (RECORD_MODIFIED): otra escritura cambió el registro
   * desde que el cliente lo leyó. El mensaje es para los logs (el cliente
   * escribe su texto por el código), neutro: quién escribió no se sabe.
   */
  private versionConflict(
    id: string,
    expected: unknown,
    found: string
  ): ConcurrencyError {
    const message = `Version conflict on Permission ${id}: expected ${expected}, found ${found}`;
    console.warn(`[PermissionUpdateService] ${message}`);
    return new ConcurrencyError(message);
  }

  /** Validación de negocio específica para la actualización de Permission. */
  private validateUpdateArgs(args: MutationPermissionUpdateArgs): void {
    if (
      args.name === null ||
      (typeof args.name === "string" && args.name.trim() === "")
    ) {
      throw new NullValueError("args.name");
    }
  }

  /** Actualiza una instancia de Permission aplicando seguridad, lógica de negocio y historial si aplica. */
  async updatePermission(
    args: MutationPermissionUpdateArgs,
    select: Prisma.PermissionSelect | undefined
  ): Promise<PermissionGraphQL> {
    // Chequeo básico de usuario
    if (!this.context.isSystemMode && !this.context.currentUser?.id) {
      throw new UnauthorizedError(
        "Usuario no autenticado para esta operación."
      );
    }

    // El permiso, antes de cualquier otra cosa. Después de acá corren
    // consultas a la base, trabajo de CPU y las validaciones custom del
    // proyecto: todo eso lo disparaba alguien sin permiso sobre la entidad,
    // y el mensaje de error resultante es un oráculo sobre datos que no
    // puede ver.
    this.db.assertCan("update");

    this.validateUpdateArgs(args);

    // 2. Obtener Entidad Antigua (con seguridad de tenant/permiso) para Validación y/o Historial
    // findUniqueOrThrow ya aplica filtro de tenant y chequea permiso _retrieve
    const oldEntity: OldPermissionSelect = await this.db.findUniqueOrThrow({
      where: { id: args.id },
      select: {
        id: true,
        version_: true,
        createdAt_: true,
        createdBy_id_: true,
        lastUpdatedAt_: true,
        lastUpdatedBy_id_: true,
      }, // Seleccionar campos necesarios
    });

    // 3. Chequeo de Concurrencia (Optimistic Locking)
    // La versión nueva la deriva el server de la leída y del intento del
    // cliente: su clave de idempotencia y el hash de lo que pide
    // (common/services/saveRetry). Si la fila tiene justo esa versión, es este
    // mismo guardado, ya aplicado (se perdió la respuesta y el cliente
    // reintenta): éxito con los datos actuales, sin volver a aplicar nada. Los
    // permisos y la visibilidad ya se verificaron. Acá es un atajo: la
    // garantía es el mismo chequeo dentro de la transacción, antes de escribir
    // nada (executeUpdate).
    const saveAttempt = saveAttemptOf(args);
    const versionBefore = checkSaveVersion(
      oldEntity.version_,
      args.version_,
      saveAttempt
    );
    if (versionBefore === "alreadyApplied") {
      return await this.alreadyApplied(args.id, select);
    }
    if (versionBefore === "conflict") {
      throw this.versionConflict(args.id, args.version_, oldEntity.version_);
    }

    // 4. Preparación de Datos (Archivos y objeto 'data' sin auditoría/tenant)
    const filesToMove: { name: string; uploadedFile: UploadedFile }[] = [];
    const __archivosMovidos: typeof filesToMove = [];
    const nowForService = new Date(); // Fecha consistente para uso dentro del servicio

    // Construir objeto 'data' SÓLO con campos de negocio/args que se van a actualizar
    const data: Partial<PermissionUpdateDataInput> = {
      // Calcular campos virtuales (usando oldEntity como fallback)
      name: args.name ? args.name : undefined, // Setters de negocio, relaciones, workflows...
    };

    // Hook para posible lógica adicional de relleno/modificación de 'data'

    // 5. Ejecución Segura y Transacción
    let updatedEntityId: string | null = args.id; // Ya tenemos el ID

    // Lo que decidió el chequeo de versión de adentro de la transacción.
    let transactionOutcome = "applied" as "applied" | "alreadyApplied";
    const executeUpdate = async (txPrisma: PrismaClient) => {
      transactionOutcome = "applied";
      // Instanciar SecurePrismaOps con el cliente transaccional
      const txDb = new SecurePrismaOps(
        this.context,
        txPrisma,
        this.schemaMetaStore, // Pasar instancia Store
        "Permission",
        {} // Configuración vacía
      );

      // --- La versión, otra vez: con el cliente de la transacción y antes de escribir nada ---
      // (ni los remove anidados). La lectura de arriba es de antes de la
      // transacción, y en el medio pudo confirmar otro guardado: otro usuario
      // (conflicto), o este mismo, si el cliente reintentó con el original
      // todavía en camino. Sin esto, ese reintento se aplicaba dos veces.
      const { version_: versionNow } = await txDb.findUniqueOrThrow({
        where: { id: args.id },
        select: { version_: true },
      });
      const versionCheck = checkSaveVersion(
        versionNow,
        args.version_,
        saveAttempt
      );
      if (versionCheck === "alreadyApplied") {
        transactionOutcome = versionCheck;
        return;
      }
      if (versionCheck === "conflict") {
        throw this.versionConflict(args.id, args.version_, versionNow);
      }

      // --- Custom intra-service validations (cross-aggregate invariants, locks) ---
      // Importadas desde ./customValidations.ts (archivo manual editable por el user).
      // Si alguna tira, la tx aborta automáticamente — no se escribe nada ni se mueven files.
      for (const validator of Object.values(customValidations)) {
        if (typeof validator === "function") {
          await (validator as (a: any, c: any, p: any) => Promise<void>)(
            args,
            this.context,
            txPrisma
          );
        }
      }

      // --- Lógica de Historial (ANTES del Update) ---
      // Sin historial configurado

      // --- Borrado de subentidades usando sus DeleteServices ---
      // No subentities to handle

      // --- Borrado de Archivos Antiguos (ANTES del Update) ---

      // --- Ejecutar Update Seguro ---
      // Este método internamente:
      // 1. Chequea permiso 'update'.
      // 2. Valida relaciones 'connect' vs tenant.
      // 3. Sanitiza 'data' para no cambiar tenant_id.
      // 4. Llama a prisma.update (middleware inyectará auditoría).
      await txDb.update(
        {
          where: { id: args.id }, // Where original (PK)
          data: data as any, // Datos de negocio a actualizar
          select: { id: true }, // No necesitamos devolver nada aquí
        },
        { expectedVersion: args.version_, saveAttempt }
      ); // la versión nueva, derivada si hay clave

      // --- Mover Nuevos Archivos (DESPUÉS del Update) ---
      // Se anotan para poder deshacerlo: la copia al almacenamiento definitivo
      // no participa de la transacción.
      if (filesToMove.length > 0) {
        await moveUploadedFiles(args.id, filesToMove);
        // Una vez cada uno: el reintento de la transacción los vuelve a copiar.
        for (const file of filesToMove) {
          if (!__archivosMovidos.includes(file)) __archivosMovidos.push(file);
        }
      }

      // --- After-update hooks (./afterUpdate.ts, archivo manual editable por el user) ---
      // Corren DESPUÉS del update, dentro de la MISMA transacción, con el id del registro.
      // Si alguno tira, la tx aborta. Firma: (updatedId, context, txPrisma, args) => Promise<void>
      for (const hook of Object.values(afterUpdateHooks)) {
        if (typeof hook === "function") {
          await (hook as (id: string, c: any, p: any, a: any) => Promise<void>)(
            args.id,
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
        await executeUpdate((this.context as any).txPrisma);
      } else {
        // runWithTransactionScope: lo que la mutación despache sale al
        // commitear, no antes. Ver common/services/transactionScope.
        const runTransaction = () =>
          runWithTransactionScope(() =>
            this.prisma.$transaction(executeUpdate, {
              isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
              maxWait: 500,
              timeout: 10000,
            })
          );
        // Un choque con otra transacción (P2034) se reintenta una vez: el
        // chequeo de versión de adentro decide si era este mismo guardado
        // (éxito idempotente) o un conflicto. El reintento parte de los
        // mismos args: la transacción consume partes (los remove anidados).
        // Dentro de un alcance de transacción de afuera no se reintenta: lo
        // que el primer intento dejó pendiente quedaría en ese alcance y
        // saldría con el reintento; el error sube a quien lo abrió.
        const outerScope = pendientesDelAlcance() !== undefined;
        const restoreArgs = restorableArgs(args);
        try {
          await runTransaction();
        } catch (error) {
          if (!isTransactionConflict(error) || outerScope) throw error;
          console.info(
            `[PermissionUpdateService] ${args.id}: write conflict with another transaction (P2034); retrying once`
          );
          restoreArgs();
          await runTransaction();
        }
      }
      if (transactionOutcome === "alreadyApplied") {
        // Los archivos que copió un intento que no confirmó: se descartan solo
        // los que la fila no nombra.
        await this.__descartarArchivosHuerfanos(__archivosMovidos, args.id);
        return await this.alreadyApplied(args.id, select);
      }

      // Hook post-transacción

      // 6. Recuperar y Devolver Resultado Completo y Seguro
      // Usar la instancia 'this.db' (no transaccional) para la búsqueda final
      return await this.db.findUniqueOrThrow({
        where: { id: args.id },
        select,
      });
    } catch (error) {
      // La transacción revirtió: los archivos que sí se alcanzaron a copiar
      // quedaron huérfanos. Se encolan para borrar, ya fuera de transacción,
      // salvo los que la fila nombra.
      await this.__descartarArchivosHuerfanos(__archivosMovidos, args.id);

      // Manejo de errores
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error(
          "[PermissionUpdateService] Prisma Error:",
          error.code,
          error.message,
          error.meta
        );
        throw new PrismaError(error, undefined, undefined, this.context);
      } else if (
        error instanceof UnauthorizedError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof NullValueError ||
        error instanceof ConcurrencyError ||
        error instanceof PrismaError
      ) {
        // Re-lanzar errores conocidos. PrismaError: ya resuelto por un servicio
        // anidado (el borrado de una subentidad quitada del formulario, que
        // llega como ENTITY_IN_USE): envolverlo como desconocido perdía el motivo.
        throw error;
      } else {
        console.error("[PermissionUpdateService] Unknown Error:", error);
        throw new UnknownError(getErrorMessage(error));
      }
    }
  } // Fin updatePermission

  /**
   * Borra los archivos que se alcanzaron a copiar al almacenamiento definitivo
   * antes de que la transacción revirtiera. Sin esto quedan objetos que ninguna
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
    entityId: string
  ): Promise<void> {
    if (movidos.length === 0) return;
    try {
      await enqueueFilesDeletion(
        "Permission",
        entityId,
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
        "[PermissionUpdateService] no se pudieron encolar para borrar los archivos huérfanos de una transacción revertida:",
        e
      );
    }
  }
} // Fin clase PermissionUpdateService
