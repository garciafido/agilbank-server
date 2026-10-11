/**
 * El asiento de los suscriptores del proyecto.
 *
 * Está vacío a propósito, y se emite igual aunque no haya nada que suscribir:
 * lo que declara no es código sino el lugar. Un suscriptor registrado desde
 * cualquier módulo suelto queda atado al orden en que ese módulo se importa
 * —que nadie eligió—, no se puede apagar sin borrarlo, y no aparece en ninguna
 * lista cuando hay que averiguar quién reacciona a una mutación.
 *
 * Acá se registran, y se registran en el arranque, después de que el bus existe
 * y antes de atender el primer request. Vale para el proceso api y para el
 * worker: los dos publican eventos.
 *
 *   import { subscribeToEvent } from "../../common/services/eventBus";
 *
 *   export function registerProjectSubscribers(): void {
 *     subscribeToEvent("INVOICE_CREATE", async (evento) => { ... });
 *   }
 *
 * Dos cosas que conviene tener presentes antes de escribir una:
 *
 * - **El evento llega después del commit**, no durante. Un suscriptor no puede
 *   abortar la mutación que lo disparó; para eso están customValidations.ts y
 *   los hooks afterCreate/afterUpdate, que sí corren dentro de la transacción.
 * - **La entrega no es durable.** Si el proceso muere entre el commit y la
 *   entrega, el evento se pierde. Alcanza para refrescar una caché o avisarle
 *   al cliente. Un efecto de negocio que no se puede perder no va acá: va a una
 *   cola escrita dentro de la misma transacción (ver enqueuePipelineJob).
 *
 * Y si lo que hace falta es diferir algo al commit sin que sea un evento —un
 * aviso, una invalidación—, eso es runAfterCommit, en
 * common/services/transactionScope.
 *
 * Un error del suscriptor se loguea y no se propaga: una mutación ya commiteada
 * no puede fallar por lo que haga quien la escucha.
 */

export function registerProjectSubscribers(): void {
  // Sin suscriptores del proyecto.
}
