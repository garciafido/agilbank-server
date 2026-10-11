/**
 * @file eventBus.ts
 * @description Un sencillo bus de eventos en memoria para la aplicación.
 */

import { pendientesDelAlcance } from "./transactionScope";

// --- Tipos de Eventos ---

export type PrismaAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "UPSERT_CREATE"
  | "UPSERT_UPDATE";
export type ModelName = string; // Podrías usar Prisma.ModelName si es accesible globalmente

export interface EventPayload<T = any> {
  eventName: string; // Ejemplo: "EDITION_UPDATED", construido como `${modelName}_${action}`
  modelName: ModelName;
  action: PrismaAction;
  tenantId?: string | null;
  entityId: string | number; // O el tipo de ID que uses
  data?: T; // El estado actual de la entidad después de la operación (para CREATE, UPDATE)
  previousData?: T; // El estado anterior de la entidad (para UPDATE, DELETE)
  changedFields?: string[]; // Campos que cambiaron (para UPDATE)
  /**
   * Columnas del record de ESTE modelo que el payload nunca trae: las que respaldan un
   * campo `.secret`, y las columnas JSON que rematerializan el record de otro modelo
   * (el `data` del historial). Sirve para distinguir "falta porque se redactó" de
   * "falta porque no se seleccionó": una clave listada acá no viaja aunque aparezca en
   * `changedFields` — que un secreto haya cambiado es señal legítima, el valor no.
   *
   * Alcance de la LISTA: sólo columnas del record raíz. Los records anidados también se
   * redactan, cada uno con la lista de su propio modelo, y toda clave anidada que no sea
   * una relación conocida ni una columna declarada se omite entera — pero esta
   * enumeración no nombra nada de eso.
   *
   * Lo que el payload NO garantiza: el contenido de una columna Json declarada viaja tal
   * cual (salvo la del historial, que se omite), así que un secreto escrito adentro de un
   * Json por código de proyecto llega igual. Y la redacción no es autorización: que un
   * dato aparezca acá no significa que el actor de la mutación tuviera permiso de leerlo.
   */
  redactedFields?: string[];
  /**
   * El record entero se retuvo: no hay metadata del modelo, así que no se puede saber
   * qué columna respalda un `.secret`. `data` y `previousData` se omiten.
   */
  recordWithheld?: boolean;
  timestamp: Date;
  context?: any; // Para pasar información contextual adicional si es necesario
}

export type EventListener<T = any> = (
  payload: EventPayload<T>
) => Promise<void> | void;

const eventListeners: Record<string, EventListener<any>[]> = {};
const globalListeners: EventListener<any>[] = [];

/**
 * Publica un evento a todos los suscriptores registrados.
 * @param modelName El nombre del modelo (ej. "Edition").
 * @param action La acción realizada (CREATE, UPDATE, DELETE).
 * @param eventData Datos específicos del evento.
 */
export const publishEvent = async <T = any>(
  modelName: ModelName,
  action: PrismaAction,
  eventData: Omit<
    EventPayload<T>,
    "eventName" | "modelName" | "action" | "timestamp"
  >
): Promise<void> => {
  const eventName = `${modelName.toUpperCase()}_${action}`;
  const fullPayload: EventPayload<T> = {
    eventName,
    modelName,
    action,
    ...eventData,
    timestamp: new Date(),
  };

  // Adentro de una transacción el evento se guarda y se entrega recién al
  // commitear. Ver common/services/transactionScope.
  const pendientes = pendientesDelAlcance();
  if (pendientes) {
    pendientes.push(() => entregarEvento(fullPayload));
    return;
  }

  await entregarEvento(fullPayload);
};

const entregarEvento = async <T = any>(
  fullPayload: EventPayload<T>
): Promise<void> => {
  const { eventName } = fullPayload;

  if (eventListeners[eventName]) {
    // console.log(`[EventBus] Publishing event: ${eventName}`, fullPayload); // Descomentar para depuración
    for (const listener of eventListeners[eventName]) {
      try {
        await listener(fullPayload);
      } catch (error) {
        console.error(
          `[EventBus] Error en el listener para el evento ${eventName}:`,
          error
        );
        // Considera una estrategia de manejo de errores más robusta aquí
        // (ej. reintentos, colas de mensajes fallidos para listeners críticos)
      }
    }
  } else {
    // console.log(`[EventBus] No listeners for event: ${eventName}`); // Descomentar para depuración
  }

  // Global listeners reciben todos los eventos. Usados por bridges
  // (e.g. Redis pub/sub) que reemiten cross-process. Cada error se
  // aísla por listener para no afectar al resto ni a la mutación.
  for (const listener of globalListeners) {
    try {
      await listener(fullPayload);
    } catch (error) {
      console.error(
        `[EventBus] Error en global listener procesando ${eventName}:`,
        error
      );
    }
  }
};

/**
 * Se suscribe a un tipo de evento específico.
 * @param eventName El nombre del evento al que suscribirse (ej. "EDITION_UPDATED").
 * @param listener La función callback a ejecutar cuando el evento es publicado.
 */
export const subscribeToEvent = <T = any>(
  eventName: string,
  listener: EventListener<T>
): void => {
  if (!eventListeners[eventName]) {
    eventListeners[eventName] = [];
  }
  eventListeners[eventName].push(listener);
  // console.log(`[EventBus] New listener subscribed to: ${eventName}`); // Descomentar para depuración
};

/**
 * Suscribe un listener que recibe TODOS los eventos publicados, sin
 * filtrar por nombre. Pensado para bridges (e.g. cross-process via
 * Redis pub/sub) o instrumentación. El listener se invoca después de
 * los listeners específicos del evento.
 */
export const subscribeToAllEvents = <T = any>(
  listener: EventListener<T>
): void => {
  globalListeners.push(listener as EventListener<any>);
};

/**
 * Desuscribe un global listener.
 */
export const unsubscribeFromAllEvents = <T = any>(
  listenerToRemove: EventListener<T>
): void => {
  const idx = globalListeners.indexOf(listenerToRemove as EventListener<any>);
  if (idx >= 0) globalListeners.splice(idx, 1);
};

/**
 * Desuscribe un listener de un evento específico.
 * Útil para limpieza, especialmente en contextos de testing o componentes dinámicos.
 * @param eventName El nombre del evento.
 * @param listenerToRemove La función listener exacta que fue suscrita.
 */
export const unsubscribeFromEvent = <T = any>(
  eventName: string,
  listenerToRemove: EventListener<T>
): void => {
  if (eventListeners[eventName]) {
    eventListeners[eventName] = eventListeners[eventName].filter(
      (listener) => listener !== listenerToRemove
    );
    // console.log(`[EventBus] Listener unsubscribed from: ${eventName}`); // Descomentar para depuración
  }
};

/**
 * Calcula los campos que han cambiado entre dos objetos.
 * Compara superficialmente las propiedades directas.
 * @param oldData El objeto con los datos anteriores.
 * @param newData El objeto con los datos nuevos.
 * @returns Un array de strings con los nombres de los campos que cambiaron.
 */
export const getChangedFields = (oldData: any, newData: any): string[] => {
  if (
    !oldData ||
    !newData ||
    typeof oldData !== "object" ||
    typeof newData !== "object"
  ) {
    return [];
  }

  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  // Ignorar campos de auditoría y versión para la detección de cambios "significativos"
  // Puedes expandir esta lista según sea necesario
  const ignoredFields = new Set([
    "version_",
    "createdAt_",
    "createdBy_",
    "lastUpdatedAt_",
    "lastUpdatedBy_",
    "id", // El ID no cambia
  ]);

  for (const key of allKeys) {
    if (ignoredFields.has(key)) {
      continue;
    }
    // Considerar un cambio si la propiedad existe en uno pero no en el otro,
    // o si los valores son diferentes.
    // Esta es una comparación superficial. Para objetos anidados o arrays,
    // podrías necesitar una comparación profunda (ej. usando lodash.isEqual).
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changed.push(key);
    }
  }
  return changed;
};
