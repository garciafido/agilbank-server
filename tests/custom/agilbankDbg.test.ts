import { createHash, randomUUID } from "crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express, { Router, json } from "express";
import { agilbankRoutes, configureBackgroundReading, readStatementStage } from "@agilbank/motor";

import { assertSafeTestDatabase } from "../support/testDatabase";
import { basePrisma } from "../../src/prisma/client";
import { autorizarSistemaCliente } from "../../src/common/services/integrationScopes";

const T = randomUUID();
const U = randomUUID();
const TOKEN = `apk_${randomUUID()}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const files = new Map<string, Buffer>();
const memoryStorage = () => ({
  uploadStream: async (stream: NodeJS.ReadableStream, key: string) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    files.set(key, Buffer.concat(chunks));
  },
  downloadBuffer: async (key: string) => {
    const file = files.get(key);
    if (!file) throw new Error(`no está: ${key}`);
    return file;
  },
});

// Una comisión, su IVA al 21 % y una transferencia. Datos inventados.
const EXTRACTO = Buffer.from(
  "Fecha;Concepto;Importe;Saldo\n" +
    "01/07/2026;Saldo anterior;;1.000,00\n" +
    "02/07/2026;COMISION MANTENIMIENTO;-100,00;900,00\n" +
    "02/07/2026;IVA S/COMISION;-21,00;879,00\n" +
    "03/07/2026;Transf recibida;50,00;929,00\n",
);
const PEDIDO = {
  tiposGastoBancario: [{ id: 7, descripcion: "GASTOS BANCARIOS", coeficiente: 1 }],
  cuentasImputables: [
    { id: 310, codigo: "5.1.01", descripcion: "COMISIONES BANCARIAS" },
    { id: 311, codigo: "5.1.02", descripcion: "GASTOS VARIOS" },
  ],
  cuentasIvaYPercepciones: [{ id: 410, codigo: "1.1.05", descripcion: "IVA CREDITO FISCAL" }],
};
const COMISIONES = { id: "310", codigo: "5.1.01" };
const VARIOS = { id: "311", codigo: "5.1.02" };

type Propuesta = { idPropuesta: string; idRenglon: string; tipo: string; cuenta: { id: string } | null; origen: string | null; importe: number | null };
type Conciliacion = { idConciliacion: string; propuestas: Propuesta[] };

let server: Server;
let base: string;

const auth = { authorization: `Bearer ${TOKEN}` };
const json_ = { ...auth, "content-type": "application/json" };
const post = (path: string, body: unknown, headers: Record<string, string> = json_) =>
  fetch(`${base}/api/v1/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const reconcile = (id: string) => post(`extractos/${id}/conciliacion`, PEDIDO);
const decide = (decisiones: unknown[]) => post("decisiones", { decisiones });

const wipe = async () => {
  await basePrisma.abDecision.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.abReconciliation.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.abStatement.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.integrationClient.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.user.deleteMany({ where: { id: U } });
  await basePrisma.tenant.deleteMany({ where: { id: T } });
};

beforeAll(async () => {
  assertSafeTestDatabase();
  await wipe();
  const audit = { version_: "1", createdAt_: new Date() };
  await basePrisma.tenant.create({ data: { id: T, name: "Empresa DBG", ...audit } });
  await basePrisma.user.create({ data: {
    id: U, email: `servicio-${T}@prueba.local`, name: "Servicio", active: true, password: "sin-acceso",
    tenant_: { connect: { id: T } }, ...audit,
  } });
  await basePrisma.integrationClient.create({ data: {
    name: "prontonet-dbg", tokenHash: sha(TOKEN), scopes: "ab:leer ab:conciliar ab:decidir", status: "active",
    serviceUser: { connect: { id: U } }, createdBy_: { connect: { id: U } }, tenant_: { connect: { id: T } }, ...audit,
  } });
  configureBackgroundReading({ storage: memoryStorage });
  const app = express();
  app.use("/api", agilbankRoutes({ Router, json }, {
    db: basePrisma,
    authorizeClient: (token, scope) => autorizarSistemaCliente(token, scope),
    storage: memoryStorage as never,
    enqueueReading: async () => undefined,
  }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await wipe();
  await basePrisma.$disconnect();
});

let idExtracto: string;
let primera: Conciliacion;
let dbgs: Propuesta[];

it("sube el extracto y lo lee", async () => {
  const form = new FormData();
  form.append("archivo", new Blob([EXTRACTO], { type: "text/csv" }), "julio.csv");
  form.append("cuenta", JSON.stringify({ moneda: "Pesos" }));
  const sent = await fetch(`${base}/api/v1/extractos`, { method: "POST", headers: auth, body: form });
  expect(sent.status).toBe(202);
  idExtracto = ((await sent.json()) as { idExtracto: string }).idExtracto;
  expect(await readStatementStage({ prisma: basePrisma, currentUser: { tenant_id_: T } }, idExtracto)).toEqual({ status: "read" });
});

it("concilia con el catálogo: la comisión y su IVA son un DBG en COMISIONES, y la transferencia queda pendiente", async () => {
  const res = await reconcile(idExtracto);
  expect(res.status).toBe(200);
  primera = (await res.json()) as Conciliacion;
  dbgs = primera.propuestas.filter((p) => p.tipo === "dbg");
  expect(dbgs).toHaveLength(2);
  expect(dbgs[0]).toMatchObject({ cuenta: COMISIONES, origen: "catalogo", importe: -121 });
  const { idPropuesta, idRenglon, ...grupo } = dbgs[0];
  const { idPropuesta: _otra, idRenglon: _otroRenglon, ...delIva } = dbgs[1];
  expect(delIva).toEqual(grupo);
  expect(idPropuesta).not.toBe(dbgs[1].idPropuesta);
  expect(primera.propuestas.filter((p) => p.tipo === "pendiente")).toHaveLength(1);
});

it("la decisión que corrige la cuenta a GASTOS VARIOS se registra", async () => {
  const res = await decide([{
    idConciliacion: primera.idConciliacion, idPropuesta: dbgs[0].idPropuesta, resultado: "corregida",
    elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 311, cuentaIva: 410 },
  }]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ registradas: [dbgs[0].idPropuesta], rechazadas: [] });
});

it("al conciliar de nuevo, el DBG sale con la cuenta decidida, de otra conciliación", async () => {
  const res = await reconcile(idExtracto);
  expect(res.status).toBe(200);
  const segunda = (await res.json()) as Conciliacion;
  expect(segunda.idConciliacion).not.toBe(primera.idConciliacion);
  const aprendidos = segunda.propuestas.filter((p) => p.tipo === "dbg");
  expect(aprendidos).toHaveLength(2);
  for (const p of aprendidos) expect(p).toMatchObject({ cuenta: VARIOS, origen: "decision", importe: -121 });
});

it("una decisión sobre una conciliación inexistente se rechaza con su motivo", async () => {
  const res = await decide([{
    idConciliacion: randomUUID(), idPropuesta: dbgs[0].idPropuesta, resultado: "aceptada",
    elegido: { tipo: "dbg", tipoMovimiento: 7, cuenta: 310 },
  }]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    registradas: [],
    rechazadas: [{ idPropuesta: dbgs[0].idPropuesta, motivo: expect.stringContaining("conciliación") }],
  });
});

it("una decisión sin Content-Type: application/json da 415", async () => {
  const res = await post("decisiones", { decisiones: [] }, { ...auth, "content-type": "text/plain" });
  expect(res.status).toBe(415);
  expect(((await res.json()) as { codigo: string }).codigo).toBe("CUERPO_NO_SOPORTADO");
});
