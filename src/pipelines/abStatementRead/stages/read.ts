import { StageContext } from "../../pipeline/types";
import { readStatementStage as readStatementStageDelModulo } from "@agilbank/motor";

// Este paso lo implementa el módulo "@agilbank/motor" (.implementedBy en el DSL).
// No se edita acá: se cambia en el módulo, y todos los proyectos que lo
// declaran reciben el cambio en la próxima regeneración.
export async function read(
  context: StageContext,

  statementId: string,
  workerEventId?: string
): Promise<{ status: string }> {
  return readStatementStageDelModulo(context, statementId, workerEventId);
}
