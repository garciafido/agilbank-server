/**
 * Lo que el proyecto necesita registrar al arrancar el worker.
 *
 * Archivo del PROYECTO: el generador lo emite una vez con este contenido y no
 * lo vuelve a pisar.
 *
 * Existe porque los registros del framework —`projectSchedulers`,
 * `deadLetterHandlers`, `simulationLaunchers`— son opt-in y arrancan vacíos.
 * Sin un módulo que se cargue al boot quedan inertes para siempre, y el punto
 * de extensión existe solo en el comentario que lo describe.
 *
 * El worker importa este archivo por su efecto, antes de empezar a tiquear.
 *
 * Ejemplo:
 *
 *     import { projectSchedulers } from "./schedulers/registry";
 *
 *     projectSchedulers.push({
 *       name: "miBarrido",
 *       run: async (prisma, logger) => { ... },
 *     });
 *
 * Un scheduler tiene que ser **idempotente y barato cuando no hay trabajo**: el
 * worker tiquea cada hora y lo va a llamar aunque no corresponda hacer nada.
 * Decidir si toca es del scheduler, no del worker.
 */

import { configureBackgroundReading, markStatementFailed } from "@agilbank/motor";
import { getStorageProvider } from "../common/storage";
import { deadLetterHandlers } from "./deadLetterHandlers";

// La lectura del extracto baja el archivo con el almacenamiento del producto.
configureBackgroundReading({ storage: getStorageProvider });

// Al agotarse los reintentos, el extracto queda `fallido` (mientras tanto, la API dice `en-proceso`).
deadLetterHandlers["AbStatementRead"] = markStatementFailed;
