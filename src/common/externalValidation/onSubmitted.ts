/**
 * Lo que el proyecto hace cuando un contacto confirma sus datos en el formulario
 * público de validación (POST /api/public/external-validation/submit, en
 * src/routes/emailVerification.routes.ts).
 *
 * Es un asiento del proyecto: el generador lo emite sin hacer nada y el proyecto
 * lo puede reemplazar en develop. Mientras el generador no cambie este archivo,
 * la regeneración no pisa la versión del proyecto. Si lo cambia, git mezcla solo
 * lo que no se pisa con lo del proyecto y da conflicto donde los dos cambiaron
 * las mismas líneas o líneas pegadas: después de regenerar hay que revisar este
 * archivo, y tsc avisa si la firma dejó de calzar.
 *
 * Contrato:
 * - Corre DENTRO de la transacción de la confirmación, DESPUÉS de aplicar los
 *   cambios con el UpdateService de la entidad (con todas sus validaciones y
 *   hooks) y ANTES de marcar el mail como verificado. Si tira, la transacción
 *   se revierte entera: no queda ningún cambio aplicado, la solicitud sigue
 *   pendiente y el contacto ve un error.
 * - Puede correr más de una vez en una misma confirmación: si la transacción
 *   choca con otra (P2034; lo típico es un doble envío del formulario) se
 *   reintenta una vez, y lo que el asiento hizo por tx en el intento que chocó
 *   se revierte con él.
 * - tx es el cliente de esa transacción, sin filtros de empresa: toda escritura
 *   va por tx, y toda consulta filtra por tenantId.
 * - applied trae lo que el contacto confirmó, ya normalizado (fechas como Date,
 *   referencias como id, un texto vacío de un campo opcional como null), de los
 *   campos editables que mandó, hayan cambiado o no.
 * - Devuelve verified: true si el proyecto verificó algún dato (por ejemplo,
 *   contra un documento). Va en la respuesta al formulario, en el evento en
 *   vivo y en el aviso a los administradores ("cargó y validó sus datos").
 * - Leer de afuera (por ejemplo, de Redis) se puede: en un reintento se lee de
 *   nuevo. Cambiar algo afuera de la base (escribir o borrar en Redis, archivos,
 *   mails directos, eventos) no se hace acá: no se revierte con la transacción,
 *   y en un reintento se haría dos veces. Va en afterCommit si se puede perder
 *   sin daño; si no, como un mensaje de una cola de la base escrito por tx
 *   (siguiente punto).
 * - Una cola de la misma base (pgmq) se escribe por tx, con
 *   enqueuePipelineJob(..., tx); hay que castear tx a PgmqWriteClient (de
 *   utils/pgmq), porque acá es unknown. Así el mensaje es atómico con la
 *   transacción y se revierte con ella. No va en afterCommit.
 * - afterCommit (opcional): lo que corre después del commit, solo el del
 *   intento que confirmó y una sola vez, antes del aviso a los administradores.
 *   Si la confirmación se revierte, no corre. Si tira, no deshace nada: la
 *   confirmación queda y el error va al log, sin su mensaje.
 * - afterCommit NO es durable: si el proceso muere entre el commit y su
 *   ejecución, no corre. Es solo para lo que no se puede escribir por tx y se
 *   puede perder sin daño (Redis, caché). Tiene que ser breve: se espera en
 *   serie antes del evento en vivo, del aviso y de la respuesta al contacto, así
 *   que uno lento los demora y uno que no resuelve los bloquea.
 */
export interface ExternalValidationSubmitted {
  entityName: string;
  recordId: string;
  tenantId: string;
  verificationId: string;
  applied: Record<string, unknown>;
  tx: unknown;
}

export interface ExternalValidationSubmittedResult {
  verified?: boolean;
  afterCommit?: () => Promise<void> | void;
}

export async function onExternalValidationSubmitted(
  _event: ExternalValidationSubmitted
): Promise<ExternalValidationSubmittedResult> {
  return {};
}
