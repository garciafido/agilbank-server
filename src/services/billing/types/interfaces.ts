/**
 * Contrato de facturación: qué le reporta un proyecto a su ERP, y qué le vuelve.
 *
 * ── El reparto, que es lo que este archivo declara ──
 *
 * El proyecto sabe de HECHOS FACTURABLES: "este cliente consumió el abono de
 * agosto", "compró 500 créditos". No sabe —ni tiene por qué— de alícuotas, de
 * letras de comprobante ni de numeración: eso es del ERP, que además es el
 * único que puede emitir contra el organismo fiscal.
 *
 * Mismo reparto que con la firma electrónica: acá viven la interfaz y las
 * pantallas; la maquinaria fiscal vive del otro lado. Un proyecto que emitiera
 * comprobantes por su cuenta sería un segundo emisor sobre el mismo CUIT, con
 * dos numeraciones que nadie reconcilia.
 *
 * Por eso el proyecto reporta `BillableEventInput` y NO una factura: si armara
 * la factura estaría decidiendo cosas que no sabe, y el error aparecería recién
 * en una inspección.
 */

/** Cómo el ERP identifica al sujeto facturado. En Argentina, el CUIT. */
export interface CustomerRef {
  /** Identificación fiscal. El vínculo entre un tenant del proyecto y un cliente del ERP. */
  taxId: string;
  /** Nombre, solo para diagnosticar: el que manda es el taxId. */
  displayName?: string;
}

/**
 * Un hecho facturable. NO una factura.
 *
 * `concept` es un código que el ERP resuelve contra sus datos: agregar un
 * concepto nuevo no debería tocar el proyecto. Si acá hubiera una alícuota o un
 * tipo de comprobante, cada cambio de normativa obligaría a tocar y redesplegar
 * todos los proyectos.
 */
export interface BillableEventInput {
  customer: CustomerRef;
  /** Código del concepto, resuelto por el ERP: "abono", "creditos", "excedente". */
  concept: string;
  /** Importe del hecho, en la moneda del ERP. Sin impuestos: los calcula el ERP. */
  amount: number;
  /** Período al que corresponde: "2026-08". */
  period: string;
  /**
   * Identifica el HECHO, no el llamado. Un corte de red hace que el proyecto
   * reintente sin saber si llegó; esta clave es lo que impide el segundo
   * comprobante. Ver common/services/idempotency.
   */
  idempotencyKey: string;
  /** Lo que el proyecto quiera arrastrar para auditar después. */
  metadata?: Record<string, unknown>;
}

/** Lo que el ERP devuelve al aceptar el hecho. */
export interface BillableEventResult {
  /** Id del hecho en el ERP. */
  eventId: string;
  /** Si el ERP ya emitió, el comprobante. Puede tardar: emitir es asincrónico. */
  invoice?: InvoiceRef;
  /** true si este llamado fue un reintento y el ERP devolvió lo ya hecho. */
  deduplicated: boolean;
}

export interface InvoiceRef {
  invoiceId: string;
  /** Número completo tal como lo emitió el ERP: "A 0001-00001234". */
  number?: string;
  status: InvoiceStatus;
  total: number;
  issuedAt?: Date;
  dueDate?: Date;
  /** URL del PDF, servido por el ERP. El proyecto no genera comprobantes. */
  pdfUrl?: string;
}

export type InvoiceStatus =
  | "pending"
  | "issued"
  | "paid"
  | "overdue"
  | "cancelled";

/** Deuda vigente, para el gate de mora — que sigue viviendo en el proyecto. */
export interface CustomerBalance {
  customer: CustomerRef;
  /** Saldo adeudado. Positivo es deuda. */
  balance: number;
  /** Comprobantes vencidos e impagos. */
  overdueCount: number;
  /** El vencimiento más viejo sin pagar, si hay. */
  oldestDueDate?: Date;
}

/** Lo que alimenta la pantalla de plan y consumo del proyecto. */
export interface SubscriptionStatus {
  customer: CustomerRef;
  planName?: string;
  /** Próximo cargo, para mostrarlo de un vistazo. */
  nextChargeAmount?: number;
  nextChargeDate?: Date;
  currentPeriod?: string;
}

/**
 * ── LA VUELTA ──
 *
 * Lo que el ERP le notifica al proyecto: que emitió, que cobró, que venció.
 *
 * Va por evento y no por consulta periódica porque el proyecto necesita
 * reaccionar —abrir el acceso al cobrar, cerrarlo al vencer—, y un sondeo
 * convierte "reaccionar" en "reaccionar en algún momento".
 */
export interface BillingInboundEvent {
  type: BillingEventType;
  /** Id del evento en el ERP: sirve para no procesar dos veces. */
  eventId: string;
  customer: CustomerRef;
  invoice?: InvoiceRef;
  occurredAt: Date;
  raw?: unknown;
}

export type BillingEventType =
  | "invoice.issued"
  | "invoice.paid"
  | "invoice.overdue"
  | "invoice.cancelled";

/** La configuración resuelta para un tenant. */
export interface BillingConfigResolved {
  providerCode: string;
  /** Base del ERP. Vacío = sin configurar, y el proveedor lo dice. */
  baseUrl?: string;
  /** Token del sistema cliente. Cifrado en base, nunca en claro acá. */
  apiToken?: string;
  /** Con qué identidad fiscal factura el ERP. */
  issuerTaxId?: string;
  enabled: boolean;
}
