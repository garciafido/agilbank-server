// La conexión real de la API de ProntoNet con el producto, sin fingir ninguna pieza propia.
//
// La prueba de punta a punta (agilbankApi.test.ts) arma su propio express y llama al paso del motor
// a mano. Esta monta las rutas del proyecto tal como las monta server.ts, encola por el pipeline
// generado y lee por `executeRead`, con el contexto que arma el worker y con projectBootstrap
// cargado. Si una regeneración cambia lo que el pipeline usa del contexto, esto falla acá y no en
// producción. Lo único simulado es la publicación en pgmq: la base de test no tiene la extensión.

import { createHash, randomUUID } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express from "express";
import { container } from "tsyringe";

jest.mock("../../src/utils/pgmq", () => ({
  ...jest.requireActual("../../src/utils/pgmq"),
  enqueuePipelineJob: jest.fn(async () => 1),
}));

import "../../src/core/dependencyContainer";
import "../../src/workers/projectBootstrap";
import projectRoutes from "../../src/routes/projectRoutes";
import { enqueuePipelineJob } from "../../src/utils/pgmq";
import { StorageFactory } from "../../src/common/storage";
import { SchemaMetadataStore } from "../../src/common/services/schemaMetadata";
import { AbStatementReadPipelineService } from "../../src/pipelines/abStatementRead/abStatementReadService";
import type { MyApolloContext } from "../../src/server";
import { basePrisma } from "../../src/prisma/client";
import { assertSafeTestDatabase } from "../support/testDatabase";

const T = randomUUID();
const U = randomUUID();
const TOKEN = `apk_${randomUUID()}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const CSV = Buffer.from(
  `Fecha;Concepto;Importe;Saldo\n01/07/2026;Saldo anterior;;1.000,00\n02/07/2026;COMISION CONEXION ${T};-10,00;990,00\n03/07/2026;Transf recibida;100,00;1.090,00\n`,
);

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agilbank-conexion-"));
const env = { STORAGE_PROVIDER: process.env.STORAGE_PROVIDER, UPLOAD_DIR: process.env.UPLOAD_DIR };

let server: Server;
let base: string;

const wipe = async () => {
  await basePrisma.workerEvent.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.abStatement.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.integrationClient.deleteMany({ where: { tenant_id_: T } });
  await basePrisma.user.deleteMany({ where: { id: U } });
  await basePrisma.tenant.deleteMany({ where: { id: T } });
};

beforeAll(async () => {
  assertSafeTestDatabase();
  process.env.STORAGE_PROVIDER = "filesystem";
  process.env.UPLOAD_DIR = UPLOAD_DIR;
  StorageFactory.reset();
  await wipe();
  const audit = { version_: "1", createdAt_: new Date() };
  await basePrisma.tenant.create({ data: { id: T, name: "Empresa conexión", ...audit } });
  await basePrisma.user.create({ data: {
    id: U, email: `servicio-${T}@prueba.local`, name: "Servicio", active: true, password: "sin-acceso",
    tenant_: { connect: { id: T } }, ...audit,
  } });
  await basePrisma.integrationClient.create({ data: {
    name: "prontonet-conexion", tokenHash: sha(TOKEN), scopes: "ab:leer", status: "active",
    serviceUser: { connect: { id: U } }, createdBy_: { connect: { id: U } }, tenant_: { connect: { id: T } }, ...audit,
  } });
  const app = express();
  app.use("/api", projectRoutes);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await wipe();
  StorageFactory.reset();
  process.env.STORAGE_PROVIDER = env.STORAGE_PROVIDER;
  process.env.UPLOAD_DIR = env.UPLOAD_DIR;
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  await basePrisma.$disconnect();
});

/** El contexto que arma el worker para un trabajo de pipeline (src/workers/worker.ts). */
const workerContext = async (workerEventId: string): Promise<MyApolloContext> => {
  const workerEvent = await basePrisma.workerEvent.findUnique({
    where: { id: workerEventId },
    include: { triggerUserId: { include: { roles: { include: { permissions: true } }, tenant_: true } } },
  });
  const user = workerEvent!.triggerUserId;
  return {
    currentUser: user as any,
    isSystemMode: false,
    hasRole: (role: string) => user?.roles?.some((r: any) => r.name === role) || false,
    permissions: () => new Set<string>(user.roles.flatMap((role: any) => (role.permissions || []).map((p: any) => p.id))),
    prisma: basePrisma,
    container: container.createChildContainer(),
  } as unknown as MyApolloContext;
};

it("un envío por HTTP crea el extracto y su evento en la empresa, y el pipeline generado lo deja leído", async () => {
  const form = new FormData();
  form.append("archivo", new Blob([CSV], { type: "text/csv" }), "julio.csv");
  const sent = await fetch(`${base}/api/v1/extractos`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: form });
  expect(sent.status).toBe(202);
  const { idExtracto } = (await sent.json()) as { idExtracto: string };

  const statement = await basePrisma.abStatement.findFirst({ where: { id: idExtracto, tenant_id_: T } });
  expect(statement).toMatchObject({ status: "queued", contentHash: sha(CSV), createdBy_id_: U, originalName: "julio.csv" });
  const stored = statement!.file_server_data as { baseName: string; uuid: string; filename: string };
  expect(fs.readFileSync(path.join(UPLOAD_DIR, `${stored.baseName}${stored.uuid}/${stored.filename}`))).toEqual(CSV);

  const events = await basePrisma.workerEvent.findMany({ where: { payload: { path: ["statementId"], equals: idExtracto } } });
  expect(events).toHaveLength(1);
  const [event] = events;
  expect(event).toMatchObject({ tenant_id_: T, triggerUserId_id: U, jobType: "AbStatementRead.read", status: "queued", queueName: "pipeline_jobs" });
  expect(event.payload).toMatchObject({ statementId: idExtracto, pipelineId: "AbStatementRead", stageId: "read" });
  expect(enqueuePipelineJob).toHaveBeenCalledTimes(1);
  expect(enqueuePipelineJob).toHaveBeenCalledWith("AbStatementRead", "read", { statementId: idExtracto, workerEventId: event.id }, undefined, expect.anything());

  const schemaMetaStore = new SchemaMetadataStore();
  schemaMetaStore.build();
  const service = new AbStatementReadPipelineService(basePrisma, schemaMetaStore);
  expect(await service.executeRead({ statementId: idExtracto, workerEventId: event.id }, await workerContext(event.id))).toEqual({ status: "read" });

  const read = await basePrisma.abStatement.findFirst({ where: { id: idExtracto, tenant_id_: T } });
  expect(read!.status).toBe("read");
  expect(read!.lineCount).toBeGreaterThan(0);
  const consulted = await fetch(`${base}/api/v1/extractos/${idExtracto}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  expect(((await consulted.json()) as { estado: string }).estado).toBe("leido");
});
