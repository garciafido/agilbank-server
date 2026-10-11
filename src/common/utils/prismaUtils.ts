import { PrismaSelect } from "@paljs/plugins";
import { GraphQLResolveInfo, FieldNode } from "graphql";
import { dmmf } from "../../paljs-generated/dmmf";

// --- Configuración para campos especiales ---
const TENANT_DISPLAY_NAME_GQL_FIELD = "tenantDisplayName";
const TENANT_RELATION_IN_PRISMA = "tenant_"; // Nombre de la relación en Prisma que necesita 'tenantDisplayName'
const TENANT_RELATION_NEEDS = { select: { name: true, id: true } }; // Lo que necesita de la relación

/**
 * Verifica si un campo específico fue solicitado en el conjunto de selección
 * del nodo actual en la información de resolución de GraphQL.
 *
 * @param info El objeto GraphQLResolveInfo del resolver actual.
 * @param fieldName El nombre del campo GraphQL que quieres verificar.
 * @returns `true` si el campo fue solicitado, `false` en caso contrario.
 */
function isGraphQLFieldRequested(
  info: GraphQLResolveInfo,
  fieldName: string
): boolean {
  if (!info.fieldNodes || info.fieldNodes.length === 0) {
    return false;
  }

  // info.fieldNodes[0] usualmente representa el campo actual que se está resolviendo.
  // Su 'selectionSet' contiene los sub-campos que el cliente pidió PARA el tipo de retorno de este campo.
  // Por ejemplo, si estás en el resolver Query.userOne que devuelve User,
  // info.fieldNodes[0].selectionSet son los campos pedidos dentro de User.
  const selectionSet = info.fieldNodes[0].selectionSet;

  if (!selectionSet || !selectionSet.selections) {
    return false; // No se pidieron sub-campos.
  }

  return selectionSet.selections.some((selection) => {
    // Nos interesan solo los nodos de tipo 'Field'
    if (selection.kind === "Field") {
      // (selection as FieldNode) es necesario porque TypeScript no sabe
      // que dentro del 'some' ya filtramos por 'kind'.
      return (selection as FieldNode).name.value === fieldName;
    }
    return false;
  });
}

const options = { dmmf: [dmmf] };

// Campos de auditoría que PrismaSelect puede filtrar pero deben incluirse si se solicitan
const AUDIT_FIELDS = [
  "createdAt_",
  "createdBy_",
  "lastUpdatedAt_",
  "lastUpdatedBy_",
  "version_",
];
const AUDIT_FIELD_RELATIONS: Record<
  string,
  { select: Record<string, boolean> }
> = {
  createdBy_: { select: { id: true, name: true, email: true } },
  lastUpdatedBy_: { select: { id: true, name: true, email: true } },
};

export function infoToSelect(
  info: GraphQLResolveInfo,
  modelName?: string
): any {
  // @ts-ignore - PrismaSelect types may not match exactly
  const prismaSelectTool = new PrismaSelect(info, options);

  // When modelName is provided (e.g., for projections), use valueWithFilter directly
  // to ensure the correct Prisma model is used for field type detection.
  // The value getter uses info.returnType which may be a GraphQL projection type
  // that doesn't exist in DMMF, causing scalar fields to be passed through unchanged.
  let generatedSelect;
  if (modelName) {
    generatedSelect = prismaSelectTool.valueWithFilter(modelName).select;
  } else {
    generatedSelect = prismaSelectTool.value.select;
  }

  if (
    !generatedSelect &&
    info.fieldNodes[0]?.selectionSet?.selections &&
    info.fieldNodes[0]?.selectionSet?.selections?.length > 0
  ) {
    generatedSelect = {};
  }

  if (!generatedSelect) {
    return undefined;
  }

  // Forzar inclusión de campos de auditoría si fueron solicitados en la query
  for (const auditField of AUDIT_FIELDS) {
    if (
      isGraphQLFieldRequested(info, auditField) &&
      !generatedSelect[auditField]
    ) {
      if (AUDIT_FIELD_RELATIONS[auditField]) {
        generatedSelect[auditField] = AUDIT_FIELD_RELATIONS[auditField];
      } else {
        generatedSelect[auditField] = true;
      }
    }
  }

  // Verificar si 'tenantDisplayName' fue solicitado en este nivel
  if (isGraphQLFieldRequested(info, TENANT_DISPLAY_NAME_GQL_FIELD)) {
    // console.log(`[infoToSelect] '${TENANT_DISPLAY_NAME_GQL_FIELD}' fue solicitado. Añadiendo dependencia '${TENANT_RELATION_IN_PRISMA}'.`);

    // Fusionar de forma segura la dependencia
    if (
      generatedSelect[TENANT_RELATION_IN_PRISMA] === true ||
      generatedSelect[TENANT_RELATION_IN_PRISMA] === undefined
    ) {
      generatedSelect[TENANT_RELATION_IN_PRISMA] = TENANT_RELATION_NEEDS;
    } else if (
      typeof generatedSelect[TENANT_RELATION_IN_PRISMA] === "object" &&
      generatedSelect[TENANT_RELATION_IN_PRISMA] !== null
    ) {
      generatedSelect[TENANT_RELATION_IN_PRISMA].select = {
        ...(generatedSelect[TENANT_RELATION_IN_PRISMA].select || {}),
        ...TENANT_RELATION_NEEDS.select,
      };
    }
  }

  return generatedSelect;
}

/**
 * Extrae el select de Prisma desde un campo nested de un wrapper type.
 * Usa PrismaSelect.valueOf para navegar al campo y filtrar por modelo.
 * Ejemplo: para BatchCreateResult { created, results }, usar fieldPath='results'.
 */
export function infoToSelectFromField(
  info: GraphQLResolveInfo,
  fieldPath: string,
  modelName: string
): any {
  // @ts-ignore - PrismaSelect types may not match exactly
  const prismaSelectTool = new PrismaSelect(info, options);
  const result = prismaSelectTool.valueOf(fieldPath, modelName);
  return result?.select;
}
