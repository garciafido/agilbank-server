import {
  GraphQLSchema,
  GraphQLResolveInfo,
  parse,
  validate,
  execute,
  OperationDefinitionNode,
  FieldNode,
  ExecutionArgs,
} from "graphql";
import { PrismaSelect } from "@paljs/plugins";

export async function graphQLToPrismaSelect(
  schema: GraphQLSchema,
  queryString: string,
  variableValues?: { [key: string]: any },
  options?: any
) {
  const info = await getGraphQLResolveInfo(schema, queryString, variableValues);
  const prismaSelect = new PrismaSelect(info, options);
  return prismaSelect.value.select;
}

/**
 * Intenta obtener el objeto GraphQLResolveInfo para el primer campo raíz
 * de una consulta GraphQL dada, ejecutando la consulta con un resolver temporal.
 *
 * @param schema El GraphQLSchema contra el cual ejecutar.
 * @param queryString La cadena de la consulta GraphQL.
 * @param variableValues Los valores de las variables para la consulta (opcional).
 * @param operationName El nombre de la operación a ejecutar, si la query tiene múltiples (opcional).
 * @returns Una promesa que resuelve al objeto GraphQLResolveInfo o null si no se puede obtener.
 */
export async function getGraphQLResolveInfo(
  schema: GraphQLSchema,
  queryString: string,
  variableValues?: { [key: string]: any },
  operationName?: string
): Promise<GraphQLResolveInfo | null> {
  const documentAST = parse(queryString);

  const validationErrors = validate(schema, documentAST);
  if (validationErrors.length > 0) {
    throw new Error(
      `Errores de validación de GraphQL: ${validationErrors
        .map((e) => e.message)
        .join("\n")}`
    );
  }

  let operation: OperationDefinitionNode | undefined;
  if (operationName) {
    operation = documentAST.definitions.find(
      (definition) =>
        definition.kind === "OperationDefinition" &&
        definition.name?.value === operationName
    ) as OperationDefinitionNode | undefined;
  } else {
    operation = documentAST.definitions.find(
      (definition) => definition.kind === "OperationDefinition"
    ) as OperationDefinitionNode | undefined;
  }

  if (!operation) {
    console.error("No se encontró una definición de operación en la query.");
    return null;
  }

  const firstRootFieldNode = operation.selectionSet.selections.find(
    (selection) => selection.kind === "Field"
  ) as FieldNode | undefined;

  if (!firstRootFieldNode) {
    console.error("No se encontraron campos en la selección de la operación.");
    return null;
  }

  const fieldName = firstRootFieldNode.name.value;
  let capturedInfo: GraphQLResolveInfo | null = null;
  let rootType;

  switch (operation.operation) {
    case "query":
      rootType = schema.getQueryType();
      break;
    case "mutation":
      rootType = schema.getMutationType();
      break;
    case "subscription":
      rootType = schema.getSubscriptionType();
      break;
    default:
      console.error(`Tipo de operación no soportado: ${operation.operation}`);
      return null;
  }

  if (!rootType) {
    console.error(
      `No se encontró el tipo raíz para la operación '${operation.operation}' en el schema.`
    );
    return null;
  }

  const rootFields = rootType.getFields();
  const targetField = rootFields[fieldName];

  if (!targetField) {
    console.error(
      `Campo '${fieldName}' no encontrado en el tipo raíz '${rootType.name}'.`
    );
    return null;
  }

  const originalResolve = targetField.resolve;
  const originalSubscribe = targetField.subscribe;

  const captureResolver = (
    _source: any,
    _args: any,
    _context: any,
    info: GraphQLResolveInfo
  ) => {
    capturedInfo = info;
    if (operation?.operation === "subscription") {
      return {
        // Dummy AsyncIterator for subscriptions
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return { value: { [info.fieldName]: null }, done: true };
            },
          };
        },
      };
    }
    return null; // Dummy value for queries/mutations
  };

  if (operation.operation === "subscription") {
    targetField.subscribe = captureResolver;
  } else {
    targetField.resolve = captureResolver;
  }

  const executionArgs: ExecutionArgs = {
    schema,
    document: documentAST,
    rootValue: {},
    contextValue: {},
    variableValues,
    operationName,
  };

  try {
    const result = await execute(executionArgs);
    if (result.errors) {
      console.warn(
        "La ejecución de GraphQL resultó en errores:",
        result.errors.map((e) => e.message).join("\n")
      );
    }
  } catch (error) {
    console.error("Error durante la ejecución de GraphQL:", error);
    // Restaurar y devolver null incluso si hay un error catastrófico
    if (operation.operation === "subscription") {
      targetField.subscribe = originalSubscribe;
    } else {
      targetField.resolve = originalResolve;
    }
    return null;
  } finally {
    // Asegurar la restauración del resolver original
    if (operation.operation === "subscription") {
      targetField.subscribe = originalSubscribe;
    } else {
      targetField.resolve = originalResolve;
    }
  }

  if (!capturedInfo) {
    console.warn(
      `No se pudo capturar GraphQLResolveInfo para el campo '${fieldName}'.`
    );
  }
  return capturedInfo;
}

/**
 * Genera un objeto 'select' de Prisma a partir de GraphQLResolveInfo
 * utilizando PrismaSelect de @paljs/plugins.
 *
 * @param info El objeto GraphQLResolveInfo.
 * @param options Opciones adicionales para PrismaSelect (ej: { dmmf }).
 * @returns Un objeto 'select' para ser usado con Prisma.
 */
export function getPrismaSelectFromInfo(
  info: GraphQLResolveInfo,
  options?: any
): object {
  const prismaSelect = new PrismaSelect(info, options);
  return prismaSelect.value;
}
