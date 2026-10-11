/**
 * El alcance de una transacción, y lo que queda esperando su commit.
 *
 * Toda mutación generada corre adentro de una transacción y desde ahí despacha
 * cosas al resto del sistema: eventos del bus, avisos SSE, mensajes a colas.
 * La regla es una sola:
 *
 *   Nada que salga de una transacción puede hacerse visible antes de que la
 *   transacción commitee.
 *
 * No es prolijidad. Un despacho anticipado es una afirmación falsa mientras la
 * transacción dura, y hace dos daños concretos:
 *
 * - Quien lo recibe en otro proceso lee la fila para reaccionar y la ve como
 *   estaba ANTES: invalida su caché y la repuebla con el valor viejo. Queda
 *   sucia justamente porque el aviso llegó, y en silencio.
 * - Si la transacción revierte, el aviso ya salió y no hay retractación.
 *
 * Este módulo es el único lugar donde se decide "esto va después del commit".
 * Antes cada sitio de despacho resolvía por su cuenta dónde ponerse, y por eso
 * la mitad quedaba de un lado y la mitad del otro sin que nada lo delatara.
 *
 * ── Lo que este mecanismo NO da ──
 *
 * Durabilidad. Si el proceso muere entre el commit y la ejecución de lo
 * pendiente, se pierde. Alcanza para lo que el cliente puede volver a pedir —un
 * aviso SSE, una invalidación de caché— porque todo eso espeja una fila que sí
 * está commiteada. Lo que NO se puede re-derivar de la base no va acá: va a una
 * cola escrita dentro de la misma transacción, que pgmq permite pasándole el
 * cliente (ver enqueuePipelineJob y enqueueFilesDeletion).
 */

import { AsyncLocalStorage } from "async_hooks";

type Pendiente = () => Promise<void>;

const alcance = new AsyncLocalStorage<Pendiente[]>();

/** Los pendientes de la transacción en curso, o undefined si no hay ninguna. */
export const pendientesDelAlcance = (): Pendiente[] | undefined =>
  alcance.getStore();

/**
 * Corre `fn` con un alcance de transacción abierto: todo lo diferido adentro se
 * ejecuta cuando `fn` termina bien, y se descarta si tira.
 *
 * Envolver con esto TODA transacción que pueda mutar. Anidar es inocuo: si ya
 * hay un alcance abierto, éste no abre otro ni ejecuta nada — lo pendiente se
 * acumula en el de afuera, que es el que sabe cuándo commitea de verdad.
 */
export const runWithTransactionScope = async <T>(
  fn: () => Promise<T>
): Promise<T> => {
  if (alcance.getStore()) {
    return fn();
  }

  const pendientes: Pendiente[] = [];
  const resultado = await alcance.run(pendientes, fn);

  // Solo se llega acá si fn no tiró, o sea: la transacción commiteó.
  // Se recorre por índice porque un pendiente puede agregar otro.
  for (let i = 0; i < pendientes.length; i++) {
    await ejecutar(pendientes[i]);
  }

  return resultado;
};

/**
 * Difiere `fn` hasta que commitee la transacción en curso. Sin transacción, la
 * corre en el acto — un llamador no tiene por qué saber cuál de los dos casos es.
 *
 * El orden se respeta: lo diferido sale en el orden en que se pidió, mezclando
 * eventos del bus y avisos, que es como ocurrieron.
 */
export const runAfterCommit = async (fn: Pendiente): Promise<void> => {
  const pendientes = alcance.getStore();
  if (pendientes) {
    pendientes.push(fn);
    return;
  }
  await ejecutar(fn);
};

/**
 * Un pendiente no puede tumbar a quien lo espera: la transacción ya commiteó y
 * el resultado ya es del usuario. Fallar acá solo significa que un aviso no
 * salió, y eso se re-deriva pidiendo el dato de nuevo.
 */
const ejecutar = async (fn: Pendiente): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    console.error("[transactionScope] falló un pendiente post-commit:", error);
  }
};
