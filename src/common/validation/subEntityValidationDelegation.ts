/**
 * Delegación genérica de validaciones de subentidades anidadas.
 *
 * Los create/update services generados escriben las subentidades por prisma
 * anidado (create[]/update[]) SIN correr las customValidations de la subentidad
 * — solo el remove[] pasa por su DeleteService. Este runner cierra ese gap: el
 * service del parent lo invoca con un árbol de descriptores (emitido por el
 * generador) y corre, por cada item anidado y recursivamente en profundidad,
 * los validators exportados por el customValidations.ts de cada subentidad
 * (fuente única — misma firma y flags de fase que el loop propio del service,
 * ver validationPhase.ts).
 *
 * Forma del input según la fase del nivel:
 *  - "create": el campo trae el/los item(s) plano(s) del create input; todo lo
 *    anidado debajo también está en forma create.
 *  - "update": el campo multi trae {create[], update[], remove[]} — los items de
 *    create[] descienden en fase create, los de update[] en fase update; el
 *    campo simple trae el objeto plano a actualizar.
 *  - remove[] NO se delega: ya lo cubre el DeleteService de la subentidad, que
 *    corre sus propias customValidations de delete.
 */
export type SubEntityValidationNode = {
  field: string;
  multi: boolean;
  validators: Record<string, unknown>;
  children: SubEntityValidationNode[];
};

type ValidationPhase = "create" | "update";

async function runItemValidators(
  validators: Record<string, unknown>,
  item: any,
  phase: ValidationPhase,
  context: any,
  txPrisma: any,
): Promise<void> {
  for (const validator of Object.values(validators ?? {})) {
    if (typeof validator !== "function") continue;
    if (phase === "create" && (validator as any).__skipOnCreate) continue;
    await (validator as (a: any, c: any, p: any) => Promise<void>)(
      item,
      context,
      txPrisma,
    );
  }
}

export async function runSubEntityValidations(
  nodes: SubEntityValidationNode[],
  parent: any,
  phase: ValidationPhase,
  context: any,
  txPrisma: any,
): Promise<void> {
  for (const node of nodes) {
    const value = parent?.[node.field];
    if (!value) continue;

    const validateItem = async (item: any, itemPhase: ValidationPhase) => {
      if (!item) return;
      await runItemValidators(node.validators, item, itemPhase, context, txPrisma);
      await runSubEntityValidations(node.children, item, itemPhase, context, txPrisma);
    };

    if (phase === "create") {
      const items = node.multi ? (Array.isArray(value) ? value : []) : [value];
      for (const item of items) {
        await validateItem(item, "create");
      }
    } else if (node.multi) {
      for (const item of value.create ?? []) {
        await validateItem(item, "create");
      }
      for (const item of value.update ?? []) {
        await validateItem(item, "update");
      }
    } else {
      await validateItem(value, "update");
    }
  }
}
