import { BillingConfigResolved } from "../types";
import { AgilErpBillingProvider } from "./agilErpProvider";
import { IBillingProvider, BillingProviderFactory } from "./types";

/**
 * Fábrica de proveedores de facturación.
 *
 * Registro abierto, igual que el de firma: agregar un ERP es registrar una
 * fábrica, no tocar el dominio. El proyecto habla con IBillingProvider y no
 * sabe con quién factura.
 */
class Registro {
  private fabricas = new Map<string, BillingProviderFactory>();

  registrar(codigo: string, fabrica: BillingProviderFactory): void {
    this.fabricas.set(codigo, fabrica);
  }

  obtener(codigo: string): BillingProviderFactory | undefined {
    return this.fabricas.get(codigo);
  }

  listar(): string[] {
    return [...this.fabricas.keys()];
  }
}

const registro = new Registro();

registro.registrar("agilerp", (config) => new AgilErpBillingProvider(config));

export const registrarProveedorDeFacturacion = (
  codigo: string,
  fabrica: BillingProviderFactory,
): void => registro.registrar(codigo, fabrica);

export const proveedoresDeFacturacion = (): string[] => registro.listar();

/**
 * Devuelve el proveedor configurado, o null si el proyecto no factura.
 *
 * null y no una excepción: no facturar es una configuración legítima —la
 * mayoría de los proyectos no lo hace—, y quien llama decide si eso es un
 * problema para lo que está haciendo. Un código desconocido, en cambio, SÍ
 * tira: es un error de configuración, no una ausencia.
 */
export function proveedorDeFacturacion(
  config: BillingConfigResolved | null | undefined,
): IBillingProvider | null {
  if (!config || !config.enabled) return null;

  const fabrica = registro.obtener(config.providerCode);
  if (!fabrica) {
    throw new Error(
      `[billing] Proveedor "${config.providerCode}" desconocido. ` +
        `Registrados: ${registro.listar().join(", ") || "ninguno"}.`,
    );
  }
  return fabrica(config);
}
