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

// Tres renglones: un cheque con número, una transferencia y una comisión. Datos inventados.
const EXTRACTO = Buffer.from(
  "Fecha;Concepto;Importe;Saldo\n" +
    "01/07/2026;Saldo anterior;;1.000,00\n" +
    "02/07/2026;CHEQUE PAGADO 00012345;-250,00;750,00\n" +
    "03/07/2026;Transf recibida;100,00;850,00\n" +
    "06/07/2026;COMISION MANTENIMIENTO;-10,00;840,00\n",
);
const LOTE = Buffer.from(
  "CUIT;Nro de pago;Monto;Estado;Fecha de pago\n" +
    "20111111112;9001;1.500,00;Procesada;10/07/2026\n" +
    "20222222223;9002;2.300,50;Rechazada por el banco;10/07/2026\n" +
    "20333333334;9003;800,00;Procesada;10/07/2026\n",
);
const PEDIDO = {
  valores: [
    { idValor: 501, tipo: "Cheque propio", numero: "12345", importe: -250, fechaValor: "2026-07-02" },
    { idValor: 502, tipo: "Cheque de terceros", numero: "77777", importe: 777.77, fechaDeposito: "2026-07-03" },
  ],
};

let server: Server;
let base: string;

const auth = { authorization: `Bearer ${TOKEN}` };
const upload = (path: string, file: Buffer, name: string, extra?: Record<string, string>) => {
  const form = new FormData();
  form.append("archivo", new Blob([file], { type: "text/csv" }), name);
  for (const [k, v] of Object.entries(extra ?? {})) form.append(k, v);
  return fetch(`${base}/api/v1/${path}`, { method: "POST", headers: auth, body: form });
};
const reconcile = (id: string, body: unknown) =>
  fetch(`${base}/api/v1/extractos/${id}/conciliacion`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) => fetch(`${base}/api/v1/${path}`, { headers: auth });

const wipe = async () => {
  await basePrisma.abReconciliation.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.abPaymentBatch.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.abStatement.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.integrationClient.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.user.deleteMany({ where: { id: U } });
  await basePrisma.tenant.deleteMany({ where: { id: T } });
};

beforeAll(async () => {
  assertSafeTestDatabase();
  await wipe();
  const audit = { version_: "1", createdAt_: new Date() };
  await basePrisma.tenant.create({ data: { id: T, name: "Empresa apareo", ...audit } });
  await basePrisma.user.create({ data: {
    id: U, email: `servicio-${T}@prueba.local`, name: "Servicio", active: true, password: "sin-acceso",
    tenant_: { connect: { id: T } }, ...audit,
  } });
  await basePrisma.integrationClient.create({ data: {
    name: "prontonet-apareo", tokenHash: sha(TOKEN), scopes: "ab:leer ab:conciliar", status: "active",
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
let idCheque: string;

it("sube el extracto y lo lee", async () => {
  const sent = await upload("extractos", EXTRACTO, "julio.csv", { cuenta: JSON.stringify({ moneda: "Pesos" }) });
  expect(sent.status).toBe(202);
  idExtracto = ((await sent.json()) as { idExtracto: string }).idExtracto;
  expect(await readStatementStage({ prisma: basePrisma, currentUser: { tenant_id_: T } }, idExtracto)).toEqual({ status: "read" });
  const read = (await (await get(`extractos/${idExtracto}`)).json()) as { estado: string; lectura: { renglones: Array<{ id: string; delBanco: { texto: string } }> } };
  expect(read.estado).toBe("leido");
  expect(read.lectura.renglones).toHaveLength(3);
  idCheque = read.lectura.renglones.find((r) => r.delBanco.texto.includes("CHEQUE"))!.id;
});

it("concilia: el cheque se aparea por número e importe, y los otros dos renglones quedan pendientes", async () => {
  const first = await reconcile(idExtracto, PEDIDO);
  expect(first.status).toBe(200);
  const body = (await first.json()) as { idConciliacion: string; propuestas: Array<{ idRenglon: string; tipo: string; valores: unknown; coincidencias: unknown }> };
  expect(body.idConciliacion).toEqual(expect.any(String));
  expect(body.propuestas).toHaveLength(3);
  const apareos = body.propuestas.filter((p) => p.tipo === "apareo");
  expect(apareos).toHaveLength(1);
  expect(apareos[0]).toMatchObject({ idRenglon: idCheque, valores: [501], coincidencias: { importe: true, numero: "12345" } });
  expect(body.propuestas.filter((p) => p.tipo === "pendiente")).toHaveLength(2);

  const again = await reconcile(idExtracto, PEDIDO);
  expect(again.status).toBe(200);
  expect(await again.json()).toEqual(body);

  const consulted = await get(`conciliaciones/${body.idConciliacion}`);
  expect(consulted.status).toBe(200);
  expect(await consulted.json()).toEqual(body);
});

it("una conciliación sin Content-Type: application/json da 415", async () => {
  const r = await fetch(`${base}/api/v1/extractos/${idExtracto}/conciliacion`, {
    method: "POST",
    headers: { ...auth, "content-type": "text/plain" },
    body: JSON.stringify(PEDIDO),
  });
  expect(r.status).toBe(415);
  expect(((await r.json()) as { codigo: string }).codigo).toBe("CUERPO_NO_SOPORTADO");
});

it("sube un lote de pagos: cuenta las transferencias y las rechazadas", async () => {
  const sent = await upload("lotes", LOTE, "pagos.csv");
  expect(sent.status).toBe(201);
  expect(await sent.json()).toEqual({ idLote: expect.any(String), transferencias: 3, conError: 1 });
});
