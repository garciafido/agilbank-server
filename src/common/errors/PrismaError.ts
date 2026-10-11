import { GraphQLError } from "graphql";
import { UNIQUE_CONSTRAINTS } from "./uniqueConstraints.generated";
import {
  resolveUniqueViolation,
  uniqueViolationMessage,
} from "./uniqueViolation";
import { FK_CONSTRAINT_TO_RELATION } from "../services/deletionBlockers.generated";
import {
  deletionBlockersFromForeignKey,
  sqlState,
} from "./foreignKeyViolation";

/** Lo que se usa del error de Prisma: PrismaClientKnownRequestError lo cumple. */
type KnownRequestError = { code: string; meta?: Record<string, unknown> };

export class PrismaError extends GraphQLError {
  constructor(
    prismaError: KnownRequestError,
    public customMessage?: string,
    public customExtensions?: Record<string, any>,
    // Contexto del request (ServiceContext o MyApolloContext): de ahí sale el
    // idioma del usuario para el mensaje de un P2002. Sin él, el del proyecto.
    requestContext?: { currentUser?: unknown } | null,
    // Solo el DeleteService pasa { deletion: true }: un P2003 es ENTITY_IN_USE
    // únicamente si la operación fue un borrado.
    options?: { deletion?: boolean }
  ) {
    const logMessage = messages[prismaError.code] || "Error en base de datos";
    console.error(
      `[PrismaError] ${prismaError.code}: ${logMessage}`,
      prismaError.meta
    );

    // Sin resolver, el mensaje es el código, como siempre: el cliente pone su texto.
    let message: string = prismaError.code;
    let code: string = prismaError.code;
    // Al cliente viaja SOLO el campo lógico y la entidad dueña de la restricción
    // (la del registro que chocó, no la de la operación: una entidad anidada en
    // otra se reporta como la entidad anidada). Nada de columnas ni de internos
    // del driver: si no se resuelve, no viaja meta.
    let safeMeta:
      | { target: string[]; modelName: string }
      | Record<string, unknown>
      | undefined;
    if (prismaError.code === "P2002") {
      try {
        const violation = resolveUniqueViolation(
          prismaError.meta,
          UNIQUE_CONSTRAINTS
        );
        if (violation) {
          const language = (
            requestContext?.currentUser as
              | { language?: unknown }
              | null
              | undefined
          )?.language;
          safeMeta = { target: violation.fields, modelName: violation.model };
          message = uniqueViolationMessage(
            violation,
            UNIQUE_CONSTRAINTS,
            typeof language === "string" ? language : undefined
          );
        }
      } catch (error) {
        console.error("[PrismaError] P2002 sin resolver:", error);
      }
    }
    // Red de seguridad de los borrados: la base rechazó por una clave foránea que
    // la verificación previa no vio. Si la restricción está en la tabla generada,
    // viaja como ENTITY_IN_USE con la entidad raíz, sin nombres ni cantidades.
    // RESTRICT llega como P2039 (23001); NO ACTION, como P2003 (23503).
    if (
      prismaError.code === "P2003" ||
      (prismaError.code === "P2039" && sqlState(prismaError.meta) === "23001")
    ) {
      try {
        const blockers = deletionBlockersFromForeignKey(
          prismaError.meta,
          FK_CONSTRAINT_TO_RELATION,
          options?.deletion === true
        );
        if (blockers) {
          code = "ENTITY_IN_USE";
          message = "ENTITY_IN_USE";
          safeMeta = {
            code: "ENTITY_IN_USE",
            detailType: "deletion-blockers",
            blockers,
          };
        }
      } catch (error) {
        console.error("[PrismaError] clave foránea sin resolver:", error);
      }
    }

    // handled:true evita que formatError lo trate como error interno y le borre el mensaje.
    super(message, {
      extensions: { code, handled: true, meta: safeMeta, ...customExtensions },
    });
  }
}

const messages: Record<string, string> = {
  P1000:
    "Fallo en el acceso al servidor de base de datos. Las credenciales no son válidas",
  P1001:
    "No se puede acceder al servidor de base de datos. Asegúrese de que el servidor de base de datos esté ejecutándose",
  P1002:
    "Tiempo de espera agotado. Asegúrese que el servidor de base de datos esté activo",
  P1003: "El servidor no puede conectarse con la base de datos",
  P1008: "Tiempo de espera agotado durante la operación",
  P1009: "La base de datos ya existe en el servidor",
  P1010: "El acceso a la base de datos fue denegado",
  P1011: "Error al abrir una conexión TLS",
  P1012: "Error en algún parámetro o atributo",
  P1013: "El string de conexión a la base de datos es incorrecto",
  P1014: "El tipo de modelo no existe",
  P1015: "El esquema Prisma no está soportado por la versión de base de datos",
  P1016: "El número de parámetros en el query (raw es incorrecto",
  P1017: "El servidor de base de datos cerró la conexión",

  P2000: "El valor provisto para el tipo de columna es muy largo",
  P2001: "El registro buscado por la condición no existe",
  P2002: "La restricción de unicidad falló",
  P2003: "La restricción de integridad referencial falló",
  P2005:
    "Un valor guardado en la base de datos es incorrecto para el tipo de campo",
  P2022: "La columna no existe en la base de datos actual",
  P2039: "La restricción de integridad referencial (RESTRICT) falló",

  PE2001: "El registro ha sido modificado por otro usuario",
};
