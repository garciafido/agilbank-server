import { createHash, randomUUID } from "crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express, { Router, json } from "express";
import { agilbankRoutes, configureBackgroundReading, readStatementStage } from "@agilbank/motor";

import { assertSafeTestDatabase } from "../support/testDatabase";
import { basePrisma } from "../../src/prisma/client";
import { autorizarSistemaCliente } from "../../src/common/services/integrationScopes";

const T1 = randomUUID();
const T2 = randomUUID();
const U1 = randomUUID();
const U2 = randomUUID();
const TOKEN1 = `apk_${randomUUID()}`;
const TOKEN2 = `apk_${randomUUID()}`;
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
const enqueued: string[] = [];

const CSV = (concept: string) => Buffer.from(
  `Fecha;Concepto;Importe;Saldo\n01/07/2026;Saldo anterior;;1.000,00\n02/07/2026;${concept};-10,00;990,00\n03/07/2026;Transf recibida;100,00;1.090,00\n`,
);

let server: Server;
let base: string;

const send = (token: string, file: Buffer, name = "julio.csv") => {
  const form = new FormData();
  form.append("archivo", new Blob([file], { type: "text/csv" }), name);
  form.append("cuenta", JSON.stringify({ moneda: "Pesos" }));
  return fetch(`${base}/api/v1/extractos`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form });
};
const get = (token: string, path: string) => fetch(`${base}/api/v1/${path}`, { headers: { authorization: `Bearer ${token}` } });
const work = (tenantId: string, id: string) => readStatementStage({ prisma: basePrisma, currentUser: { tenant_id_: tenantId } }, id);

const wipe = async () => {
  await basePrisma.abConceptCorrection.deleteMany({ where: { tenant_id_: { in: [T1, T2] } } });
  await basePrisma.abStatement.deleteMany({ where: { tenant_id_: { in: [T1, T2] } } });
  await basePrisma.integrationClient.deleteMany({ where: { tenant_id_: { in: [T1, T2] } } });
  await basePrisma.user.deleteMany({ where: { id: { in: [U1, U2] } } });
  await basePrisma.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
};

beforeAll(async () => {
  assertSafeTestDatabase();
  await wipe();
  for (const [tenant, user, token, n] of [[T1, U1, TOKEN1, 1], [T2, U2, TOKEN2, 2]] as const) {
    const audit = { version_: "1", createdAt_: new Date() };
    await basePrisma.tenant.create({ data: { id: tenant, name: `Empresa prueba ${n}`, ...audit } });
    await basePrisma.user.create({ data: {
      id: user, email: `servicio${n}-${tenant}@prueba.local`, name: `Servicio ${n}`, active: true, password: "sin-acceso",
      tenant_: { connect: { id: tenant } }, ...audit,
    } });
    await basePrisma.integrationClient.create({ data: {
      name: `prontonet-${n}`, tokenHash: sha(token), scopes: "ab:leer ab:corregir", status: "active",
      serviceUser: { connect: { id: user } }, createdBy_: { connect: { id: user } }, tenant_: { connect: { id: tenant } }, ...audit,
    } });
  }
  configureBackgroundReading({ storage: memoryStorage });
  const app = express();
  app.use("/api", agilbankRoutes({ Router, json }, {
    db: basePrisma,
    authorizeClient: (token, scope) => autorizarSistemaCliente(token, scope),
    storage: memoryStorage as never,
    enqueueReading: async (id) => { enqueued.push(id); },
  }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await wipe();
  await basePrisma.$disconnect();
});

it("envía, lee en el worker y consulta hasta leido", async () => {
  const file = CSV("COMISION MANTENIMIENTO");
  const sent = await send(TOKEN1, file);
  expect(sent.status).toBe(202);
  const body = await sent.json() as any;
  expect(body).toEqual({ idExtracto: expect.any(String), huella: sha(file), estado: "en-proceso" });
  expect(enqueued).toContain(body.idExtracto);
  expect(await (await get(TOKEN1, `extractos/${body.idExtracto}`)).json() as any).toMatchObject({ estado: "en-proceso", reintentarEn: 5 });

  expect(await work(T1, body.idExtracto)).toEqual({ status: "read" });
  const read = await (await get(TOKEN1, `extractos/${body.idExtracto}`)).json() as any;
  expect(read.estado).toBe("leido");
  expect(read.lectura.renglones.length).toBeGreaterThan(0);
  expect((await (await get(TOKEN1, `extractos/por-huella/${sha(file)}`)).json() as any).idExtracto).toBe(body.idExtracto);
});

it("el mismo archivo devuelve el mismo id, sin encolar otra vez", async () => {
  const file = CSV("COMISION SEGUNDA");
  const first = await (await send(TOKEN1, file)).json() as any;
  const before = enqueued.length;
  const again = await send(TOKEN1, file);
  expect(again.status).toBe(200);
  expect((await again.json() as any).idExtracto).toBe(first.idExtracto);
  expect(enqueued.length).toBe(before);
});

it("un extracto de otra empresa da 404, por id y por huella", async () => {
  const file = CSV("COMISION TERCERA");
  const mine = await (await send(TOKEN1, file)).json() as any;
  expect((await get(TOKEN2, `extractos/${mine.idExtracto}`)).status).toBe(404);
  expect((await get(TOKEN2, `extractos/por-huella/${sha(file)}`)).status).toBe(404);
});

it("una corrección cambia el tipo en la lectura siguiente de su empresa, y en ninguna otra", async () => {
  const corrected = await fetch(`${base}/api/v1/correcciones`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN1}`, "content-type": "application/json" },
    body: JSON.stringify({ textoDelBanco: "GASTO RARO DEL BANCO", tipo: "sellos" }),
  });
  expect(corrected.status).toBe(201);
  const file = CSV("GASTO RARO DEL BANCO");
  const t1 = await (await send(TOKEN1, file)).json() as any;
  const t2 = await (await send(TOKEN2, file)).json() as any;
  await work(T1, t1.idExtracto);
  await work(T2, t2.idExtracto);
  const tipo = async (token: string, id: string) =>
    ((await (await get(token, `extractos/${id}`)).json() as any).lectura.renglones as Array<{ tipo: { codigo: string }; delBanco: { texto: string } }>)
      .find((r) => /GASTO RARO/.test(r.delBanco.texto))!.tipo.codigo;
  expect(await tipo(TOKEN1, t1.idExtracto)).toBe("sellos");
  expect(await tipo(TOKEN2, t2.idExtracto)).not.toBe("sellos");
});

it("sin token: 401 en las tres rutas", async () => {
  expect((await fetch(`${base}/api/v1/extractos/x`)).status).toBe(401);
  expect((await fetch(`${base}/api/v1/extractos`, { method: "POST" })).status).toBe(401);
  expect((await fetch(`${base}/api/v1/correcciones`, { method: "POST" })).status).toBe(401);
});
