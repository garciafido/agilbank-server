// La lectura de un PDF con texto, de punta a punta, con las piezas reales del proyecto.
//
// Mismo montaje que agilbankWiring.test.ts: las rutas tal como las monta server.ts, el pipeline
// generado con el contexto del worker y almacenamiento en un directorio temporal. Lo único simulado
// es la publicación en pgmq. El PDF tiene texto, así que no pasa por el OCR: AP_PADDLE_OCR=off lo
// apaga para que, si algo lo pidiera, la prueba falle en vez de depender de los modelos.

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

/**
 * Un PDF con texto en Helvetica de 10 puntos: cada página es una lista de textos con la posición
 * de su línea base, en puntos desde abajo a la izquierda, como los escribe el PDF.
 */
const pdfConTexto = (paginas: Array<Array<{ x: number; y: number; texto: string }>>): Buffer => {
  const objetos: string[] = [];
  const kids = paginas.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");
  objetos.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>\nendobj\n`);
  objetos.push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  paginas.forEach((textos, i) => {
    const escapar = (t: string) => t.replace(/([()\\])/g, "\\$1");
    const contenido = textos.map((t) => `BT /F1 10 Tf ${t.x} ${t.y} Td (${escapar(t.texto)}) Tj ET`).join("\n");
    objetos.push(
      `${4 + 2 * i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>\nendobj\n`,
    );
    objetos.push(`${5 + 2 * i} 0 obj\n<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream\nendobj\n`);
  });
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objetos) {
    offsets.push(cuerpo.length);
    cuerpo += o;
  }
  const xref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(cuerpo, "latin1");
};

/** Anchos de Helvetica a 10 puntos de lo que lleva un importe. */
const HELVETICA_10: Record<string, number> = { ".": 2.78, ",": 2.78, "-": 3.33 };
const widthOf = (t: string): number => [...t].reduce((s, c) => s + (HELVETICA_10[c] ?? 5.56), 0);
/** Un texto que termina en `xRight`: así se alinean a la derecha los importes de un PDF de prueba. */
const rightAt = (xRight: number, y: number, texto: string) => ({ x: Number((xRight - widthOf(texto)).toFixed(2)), y, texto });

/** Un extracto de dos páginas, con texto, encabezado repetido y pie de página. */
const statementPdf = (): Buffer => {
  const header = (y: number) => [
    { x: 40, y, texto: "FECHA" }, { x: 110, y, texto: "CONCEPTO" }, rightAt(380, y, "DEBITO"), rightAt(460, y, "CREDITO"), rightAt(550, y, "SALDO"),
  ];
  const row = (y: number, date: string, concept: string, debit: string | null, credit: string | null, balance: string) => [
    { x: 40, y, texto: date }, { x: 110, y, texto: concept },
    ...(debit ? [rightAt(380, y, debit)] : []), ...(credit ? [rightAt(460, y, credit)] : []), rightAt(550, y, balance),
  ];
  const foot = (n: number) => [{ x: 250, y: 30, texto: `Pagina ${n} de 2` }];
  return pdfConTexto([
    [...header(780), { x: 110, y: 760, texto: "SALDO ANTERIOR" }, rightAt(550, 760, "1.000,00"),
     ...row(740, "01/07/2026", "COMISION", "-10,00", null, "990,00"), ...row(720, "02/07/2026", "TRANSFERENCIA", null, "40,00", "1.030,00"), ...foot(1)],
    [...header(780), ...row(760, "03/07/2026", "IVA", "-2,10", null, "1.027,90"), ...row(740, "04/07/2026", "DEPOSITO", null, "2,10", "1.030,00"), ...foot(2)],
  ]);
};

const T = randomUUID();
const U = randomUUID();
const TOKEN = `apk_${randomUUID()}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agilbank-pdf-"));
const env = { STORAGE_PROVIDER: process.env.STORAGE_PROVIDER, UPLOAD_DIR: process.env.UPLOAD_DIR, AP_PADDLE_OCR: process.env.AP_PADDLE_OCR };

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
  process.env.AP_PADDLE_OCR = "off";
  StorageFactory.reset();
  await wipe();
  const audit = { version_: "1", createdAt_: new Date() };
  await basePrisma.tenant.create({ data: { id: T, name: "Empresa PDF", ...audit } });
  await basePrisma.user.create({ data: {
    id: U, email: `servicio-${T}@prueba.local`, name: "Servicio", active: true, password: "sin-acceso",
    tenant_: { connect: { id: T } }, ...audit,
  } });
  await basePrisma.integrationClient.create({ data: {
    name: "prontonet-pdf", tokenHash: sha(TOKEN), scopes: "ab:leer", status: "active",
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
  if (env.AP_PADDLE_OCR === undefined) delete process.env.AP_PADDLE_OCR;
  else process.env.AP_PADDLE_OCR = env.AP_PADDLE_OCR;
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


it("un PDF con texto enviado por HTTP lo lee el pipeline generado: verificada, cuatro renglones y la página de cada uno", async () => {
  const pdf = statementPdf();
  const form = new FormData();
  form.append("archivo", new Blob([pdf], { type: "application/pdf" }), "julio.pdf");
  const sent = await fetch(`${base}/api/v1/extractos`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: form });
  expect(sent.status).toBe(202);
  const { idExtracto } = (await sent.json()) as { idExtracto: string };

  const event = await basePrisma.workerEvent.findFirstOrThrow({ where: { payload: { path: ["statementId"], equals: idExtracto } } });
  expect(event).toMatchObject({ tenant_id_: T, jobType: "AbStatementRead.read", status: "queued" });

  const schemaMetaStore = new SchemaMetadataStore();
  schemaMetaStore.build();
  const service = new AbStatementReadPipelineService(basePrisma, schemaMetaStore);
  expect(await service.executeRead({ statementId: idExtracto, workerEventId: event.id }, await workerContext(event.id))).toEqual({ status: "read" });

  const read = await basePrisma.abStatement.findFirstOrThrow({ where: { id: idExtracto, tenant_id_: T } });
  expect(read.status).toBe("read");
  expect(read.lineCount).toBe(4);

  const consulted = await fetch(`${base}/api/v1/extractos/${idExtracto}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const body = (await consulted.json()) as any;
  expect(body.estado).toBe("leido");
  expect(body.lectura.veredicto).toBe("verificada");
  expect(body.lectura.renglones).toHaveLength(4);
  expect(body.lectura.renglones[0].procedencia).toMatchObject({ origen: "pdf", pagina: 1 });
  expect(body.lectura.renglones.map((r: any) => r.procedencia.pagina)).toEqual([1, 1, 2, 2]);
});
