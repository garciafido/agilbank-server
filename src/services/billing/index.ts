/**
 * Facturación: la INTERFAZ, no la maquinaria fiscal.
 *
 * Mismo reparto que la firma electrónica. Acá viven el contrato con el ERP y
 * las pantallas; emitir contra el organismo fiscal es del otro lado. Un
 * proyecto que emitiera por su cuenta sería un segundo emisor sobre el mismo
 * CUIT, con dos numeraciones que nadie reconcilia.
 *
 * Inerte mientras no haya configuración: proveedorDeFacturacion devuelve null y
 * nada más ocurre.
 */
export * from "./types";
export * from "./providers/types";
export {
  proveedorDeFacturacion,
  registrarProveedorDeFacturacion,
  proveedoresDeFacturacion,
} from "./providers/providerFactory";
export { AgilErpBillingProvider } from "./providers/agilErpProvider";
export {
  alRecibirDeFacturacion,
  recibirDeFacturacion,
  olvidarOyentesDeFacturacion,
  type BillingEventListener,
  type ResultadoEntrante,
} from "./BillingEventHandler";
