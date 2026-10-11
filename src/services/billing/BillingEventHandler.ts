import { BillingInboundEvent, BillingEventType } from "./types";
import { IBillingProvider } from "./providers/types";

/**
 * LA VUELTA: lo que el ERP le notifica al proyecto.
 *
 * El proyecto necesita reaccionar a lo que pasa del otro lado —abrir el acceso
 * cuando se cobra, cerrarlo cuando vence— y por eso va por evento y no por
 * consulta periódica: un sondeo convierte "reaccionar" en "reaccionar en algún
 * momento", y ese momento cae siempre del lado incómodo.
 *
 * Este módulo hace las tres cosas que no se pueden delegar al proyecto, porque
 * omitir cualquiera se ve igual que si funcionara:
 *
 *   1. Verificar la firma. Sin esto, quien conozca la URL declara "esta factura
 *      se pagó" y se abre el acceso solo.
 *   2. Descartar repetidos por eventId. Los webhooks se reintentan por diseño;
 *      procesar dos veces un "pagado" no molesta, pero un "vencido" que llega
 *      después de un "pagado" reordenado sí.
 *   3. Aislar el error del suscriptor. Que un manejador falle no puede hacer
 *      que el ERP reintente para siempre.
 *
 * Lo que hace el proyecto con cada evento es del proyecto: acá solo se declara
 * el asiento donde se registra.
 */

export type BillingEventListener = (evento: BillingInboundEvent) => Promise<void> | void;

const oyentes = new Map<BillingEventType, BillingEventListener[]>();
const vistos = new Set<string>();

/** Cuántos eventId recordar. Suficiente para la ventana de reintentos del ERP. */
const MEMORIA_DE_EVENTOS = 1000;

/**
 * Registra qué hacer cuando el ERP avisa algo.
 *
 * Se llama desde el asiento de suscriptores del proyecto
 * (services/eventBus/subscribers.ts), no desde cualquier módulo: si no, queda
 * atado al orden de imports y no figura en ninguna lista.
 */
export function alRecibirDeFacturacion(
  tipo: BillingEventType,
  oyente: BillingEventListener,
): void {
  const lista = oyentes.get(tipo) ?? [];
  lista.push(oyente);
  oyentes.set(tipo, lista);
}

/** Para los tests: deja el registro como estaba. */
export function olvidarOyentesDeFacturacion(): void {
  oyentes.clear();
  vistos.clear();
}

export interface ResultadoEntrante {
  procesado: boolean;
  motivo?: "firma_invalida" | "repetido" | "sin_oyentes";
}

/**
 * Punto de entrada de una notificación del ERP.
 *
 * Devuelve si se procesó y por qué no, en vez de tirar: quien atiende el
 * webhook necesita decidir qué código HTTP responder, y una excepción no le
 * dice si conviene que el ERP reintente.
 */
export async function recibirDeFacturacion(
  proveedor: IBillingProvider,
  cuerpoCrudo: string,
  firma: string | undefined,
  evento: BillingInboundEvent,
): Promise<ResultadoEntrante> {
  if (!proveedor.verifyInboundSignature(cuerpoCrudo, firma)) {
    return { procesado: false, motivo: "firma_invalida" };
  }

  // Los webhooks se reintentan por diseño. Sin esto, el mismo hecho se procesa
  // tantas veces como el ERP decida reintentar.
  if (vistos.has(evento.eventId)) {
    return { procesado: false, motivo: "repetido" };
  }
  vistos.add(evento.eventId);
  if (vistos.size > MEMORIA_DE_EVENTOS) {
    // Ventana móvil: recordar todo para siempre es una fuga de memoria, y más
    // allá de la ventana de reintentos del ERP ya no aporta.
    const sobra = vistos.size - MEMORIA_DE_EVENTOS;
    let n = 0;
    for (const id of vistos) {
      if (n++ >= sobra) break;
      vistos.delete(id);
    }
  }

  const lista = oyentes.get(evento.type) ?? [];
  if (lista.length === 0) return { procesado: false, motivo: "sin_oyentes" };

  for (const oyente of lista) {
    try {
      await oyente(evento);
    } catch (error) {
      // Un manejador que falla no puede hacer que el ERP reintente para
      // siempre: el evento se recibió y se registró, el problema es de este
      // lado y se diagnostica con el log.
      console.error(
        `[billing] falló un oyente de ${evento.type} (evento ${evento.eventId}):`,
        error,
      );
    }
  }

  return { procesado: true };
}
