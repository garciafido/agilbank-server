// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Los avisos guardados que traen clave de texto (metadata.i18nKey, sus
 * parámetros y una variante opcional): el server guarda la metadata como objeto
 * y le manda al cliente solo la clave, los parámetros y la variante, en el aviso
 * nuevo y en los sin leer que reenvía en cada conexión. Lo demás de la metadata
 * (por ejemplo la clave de deduplicación de las alertas) no sale del server.
 *
 * No usa base: la tabla de avisos va simulada.
 */

const mockCreate = jest.fn();
const mockFindMany = jest.fn();

jest.mock("../../src/prisma/client", () => ({
  basePrisma: {
    userNotification: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import {
  notificationMetadataForClient,
  sseManager,
} from "../../src/services/sse/SSEManager";

const written: string[] = [];
const connect = (userId: string) =>
  sseManager.addClient({
    id: "client-" + userId,
    userId,
    tenantId: "t1",
    roles: [],
    res: {
      write: (chunk: string) => {
        written.push(chunk);
        return true;
      },
      on: () => undefined,
      end: () => undefined,
    } as any,
    lastHeartbeat: Date.now(),
  });
/**
 * Los mensajes de un tipo que salieron por el SSE. Se buscan por type: entre ellos
 * puede haber un latido (": heartbeat", que no es JSON) u otro mensaje.
 */
const sent = (type: string) =>
  written
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)))
    .filter((message) => message.type === type);
const row = (metadata: unknown) => ({
  id: "n1",
  type: "system",
  priority: "medium",
  title: "T",
  body: null,
  actorUser: null,
  objectType: "Contact",
  objectId: "c1",
  actionUrl: "/contact/view/c1",
  metadata,
  createdAt_: new Date("2026-10-09T12:00:00Z"),
});

beforeEach(() => {
  written.length = 0;
});

afterEach(() => {
  for (const userId of ["u1", "u2"])
    sseManager.removeClient("client-" + userId);
});

afterAll(() => {
  // dispose() avisa por consola que cerró: acá es ruido.
  const quiet = jest.spyOn(console, "log").mockImplementation(() => undefined);
  sseManager.dispose();
  quiet.mockRestore();
});

describe("notificationMetadataForClient", () => {
  it("la clave, los parámetros y la variante pasan; lo demás no", () => {
    expect(
      notificationMetadataForClient({
        i18nKey: "k",
        params: { a: 1 },
        variant: "verified",
        alertDedupKey: "d",
      })
    ).toEqual({ i18nKey: "k", params: { a: 1 }, variant: "verified" });
  });

  it("guardada como texto JSON (los avisos de antes), también", () => {
    expect(
      notificationMetadataForClient(
        JSON.stringify({ i18nKey: "k", params: { a: 1 } })
      )
    ).toEqual({
      i18nKey: "k",
      params: { a: 1 },
    });
  });

  it("sin clave (como las alertas), o ilegible: null", () => {
    for (const value of [
      { alertDedupKey: "d" },
      null,
      undefined,
      "no es json",
      [],
      { i18nKey: "" },
      { i18nKey: 3 },
    ]) {
      expect(notificationMetadataForClient(value)).toBeNull();
    }
  });

  it("parámetros que no son un objeto: vacíos; una variante que no es texto no pasa", () => {
    expect(
      notificationMetadataForClient({ i18nKey: "k", params: [1], variant: 2 })
    ).toEqual({ i18nKey: "k", params: {} });
    expect(notificationMetadataForClient({ i18nKey: "k" })).toEqual({
      i18nKey: "k",
      params: {},
    });
  });
});

describe("SSEManager", () => {
  it("guarda la metadata como objeto y al cliente le manda la clave, los parámetros y la variante", async () => {
    connect("u1");
    mockCreate.mockResolvedValue(
      row({ i18nKey: "k", params: { a: 1 }, variant: "verified", interno: "x" })
    );
    await sseManager.createAndSendNotification("u1", "t1", {
      type: "system",
      title: "T",
      metadata: { i18nKey: "k", params: { a: 1 }, variant: "verified" },
    });
    expect(mockCreate.mock.calls[0][0].data.metadata).toEqual({
      i18nKey: "k",
      params: { a: 1 },
      variant: "verified",
    });
    expect(sent("notification")).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          id: "n1",
          metadata: { i18nKey: "k", params: { a: 1 }, variant: "verified" },
        }),
      }),
    ]);
  });

  it("en los sin leer que reenvía, la misma metadata para el cliente", async () => {
    connect("u2");
    mockFindMany.mockResolvedValue([
      row({ alertDedupKey: "d" }),
      row({ i18nKey: "k", params: { b: true } }),
    ]);
    await sseManager.loadUnreadNotifications("u2", "t1");
    const unread = sent("notifications.unread");
    expect(unread).toHaveLength(1);
    expect(unread[0].payload.notifications.map((n: any) => n.metadata)).toEqual(
      [null, { i18nKey: "k", params: { b: true } }]
    );
  });
});
