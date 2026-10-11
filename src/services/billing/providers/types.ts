import {
  BillableEventInput,
  BillableEventResult,
  BillingConfigResolved,
  CustomerBalance,
  CustomerRef,
  InvoiceRef,
  SubscriptionStatus,
} from "../types";

/**
 * Lo que todo proveedor de facturación tiene que implementar.
 *
 * Existe por lo mismo que IESignatureProvider: el ERP con el que se factura no
 * es una decisión permanente. Que el proyecto hable con una interfaz y no con
 * AgilErp deja cambiarlo sin tocar el dominio, y —más importante— deja probar
 * el dominio sin ERP.
 *
 * Las cinco operaciones son las del contrato: una de ida (reportar un hecho) y
 * cuatro de vuelta (consultar). La notificación en sentido inverso NO va acá:
 * la maneja BillingEventHandler, porque la inicia el otro lado.
 */
export interface IBillingProvider {
  readonly providerCode: string;

  /**
   * Si le falta configuración, lo dice. No se resuelve con un default: facturar
   * contra un ERP equivocado es peor que no facturar.
   */
  isConfigured(): boolean;

  /**
   * IDA — reporta un hecho facturable. El ERP decide tipo de comprobante,
   * alícuota y numeración.
   *
   * Idempotente por `input.idempotencyKey`: reintentar no puede producir un
   * segundo comprobante.
   */
  reportBillableEvent(input: BillableEventInput): Promise<BillableEventResult>;

  /** VUELTA — deuda vigente, para el gate de mora del proyecto. */
  getCustomerBalance(customer: CustomerRef): Promise<CustomerBalance>;

  /** VUELTA — historial, con el PDF servido por el ERP. */
  getCustomerInvoices(
    customer: CustomerRef,
    range?: { from?: Date; to?: Date },
  ): Promise<InvoiceRef[]>;

  /** VUELTA — lo que alimenta la pantalla de plan y consumo. */
  getSubscriptionStatus(customer: CustomerRef): Promise<SubscriptionStatus>;

  /**
   * VUELTA — valida que una notificación entrante venga del ERP.
   *
   * Sin esto, cualquiera que conozca la URL puede declarar "esta factura se
   * pagó" y abrirse el acceso. Es la parte del webhook que no se puede omitir.
   */
  verifyInboundSignature(payload: string, signature: string | undefined): boolean;
}

export type BillingProviderFactory = (
  config: BillingConfigResolved,
) => IBillingProvider;

export class BillingNotConfiguredError extends Error {
  constructor(que: string) {
    super(
      `La facturación no está configurada: falta ${que}. ` +
        `Mientras tanto el proyecto no reporta hechos facturables ni consulta saldos.`,
    );
    this.name = "BillingNotConfiguredError";
  }
}

export class BillingProviderError extends Error {
  constructor(
    public readonly providerCode: string,
    mensaje: string,
    public readonly causa?: unknown,
  ) {
    super(`[${providerCode}] ${mensaje}`);
    this.name = "BillingProviderError";
  }
}
