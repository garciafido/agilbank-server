import {
  BillableEventInput,
  BillableEventResult,
  BillingConfigResolved,
  CustomerBalance,
  CustomerRef,
  InvoiceRef,
  SubscriptionStatus,
} from "../types";
import { IBillingProvider, BillingNotConfiguredError } from "./types";

/**
 * Proveedor AgilErp — LA INTERFAZ, todavía sin integración.
 *
 * Cada operación declara su contrato y falla diciendo que falta implementarla.
 * Es a propósito, y no un TODO olvidado: dejar que devuelvan un valor plausible
 * —un saldo en cero, una lista vacía— haría que el proyecto siguiera adelante
 * como si hubiera facturado. Un saldo cero inventado abre el acceso a quien no
 * pagó, y nadie se entera hasta la conciliación.
 *
 * Cuando se implemente, el contrato ya está fijado: cada método sabe qué
 * recibe, qué devuelve y qué garantiza. Lo que falta es el transporte.
 */
export class AgilErpBillingProvider implements IBillingProvider {
  readonly providerCode = "agilerp";

  constructor(private readonly config: BillingConfigResolved) {}

  isConfigured(): boolean {
    return Boolean(this.config.enabled && this.config.baseUrl && this.config.apiToken);
  }

  private exigirConfiguracion(): void {
    if (!this.config.enabled) throw new BillingNotConfiguredError("habilitar la facturación");
    if (!this.config.baseUrl) throw new BillingNotConfiguredError("la dirección del ERP");
    if (!this.config.apiToken) throw new BillingNotConfiguredError("el token del sistema cliente");
  }

  /**
   * IDA. Reporta el hecho; el ERP resuelve comprobante, alícuota y numeración.
   * Idempotente por `input.idempotencyKey`.
   */
  async reportBillableEvent(input: BillableEventInput): Promise<BillableEventResult> {
    this.exigirConfiguracion();
    throw new Error(
      `[agilerp] reportBillableEvent todavía no está implementado ` +
        `(concepto "${input.concept}", período ${input.period}). ` +
        `La interfaz está fijada; falta el transporte.`,
    );
  }

  async getCustomerBalance(customer: CustomerRef): Promise<CustomerBalance> {
    this.exigirConfiguracion();
    // Devolver un saldo en cero sería peor que fallar: abriría el acceso a
    // quien no pagó, y el gate de mora del proyecto no tendría cómo saberlo.
    throw new Error(
      `[agilerp] getCustomerBalance todavía no está implementado (CUIT ${customer.taxId}).`,
    );
  }

  async getCustomerInvoices(
    customer: CustomerRef,
    _range?: { from?: Date; to?: Date },
  ): Promise<InvoiceRef[]> {
    this.exigirConfiguracion();
    // Una lista vacía se leería como "no tiene comprobantes", que es una
    // afirmación sobre el mundo y no sobre nuestra implementación.
    throw new Error(
      `[agilerp] getCustomerInvoices todavía no está implementado (CUIT ${customer.taxId}).`,
    );
  }

  async getSubscriptionStatus(customer: CustomerRef): Promise<SubscriptionStatus> {
    this.exigirConfiguracion();
    throw new Error(
      `[agilerp] getSubscriptionStatus todavía no está implementado (CUIT ${customer.taxId}).`,
    );
  }

  /**
   * Sin implementar, devuelve false: rechaza todo.
   *
   * Es la única operación cuya versión no implementada NO tira. Tirar sería
   * indistinguible de un error de red, y quien atienda el webhook podría
   * reintentar; devolver false es lo que corresponde — la notificación no se
   * pudo verificar, así que no se procesa.
   */
  verifyInboundSignature(_payload: string, _signature: string | undefined): boolean {
    return false;
  }
}
