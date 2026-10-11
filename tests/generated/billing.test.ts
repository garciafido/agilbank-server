// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  proveedorDeFacturacion,
  registrarProveedorDeFacturacion,
  AgilErpBillingProvider,
  BillingNotConfiguredError,
  alRecibirDeFacturacion,
  recibirDeFacturacion,
  olvidarOyentesDeFacturacion,
  type BillingConfigResolved,
  type BillingInboundEvent,
  type IBillingProvider,
} from "../../src/services/billing";

const configCompleta: BillingConfigResolved = {
  providerCode: "agilerp",
  baseUrl: "https://erp.example",
  apiToken: "t",
  issuerTaxId: "30000000007",
  enabled: true,
};

const CLIENTE = { taxId: "30111111118" };

describe("facturación: la interfaz, sin integración todavía", () => {
  it("sin configuración, no hay proveedor y eso NO es un error", () => {
    // La mayoría de los proyectos no factura. Que sea null y no una excepción
    // deja que quien llama decida si le importa.
    expect(proveedorDeFacturacion(null)).toBeNull();
    expect(
      proveedorDeFacturacion({ ...configCompleta, enabled: false })
    ).toBeNull();
  });

  it("un proveedor desconocido SÍ es un error", () => {
    // Ausencia de configuración y configuración equivocada no son lo mismo.
    expect(() =>
      proveedorDeFacturacion({ ...configCompleta, providerCode: "inexistente" })
    ).toThrow(/inexistente/);
  });

  it("con configuración completa, devuelve el proveedor y se declara configurado", () => {
    const p = proveedorDeFacturacion(configCompleta)!;
    expect(p.providerCode).toBe("agilerp");
    expect(p.isConfigured()).toBe(true);
  });

  it("le falta configuración y lo dice, en vez de facturar contra cualquier lado", async () => {
    const sinUrl = new AgilErpBillingProvider({
      ...configCompleta,
      baseUrl: undefined,
    });
    expect(sinUrl.isConfigured()).toBe(false);
    await expect(sinUrl.getCustomerBalance(CLIENTE)).rejects.toThrow(
      BillingNotConfiguredError
    );
  });

  it("lo no implementado FALLA, no devuelve un valor plausible", async () => {
    const p = new AgilErpBillingProvider(configCompleta);
    // Un saldo cero inventado abre el acceso a quien no pagó; una lista vacía
    // se lee como "no tiene comprobantes", que es una afirmación sobre el
    // mundo y no sobre nuestra implementación.
    await expect(p.getCustomerBalance(CLIENTE)).rejects.toThrow(
      /no está implementado/
    );
    await expect(p.getCustomerInvoices(CLIENTE)).rejects.toThrow(
      /no está implementado/
    );
    await expect(p.getSubscriptionStatus(CLIENTE)).rejects.toThrow(
      /no está implementado/
    );
    await expect(
      p.reportBillableEvent({
        customer: CLIENTE,
        concept: "abono",
        amount: 1000,
        period: "2026-08",
        idempotencyKey: "k1",
      })
    ).rejects.toThrow(/no está implementado/);
  });

  it("la verificación de firma sin implementar RECHAZA, no tira", () => {
    // Tirar sería indistinguible de un error de red y el ERP reintentaría. No
    // poder verificar es un rechazo, no una falla nuestra.
    const p = new AgilErpBillingProvider(configCompleta);
    expect(p.verifyInboundSignature("{}", "loquesea")).toBe(false);
  });

  it("se puede registrar otro ERP sin tocar el dominio", () => {
    const falso: IBillingProvider = {
      providerCode: "otro",
      isConfigured: () => true,
      reportBillableEvent: async () => ({ eventId: "e", deduplicated: false }),
      getCustomerBalance: async () => ({
        customer: CLIENTE,
        balance: 0,
        overdueCount: 0,
      }),
      getCustomerInvoices: async () => [],
      getSubscriptionStatus: async () => ({ customer: CLIENTE }),
      verifyInboundSignature: () => true,
    };
    registrarProveedorDeFacturacion("otro", () => falso);
    const p = proveedorDeFacturacion({
      ...configCompleta,
      providerCode: "otro",
    });
    expect(p!.providerCode).toBe("otro");
  });
});

describe("facturación: lo que el ERP le notifica al proyecto", () => {
  const proveedorQueVerifica = (verifica: boolean): IBillingProvider =>
    ({ verifyInboundSignature: () => verifica } as any);

  const evento = (
    over: Partial<BillingInboundEvent> = {}
  ): BillingInboundEvent => ({
    type: "invoice.paid",
    eventId: "ev1",
    customer: CLIENTE,
    occurredAt: new Date("2026-08-05T12:00:00Z"),
    ...over,
  });

  beforeEach(() => olvidarOyentesDeFacturacion());

  it("sin firma válida NO se procesa", async () => {
    const vistos: string[] = [];
    alRecibirDeFacturacion(
      "invoice.paid",
      async (e) => void vistos.push(e.eventId)
    );

    const r = await recibirDeFacturacion(
      proveedorQueVerifica(false),
      "{}",
      "mala",
      evento()
    );

    // Sin esto, quien conozca la URL declara "esta factura se pagó" y se abre
    // el acceso solo.
    expect(r).toEqual({ procesado: false, motivo: "firma_invalida" });
    expect(vistos).toEqual([]);
  });

  it("con firma válida, el oyente recibe el evento", async () => {
    const vistos: string[] = [];
    alRecibirDeFacturacion(
      "invoice.paid",
      async (e) => void vistos.push(e.eventId)
    );

    const r = await recibirDeFacturacion(
      proveedorQueVerifica(true),
      "{}",
      "ok",
      evento()
    );

    expect(r.procesado).toBe(true);
    expect(vistos).toEqual(["ev1"]);
  });

  it("el mismo evento dos veces se procesa UNA", async () => {
    const vistos: string[] = [];
    alRecibirDeFacturacion(
      "invoice.paid",
      async (e) => void vistos.push(e.eventId)
    );

    const p = proveedorQueVerifica(true);
    await recibirDeFacturacion(p, "{}", "ok", evento());
    const segunda = await recibirDeFacturacion(p, "{}", "ok", evento());

    // Los webhooks se reintentan por diseño.
    expect(segunda).toEqual({ procesado: false, motivo: "repetido" });
    expect(vistos).toEqual(["ev1"]);
  });

  it("un oyente que falla no impide que corran los demás ni tumba la recepción", async () => {
    const vistos: string[] = [];
    alRecibirDeFacturacion("invoice.paid", async () => {
      throw new Error("el proyecto rompió");
    });
    alRecibirDeFacturacion(
      "invoice.paid",
      async (e) => void vistos.push(e.eventId)
    );

    const r = await recibirDeFacturacion(
      proveedorQueVerifica(true),
      "{}",
      "ok",
      evento()
    );

    // Que un manejador falle no puede hacer que el ERP reintente para siempre.
    expect(r.procesado).toBe(true);
    expect(vistos).toEqual(["ev1"]);
  });

  it("un evento sin oyentes se declara como tal, no como procesado", async () => {
    const r = await recibirDeFacturacion(
      proveedorQueVerifica(true),
      "{}",
      "ok",
      evento({ type: "invoice.overdue", eventId: "ev2" })
    );
    expect(r).toEqual({ procesado: false, motivo: "sin_oyentes" });
  });

  it("cada tipo de evento tiene sus propios oyentes", async () => {
    const pagados: string[] = [];
    const vencidos: string[] = [];
    alRecibirDeFacturacion(
      "invoice.paid",
      async (e) => void pagados.push(e.eventId)
    );
    alRecibirDeFacturacion(
      "invoice.overdue",
      async (e) => void vencidos.push(e.eventId)
    );

    const p = proveedorQueVerifica(true);
    await recibirDeFacturacion(p, "{}", "ok", evento({ eventId: "a" }));
    await recibirDeFacturacion(
      p,
      "{}",
      "ok",
      evento({ type: "invoice.overdue", eventId: "b" })
    );

    expect(pagados).toEqual(["a"]);
    expect(vencidos).toEqual(["b"]);
  });
});
