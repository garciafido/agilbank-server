// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * La confirmación del formulario público de validación de datos
 * (POST /api/public/external-validation/submit) y lo que la página pública pide
 * antes (GET /api/public/verify-email/info).
 *
 * 1. Los cambios (por el UpdateService de la entidad), el asiento del proyecto
 *    (src/common/externalValidation/onSubmitted.ts) y la marca de verificado
 *    corren en UNA transacción, en ese orden. Si algo tira, no queda nada
 *    aplicado ni avisado.
 * 2. Solo confirma una verificación que, dentro de la transacción, sigue
 *    pendiente: un doble envío del mismo formulario no corre dos veces el
 *    asiento ni avisa dos veces. Un choque con otra transacción (P2034, crudo,
 *    envuelto por el UpdateService o al confirmar) se reintenta una vez, cada
 *    intento con su propio alcance (lo diferido de uno que choca se descarta), y
 *    nunca se le muestra al contacto como un error de validación. Lo que el
 *    asiento deja para después (afterCommit) corre una sola vez, del intento
 *    que confirmó, después del commit y antes del aviso; si falla, no deshace
 *    nada.
 * 3. Un texto vacío o con solo espacios llega como null en un campo opcional y
 *    vacío en uno obligatorio, que el UpdateService rechaza: la respuesta dice
 *    qué campo falta, para que el formulario lo marque. Un Enum en blanco llega
 *    null siempre; uno fuera de sus opciones se rechaza antes del servicio. Una
 *    referencia se acepta si la fila existe, sea o no su id un UUID (un país
 *    sembrado con el nombre de id); lo que no es un texto, un texto más largo que
 *    un id, una consulta que tira o un registry sin el modelo de la fila la
 *    rechazan, y la confirmación sigue con el resto.
 * 4. Después del commit: el evento en vivo lleva el id del registro, y cada
 *    administrador de sitio activo de la empresa de la verificación (nunca la
 *    de otra, ni una que diga el pedido) recibe un aviso guardado, con el
 *    enlace al formulario del registro y la clave de texto para el cliente. Si
 *    avisar falla, la confirmación queda. Los eventos en vivo se esperan con
 *    plazo: con un Redis que no contesta, la respuesta llega igual, y los
 *    eventos salen en orden cuando Redis conteste, sin rechazos sin atrapar.
 * 5. La información de la página pública dice de qué entidad es (entityName),
 *    para que el proyecto pueda poner su propia pantalla. Cada fila de un
 *    catálogo (lookups) trae, además del id, el nombre y el padre, los códigos
 *    que el registry declara para ese catálogo (extraFields), con su nombre:
 *    así la pantalla elige una fila por su código y no por el nombre. Un código
 *    vacío o que no es un texto no va, ni ninguna otra columna de la fila.
 * 6. El log no lleva lo que mandó el contacto ni su nombre: de un error, solo
 *    el tipo y el código (su mensaje puede traer los dos).
 *
 * No usa base: la base, Redis, la sesión, el asiento, el servicio de la entidad
 * y los avisos van simulados.
 */

import { generateVerificationSignature } from "../../src/common/utils/emailVerification";
import { NullValueError } from "../../src/common/errors/NullValueError";
import { ValidationError } from "../../src/common/errors/ValidationError";
import { PrismaError } from "../../src/common/errors/PrismaError";
import { logger } from "../../src/utils/logger";
import { withDeadline } from "../../src/utils/withDeadline";

// Los efectos confirmados: lo que hizo un intento que no llega a confirmar se
// descarta, como en la base.
const mockEvents: string[] = [];
let mockInsideTransaction = false;
let mockAttempts = 0;
// Errores que tira la transacción al confirmar (COMMIT), uno por intento.
const mockCommitFailures: unknown[] = [];
// Las opciones con que se abrió cada transacción (aislamiento y plazos).
const mockTxOptions: unknown[] = [];
// El orden de lo que pasa alrededor del commit: "commit", lo diferido por el
// servicio ("deferred"), el afterCommit del asiento y el aviso ("notify").
const mockOrder: string[] = [];
const mockDeferred = jest.fn(async () => {
  mockOrder.push("deferred");
});
// El estado de la verificación leído dentro de la transacción, y la marca.
const mockTxStatus = jest.fn();
const mockTxMark = jest.fn();
const mockTx = {
  emailVerification: {
    findUnique: (...args: unknown[]) => mockTxStatus(...args),
    updateMany: (...args: unknown[]) => mockTxMark(...args),
  },
};
const mockServiceUpdate = jest.fn();
const mockServiceContexts: unknown[] = [];
const mockOnSubmitted = jest.fn();
const mockNotify = jest.fn();
const mockPublish = jest.fn();
const mockContactFindFirst = jest.fn();
const mockUserFindMany = jest.fn();
const mockVerificationFindUnique = jest.fn();
// Las filas de los catálogos de la página pública (lookups): uno con códigos y otro sin ellos.
const mockCountryFindMany = jest.fn();
const mockProvinceFindMany = jest.fn();
// La consulta de existencia de una referencia al país (refPrismaModel "country").
const mockCountryFindUnique = jest.fn();
// El asiento del nombre de la empresa (senderDisplayName): por defecto no da ninguno.
const mockSenderDisplayName = jest.fn();

jest.mock("../../src/prisma/client", () => ({
  basePrisma: {
    $transaction: async (
      fn: (tx: unknown) => Promise<unknown>,
      options?: unknown
    ) => {
      mockAttempts += 1;
      mockTxOptions.push(options);
      const before = mockEvents.length;
      mockInsideTransaction = true;
      try {
        const result = await fn(mockTx);
        const failure = mockCommitFailures.shift();
        if (failure) throw failure;
        mockOrder.push("commit");
        return result;
      } catch (error) {
        mockEvents.length = before;
        throw error;
      } finally {
        mockInsideTransaction = false;
      }
    },
    emailVerification: {
      findUnique: (...args: unknown[]) => mockVerificationFindUnique(...args),
      update: async () => ({}),
    },
    contact: {
      findFirst: (...args: unknown[]) => mockContactFindFirst(...args),
    },
    user: { findMany: (...args: unknown[]) => mockUserFindMany(...args) },
    country: {
      findMany: (...args: unknown[]) => mockCountryFindMany(...args),
      findUnique: (...args: unknown[]) => mockCountryFindUnique(...args),
    },
    province: {
      findMany: (...args: unknown[]) => mockProvinceFindMany(...args),
    },
    tenant: {
      findUnique: async () => ({
        id: "t1",
        name: "EMPRESA",
        logo_data: null,
        publicUrl: null,
      }),
    },
  },
}));
jest.mock("../../src/services/redis/redisClient", () => ({
  redis: { publish: (...args: unknown[]) => mockPublish(...args) },
}));
jest.mock("../../src/workers/queues/emailQueue", () => ({
  enqueueVerificationEmail: async () => undefined,
}));
jest.mock("../../src/service-context", () => ({
  createContext: async () => ({
    currentUser: null,
    permissions: () => new Set(),
    prisma: {},
  }),
}));
jest.mock("../../src/common/services/securePrismaOps", () => ({
  SecurePrismaOps: class {},
}));
jest.mock("../../src/common/emailVerification/senderDisplayName", () => ({
  senderDisplayName: (...args: unknown[]) => mockSenderDisplayName(...args),
}));
jest.mock("../../src/common/externalValidation/onSubmitted", () => ({
  onExternalValidationSubmitted: (...args: unknown[]) =>
    mockOnSubmitted(...args),
}));
jest.mock("../../src/services/sse/SSEManager", () => ({
  sseManager: {
    createAndSendNotificationToMultiple: (...args: unknown[]) =>
      mockNotify(...args),
  },
}));
jest.mock("../../src/common/externalValidation/registry", () => {
  // Recibe su ServiceContext por tsyringe, como el UpdateService generado: así se
  // ve con qué cliente corre (el de la transacción, txPrisma). Y, como él, difiere
  // algo al commit (un evento, una invalidación de caché) con runAfterCommit.
  const { inject, injectable } = require("tsyringe");
  const {
    runAfterCommit,
  } = require("../../src/common/services/transactionScope");
  class ContactUpdateService {
    constructor(private context: unknown) {}
    async updateContact(args: Record<string, unknown>) {
      // Difiere antes de validar: si después rechaza (mockServiceUpdate), lo
      // diferido tiene que descartarse con el intento y no correr nunca.
      await runAfterCommit(async () => mockDeferred());
      mockServiceUpdate(args, mockInsideTransaction);
      mockServiceContexts.push(this.context);
      mockEvents.push("update");
      return {};
    }
  }
  inject("ServiceContext")(ContactUpdateService, undefined, 0);
  injectable()(ContactUpdateService);
  return {
    externalValidationRegistry: {
      Contact: {
        projectionName: "ContactPublic",
        prismaModel: "contact",
        entityName: "Contact",
        emailField: "email",
        contactNameField: "firstName",
        entityRoute: "contact",
        displayNameSelect: { firstName: true, lastName: true },
        displayName: (row: {
          firstName?: string | null;
          lastName?: string | null;
        }) => (row.firstName ?? "∅") + " " + (row.lastName ?? "∅"),
        fields: [
          {
            name: "firstName",
            type: "String",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
          },
          {
            name: "taxId",
            type: "String",
            label: {},
            readOnly: false,
            required: false,
            nullable: true,
            multilang: false,
          },
          {
            name: "gender",
            type: "Enum",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
            options: [
              { value: "female", label: {} },
              { value: "male", label: {} },
            ],
          },
          {
            name: "taxIdType",
            type: "Enum",
            label: {},
            readOnly: false,
            required: false,
            nullable: true,
            multilang: false,
            options: [
              { value: "cuit", label: {} },
              { value: "dni", label: {} },
            ],
          },
          // Un Enum sin opciones declaradas (un registry editado a mano).
          {
            name: "kind",
            type: "Enum",
            label: {},
            readOnly: false,
            required: false,
            nullable: true,
            multilang: false,
          },
          // Obligatorios y opcionales que no son texto: números, un booleano y referencias.
          {
            name: "age",
            type: "Int",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
          },
          {
            name: "ratio",
            type: "Decimal",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
          },
          {
            name: "active",
            type: "Boolean",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
          },
          {
            name: "country",
            type: "Ref",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
            refEntity: "Country",
            refPrismaModel: "country",
          },
          {
            name: "floors",
            type: "Int",
            label: {},
            readOnly: false,
            required: false,
            nullable: true,
            multilang: false,
          },
          {
            name: "subscribed",
            type: "Boolean",
            label: {},
            readOnly: false,
            required: false,
            nullable: true,
            multilang: false,
          },
          // Un día de calendario obligatorio (fecha sin hora).
          {
            name: "born",
            type: "Date",
            label: {},
            readOnly: false,
            required: true,
            nullable: false,
            multilang: false,
          },
          // Sin refPrismaModel: un registry sin el modelo de la fila referenciada.
          {
            name: "province",
            type: "Ref",
            label: {},
            readOnly: false,
            required: false,
            nullable: true,
            multilang: false,
            refEntity: "Province",
          },
        ],
        groups: [],
        selectFields: {
          firstName: true,
          taxId: true,
          gender: true,
          taxIdType: true,
          kind: true,
          age: true,
          ratio: true,
          active: true,
          country_id: true,
          floors: true,
          subscribed: true,
          province_id: true,
          born: true,
        },
        editableFields: [
          "firstName",
          "taxId",
          "gender",
          "taxIdType",
          "kind",
          "age",
          "ratio",
          "active",
          "country",
          "floors",
          "subscribed",
          "province",
          "born",
        ],
        // Los catálogos de las referencias editables: el de países trae el código de
        // cada fila (extraFields); el de provincias, no.
        refLookups: [
          {
            entityName: "Country",
            prismaModel: "country",
            displayField: "name",
            displayMultilang: false,
            extraFields: ["code"],
            selectFields: { id: true, name: true, code: true },
          },
          {
            entityName: "Province",
            prismaModel: "province",
            displayField: "name",
            displayMultilang: false,
            compositeRefField: "country",
            selectFields: { id: true, name: true, country_id: true },
          },
        ],
        updateService: ContactUpdateService,
        updateMethod: "updateContact",
      },
    },
  };
});

const OLD = {
  id: "c1",
  version_: "v0",
  firstName: "Ana",
  taxId: "20-12345678-6",
  gender: "female",
  taxIdType: "cuit",
  kind: null,
  age: 30,
  ratio: 1.5,
  active: true,
  country_id: "00000000-0000-4000-8000-000000000001",
  floors: 2,
  subscribed: true,
  province_id: "00000000-0000-4000-8000-000000000002",
  born: new Date("1985-03-12T00:00:00.000Z"),
};
const SIG = generateVerificationSignature("v1", "ana@example.com", "t1");
let router: any;
// El log, simulado: para ver qué lleva (y que no lleve lo que mandó el contacto).
const logs: Record<"info" | "warn" | "error", jest.SpyInstance> = {} as any;

beforeAll(() => {
  router = require("../../src/routes/emailVerification.routes").default;
  for (const level of ["info", "warn", "error"] as const) {
    logs[level] = jest.spyOn(logger, level).mockImplementation(() => undefined);
  }
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockEvents.length = 0;
  mockServiceContexts.length = 0;
  for (const mock of [
    mockServiceUpdate,
    mockOnSubmitted,
    mockNotify,
    mockPublish,
    mockContactFindFirst,
    mockUserFindMany,
    mockVerificationFindUnique,
    mockCountryFindMany,
    mockProvinceFindMany,
    mockCountryFindUnique,
  ]) {
    mock.mockReset();
  }
  mockCountryFindUnique.mockImplementation(
    async (args: { where: { id: string } }) => ({ id: args.where.id })
  );
  mockCountryFindMany.mockResolvedValue([]);
  mockProvinceFindMany.mockResolvedValue([]);
  for (const spy of Object.values(logs)) spy.mockClear();
  mockSenderDisplayName.mockReset();
  mockSenderDisplayName.mockResolvedValue("");
  mockAttempts = 0;
  mockCommitFailures.length = 0;
  mockTxOptions.length = 0;
  mockOrder.length = 0;
  mockDeferred.mockClear();
  mockTxStatus.mockReset();
  mockTxStatus.mockResolvedValue({ status: "pending" });
  mockTxMark.mockReset();
  mockTxMark.mockImplementation(async () => {
    mockEvents.push("verified");
    return { count: 1 };
  });
  mockOnSubmitted.mockImplementation(async () => {
    mockEvents.push("seat");
    return { verified: true };
  });
  mockContactFindFirst.mockImplementation(
    async (args: { select: Record<string, unknown> }) =>
      args.select.version_ ? OLD : { firstName: "Ana", lastName: "Gómez" }
  );
  mockUserFindMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  mockNotify.mockImplementation(async () => {
    mockOrder.push("notify");
    return { count: 2, notificationIds: [] };
  });
  mockPublish.mockResolvedValue(1);
  mockVerificationFindUnique.mockResolvedValue({
    id: "v1",
    email: "ana@example.com",
    tenant_id_: "t1",
    tenant_: { id: "t1", name: "EMPRESA", logo_data: null, publicUrl: null },
    status: "pending",
    expiresAt: new Date(Date.now() + 3600000),
    sourceEntity: "Contact",
    sourceRecordId: "c1",
  });
});

const call = async (
  method: "get" | "post",
  path: string,
  req: Record<string, unknown>
) => {
  const layer = router.stack.find(
    (l: any) => l.route?.path === path && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(
      "emailVerification.routes no tiene la ruta " +
        method.toUpperCase() +
        " " +
        path +
        ": este test la llama."
    );
  }
  let status = 200;
  let body: any;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: unknown) {
      body = value;
      return res;
    },
  };
  await layer.route.stack[0].handle(
    { headers: {}, query: {}, body: {}, ...req },
    res,
    () => undefined
  );
  return { status, body };
};
const submit = (data: Record<string, unknown>) =>
  call("post", "/public/external-validation/submit", {
    body: { vid: "v1", sig: SIG, data },
  });
const published = () =>
  mockPublish.mock.calls.map((c: unknown[]) => JSON.parse(c[1] as string));
const logged = () =>
  JSON.stringify(Object.values(logs).map((spy) => spy.mock.calls));
// Dónde falló un error: sus líneas "at" (nunca su mensaje).
const AT = expect.arrayContaining([expect.stringMatching(/^at /)]);
// Un choque con otra transacción, como lo tira Postgres con Serializable.
const conflict = () =>
  Object.assign(
    new Error("Transaction failed due to a write conflict or a deadlock"),
    { code: "P2034" }
  );

describe("la confirmación: cambios, asiento y marca en una transacción", () => {
  it("en ese orden y adentro de la transacción; un opcional en blanco llega null", async () => {
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
      verified: true,
    });
    expect(mockEvents).toEqual(["update", "seat", "verified"]);
    expect(mockServiceUpdate).toHaveBeenCalledWith(
      { id: "c1", version_: "v0", taxId: null },
      true
    );
    // El servicio escribe con el cliente de la transacción: sin txPrisma abriría
    // la suya y sus cambios quedarían aunque el asiento tire.
    expect(mockServiceContexts).toHaveLength(1);
    expect(mockServiceContexts[0]).toMatchObject({
      txPrisma: mockTx,
      isSystemMode: true,
      currentUser: { id: "SYSTEM", tenant_id_: "t1" },
    });
    expect(mockOnSubmitted).toHaveBeenCalledWith({
      entityName: "Contact",
      recordId: "c1",
      tenantId: "t1",
      verificationId: "v1",
      applied: { firstName: "Ana", taxId: null },
      tx: mockTx,
    });
    // La marca, solo si la verificación sigue pendiente.
    expect(mockTxMark).toHaveBeenCalledTimes(1);
    expect(mockTxMark.mock.calls[0][0].where).toEqual({
      id: "v1",
      status: "pending",
    });
    expect(mockTxMark.mock.calls[0][0].data).toMatchObject({
      status: "verified",
    });
    // Lo que el servicio difirió sale una vez, después del commit.
    expect(mockOrder).toEqual(["commit", "deferred", "notify"]);
  });

  it("la transacción es Serializable (dos envíos a la vez chocan en vez de pisarse), con plazos para esperar y para correr", async () => {
    await submit({ firstName: "Ana", taxId: "   " });
    expect(mockTxOptions).toEqual([
      {
        isolationLevel: "Serializable",
        maxWait: expect.any(Number),
        timeout: expect.any(Number),
      },
    ]);
  });

  it("un obligatorio en blanco llega vacío, para que el servicio de la entidad lo rechace", async () => {
    await submit({ firstName: "   " });
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      firstName: "",
    });
  });

  it("sin cambios, el asiento corre igual y se marca verificado", async () => {
    const { body } = await submit({ firstName: "Ana", taxId: "20-12345678-6" });
    expect(body).toMatchObject({ success: true, changes: 0, verified: true });
    expect(mockEvents).toEqual(["seat", "verified"]);
    expect(mockServiceUpdate).not.toHaveBeenCalled();
  });

  it("si el asiento tira, no se marca verificado, no sale el evento y no se avisa", async () => {
    mockOnSubmitted.mockImplementation(async () => {
      throw new Error("redis caído");
    });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.error]).toEqual([500, "internal_error"]);
    // Un error que no es un choque no se reintenta.
    expect(mockAttempts).toBe(1);
    expect(mockServiceUpdate).toHaveBeenCalledTimes(1);
    expect(mockOnSubmitted).toHaveBeenCalledTimes(1);
    expect(mockTxMark).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockDeferred).not.toHaveBeenCalled();
  });

  it("si el servicio de la entidad rechaza, 422 con el código, sin asiento ni aviso", async () => {
    mockServiceUpdate.mockImplementation(() => {
      throw Object.assign(new Error("VALIDATION_REQUIRED"), {
        extensions: { code: "VALIDATION_REQUIRED" },
      });
    });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      error: "validation_failed",
      code: "VALIDATION_REQUIRED",
    });
    expect(mockAttempts).toBe(1);
    expect(mockServiceUpdate).toHaveBeenCalledTimes(1);
    expect(mockOnSubmitted).not.toHaveBeenCalled();
    expect(mockEvents).toEqual([]);
    expect(mockNotify).not.toHaveBeenCalled();
    // Lo que el servicio difirió antes de rechazar se descarta con el intento.
    expect(mockDeferred).not.toHaveBeenCalled();
  });

  it("un obligatorio en blanco: 422 con el campo que falta, para que el formulario lo marque", async () => {
    // Como el UpdateService generado: un obligatorio vacío es un NullValueError
    // con "args.<campo>" en customMessage (sin meta).
    mockServiceUpdate.mockImplementation((args: Record<string, unknown>) => {
      if (args.firstName === "") throw new NullValueError("args.firstName");
    });
    const { status, body } = await submit({ firstName: "   " });
    expect(status).toBe(422);
    expect(body).toEqual({
      success: false,
      error: "validation_failed",
      code: "VALIDATION_REQUIRED",
      field: "firstName",
      message: "VALIDATION_REQUIRED",
      meta: null,
    });
    expect(mockOnSubmitted).not.toHaveBeenCalled();
    expect(mockTxMark).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it.each([["firstName es obligatorio"], [undefined]])(
    "un obligatorio que falta con otro customMessage (%j), sin la forma args.<campo>: 422 sin campo",
    async (customMessage) => {
      mockServiceUpdate.mockImplementation(() => {
        throw new NullValueError(customMessage);
      });
      const { status, body } = await submit({ firstName: "   " });
      expect([status, body.code]).toEqual([422, "VALIDATION_REQUIRED"]);
      expect(Object.keys(body)).not.toContain("field");
    }
  );

  it("un error de validación con meta.field: 422 con ese campo", async () => {
    mockServiceUpdate.mockImplementation(() => {
      throw new ValidationError("UNIQUE", {
        code: "VALIDATION_UNIQUE",
        field: "taxId",
      });
    });
    const { status, body } = await submit({
      firstName: "Ana",
      taxId: "20-99999999-9",
    });
    expect(status).toBe(422);
    expect(body).toMatchObject({
      code: "VALIDATION_UNIQUE",
      field: "taxId",
      meta: { field: "taxId" },
    });
  });
});

describe("los errores de validación y los Enum", () => {
  it("un P2002 (un valor único repetido): 422 con el código y meta.target intacto, sin field", async () => {
    // Como lo deja PrismaError cuando resuelve la restricción: el cliente ubica
    // el campo por meta.target.
    const quiet = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockServiceUpdate.mockImplementation(() => {
      throw new PrismaError({ code: "P2002" }, undefined, {
        meta: { target: ["email"], modelName: "Contact" },
      });
    });
    const { status, body } = await submit({
      firstName: "Ana",
      taxId: "20-99999999-9",
    });
    quiet.mockRestore();
    expect(status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      error: "validation_failed",
      code: "P2002",
      meta: { target: ["email"], modelName: "Contact" },
    });
    expect(Object.keys(body)).not.toContain("field");
  });

  it("un Enum obligatorio en blanco llega null: el servicio lo rechaza y el 422 dice el campo", async () => {
    // Como el UpdateService generado: un Enum obligatorio en null es un NullValueError.
    mockServiceUpdate.mockImplementation((args: Record<string, unknown>) => {
      if (args.gender === null) throw new NullValueError("args.gender");
    });
    const { status, body } = await submit({ gender: "  " });
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      gender: null,
    });
    expect(status).toBe(422);
    expect(body).toMatchObject({
      code: "VALIDATION_REQUIRED",
      field: "gender",
    });
    expect(mockOnSubmitted).not.toHaveBeenCalled();
  });

  it("un Enum opcional en blanco queda nulo", async () => {
    const { body } = await submit({ taxIdType: "" });
    expect(body.success).toBe(true);
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      taxIdType: null,
    });
    expect(mockOnSubmitted.mock.calls[0][0].applied).toEqual({
      taxIdType: null,
    });
  });

  it("un Enum fuera de sus opciones: 422 con el campo antes del servicio, sin el valor en la respuesta ni en el log", async () => {
    const { status, body } = await submit({
      firstName: "Ana",
      gender: "Gómez <script>",
    });
    expect(status).toBe(422);
    expect(body).toEqual({
      success: false,
      error: "validation_failed",
      code: "VALIDATION_INVALID_OPTION",
      field: "gender",
      message: "VALIDATION_INVALID_OPTION",
      meta: null,
    });
    expect(JSON.stringify(body)).not.toContain("Gómez");
    expect(logged()).not.toContain("Gómez");
    expect(mockServiceUpdate).not.toHaveBeenCalled();
    expect(mockOnSubmitted).not.toHaveBeenCalled();
    expect(mockTxMark).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("un obligatorio que no es texto, en blanco (número, booleano, referencia, día)", () => {
  // Como el UpdateService generado: un obligatorio en null es un NullValueError con
  // "args.<campo>" (en una referencia, el campo sin el Id del argumento).
  const rejectsNull = () =>
    mockServiceUpdate.mockImplementation((args: Record<string, unknown>) => {
      for (const name of ["age", "ratio", "active", "born"]) {
        if (args[name] === null) throw new NullValueError("args." + name);
      }
      if (args.countryId === null) throw new NullValueError("args.country");
    });

  it.each([
    ["un Int obligatorio", "age", { age: null }],
    ["un Decimal obligatorio", "ratio", { ratio: null }],
    ["un Boolean obligatorio", "active", { active: null }],
    ["una referencia obligatoria", "country", { countryId: null }],
    ["un date obligatorio", "born", { born: null }],
  ])(
    "%s en blanco llega null (no 0, false ni vacío): el servicio lo rechaza y el 422 dice el campo",
    async (_what, field, sent) => {
      rejectsNull();
      for (const blank of ["", null]) {
        mockServiceUpdate.mockClear();
        const { status, body } = await submit({ [field]: blank });
        expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
          id: "c1",
          version_: "v0",
          ...sent,
        });
        expect(status).toBe(422);
        expect(body).toEqual({
          success: false,
          error: "validation_failed",
          code: "VALIDATION_REQUIRED",
          field,
          message: "VALIDATION_REQUIRED",
          meta: null,
        });
      }
      expect(mockOnSubmitted).not.toHaveBeenCalled();
      expect(mockTxMark).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    }
  );

  it("con valor, como siempre: un número, un booleano y una referencia que existe", async () => {
    const { body } = await submit({
      age: "41",
      ratio: "2.5",
      active: false,
      country: "00000000-0000-4000-8000-000000000003",
    });
    expect(body.success).toBe(true);
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      age: 41,
      ratio: 2.5,
      active: false,
      countryId: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("si es opcional, como antes: un Int y una referencia en blanco quedan nulos; un Boolean en blanco, false", async () => {
    const { body } = await submit({ floors: "", subscribed: "", province: "" });
    expect(body.success).toBe(true);
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      floors: null,
      subscribed: false,
      provinceId: null,
    });
    expect(mockOnSubmitted.mock.calls[0][0].applied).toEqual({
      floors: null,
      subscribed: false,
      province: null,
    });
  });
});

describe("una referencia se valida por existencia, no por formato", () => {
  // Al log van los campos rechazados (nunca lo que mandó el contacto).
  const rejected = (fields: string[]) =>
    expect(logs.warn).toHaveBeenCalledWith(
      { vid: "v1", rejectedFields: fields, unknownFields: 0 },
      "External validation rejected fields"
    );
  // La confirmación siguió con el resto: el servicio recibió solo el nombre.
  const onlyTheName = () => {
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      firstName: "Ana María",
    });
    expect(mockTxMark).toHaveBeenCalledTimes(1);
  };

  it("un id que no es un UUID y existe (un país sembrado con el nombre de id): se consulta y se guarda", async () => {
    const { body } = await submit({ country: "Argentina" });
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
    });
    expect(mockCountryFindUnique).toHaveBeenCalledWith({
      where: { id: "Argentina" },
      select: { id: true },
    });
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      countryId: "Argentina",
    });
    expect(mockOnSubmitted.mock.calls[0][0].applied).toEqual({
      country: "Argentina",
    });
    expect(logs.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "External validation rejected fields"
    );
  });

  it("un id que no existe: se consulta, se rechaza, no llega al servicio y la confirmación sigue con el resto", async () => {
    mockCountryFindUnique.mockResolvedValue(null);
    const { body } = await submit({
      country: "Atlántida",
      firstName: "Ana María",
    });
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
    });
    expect(mockCountryFindUnique).toHaveBeenCalledWith({
      where: { id: "Atlántida" },
      select: { id: true },
    });
    onlyTheName();
    rejected(["country"]);
  });

  it("un id de 255 caracteres se consulta como cualquier otro", async () => {
    const id = "x".repeat(255);
    const { body } = await submit({ country: id });
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
    });
    expect(mockCountryFindUnique).toHaveBeenCalledWith({
      where: { id },
      select: { id: true },
    });
    expect(mockServiceUpdate.mock.calls[0][0]).toEqual({
      id: "c1",
      version_: "v0",
      countryId: id,
    });
  });

  it.each([
    ["un número", 42],
    ["un booleano", true],
    ["un objeto", { id: "Argentina" }],
    ["una lista", ["Argentina"]],
    ["un texto de 256 caracteres", "x".repeat(256)],
  ])(
    "%s: se rechaza sin consultar, y la confirmación sigue con el resto",
    async (_what, value) => {
      const { body } = await submit({ country: value, firstName: "Ana María" });
      expect(body).toMatchObject({
        success: true,
        message: "verified",
        changes: 1,
      });
      expect(mockCountryFindUnique).not.toHaveBeenCalled();
      onlyTheName();
      rejected(["country"]);
    }
  );

  it("si la consulta tira (una columna uuid en la base y un valor que no lo es): se rechaza el campo, la confirmación sigue y el log no lleva el error", async () => {
    mockCountryFindUnique.mockRejectedValue(
      new Error('invalid input syntax for type uuid: "Argentina"')
    );
    const { status, body } = await submit({
      country: "Argentina",
      firstName: "Ana María",
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
    });
    expect(mockCountryFindUnique).toHaveBeenCalledTimes(1);
    onlyTheName();
    rejected(["country"]);
    // Distinto de un id que no existe: el log dice qué campo no se pudo comprobar y
    // el tipo del error, sin el valor ni el mensaje.
    expect(logs.warn).toHaveBeenCalledWith(
      { vid: "v1", field: "country", errorType: "Error", errorAt: AT },
      "External validation: a submitted field could not be checked"
    );
    expect(logged()).not.toContain("Argentina");
  });

  it("sin el modelo de la fila referenciada en el registry (refPrismaModel): se rechaza, aunque parezca un UUID (falla cerrado)", async () => {
    const { body } = await submit({
      province: "00000000-0000-4000-8000-000000000009",
      firstName: "Ana María",
    });
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
    });
    onlyTheName();
    rejected(["province"]);
  });
});

describe("un Enum sin opciones declaradas", () => {
  it("falla cerrado: cualquier valor es un 422 VALIDATION_INVALID_OPTION con el campo, sin el valor en la respuesta ni en el log", async () => {
    const { status, body } = await submit({ kind: "Pérez <script>" });
    expect(status).toBe(422);
    expect(body).toMatchObject({
      code: "VALIDATION_INVALID_OPTION",
      field: "kind",
    });
    expect(JSON.stringify(body)).not.toContain("Pérez");
    expect(logged()).not.toContain("Pérez");
    expect(mockServiceUpdate).not.toHaveBeenCalled();
    expect(mockOnSubmitted).not.toHaveBeenCalled();
  });
});

describe("un choque con otra transacción se reintenta una vez; un doble envío confirma una sola vez", () => {
  const submittedEvents = () =>
    published().filter((e: any) => e.type === "externalValidation.submitted");
  const confirmedOnce = () => {
    expect(mockEvents).toEqual(["update", "seat", "verified"]);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(submittedEvents()).toHaveLength(1);
    // Un alcance por intento: lo que difirió el intento que chocó se descartó, y
    // lo del que confirmó sale una vez, después del commit.
    expect(mockDeferred).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual(["commit", "deferred", "notify"]);
  };

  it("un P2034 crudo en el primer intento (en el asiento): el segundo confirma, con un asiento, una marca y un aviso", async () => {
    mockOnSubmitted.mockImplementationOnce(async () => {
      mockEvents.push("seat");
      throw conflict();
    });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
      verified: true,
    });
    expect(mockAttempts).toBe(2);
    expect(mockOnSubmitted).toHaveBeenCalledTimes(2);
    // El reintento abre otra transacción con las mismas opciones.
    expect(mockTxOptions).toEqual([mockTxOptions[0], mockTxOptions[0]]);
    expect(mockTxOptions[0]).toMatchObject({ isolationLevel: "Serializable" });
    confirmedOnce();
  });

  it("un P2034 al confirmar (COMMIT): igual", async () => {
    mockCommitFailures.push(conflict());
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.message]).toEqual([200, "verified"]);
    expect(mockAttempts).toBe(2);
    confirmedOnce();
  });

  it("el PrismaError P2034 que arma el UpdateService: igual, y nunca un 422", async () => {
    const quiet = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockServiceUpdate.mockImplementationOnce(() => {
      throw new PrismaError({ code: "P2034" });
    });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    quiet.mockRestore();
    expect([status, body.message]).toEqual([200, "verified"]);
    expect(mockServiceUpdate).toHaveBeenCalledTimes(2);
    confirmedOnce();
  });

  it.each([
    [
      "crudos, al confirmar",
      () => mockCommitFailures.push(conflict(), conflict()),
    ],
    [
      "envueltos por el UpdateService",
      () =>
        mockServiceUpdate.mockImplementation(() => {
          throw new PrismaError({ code: "P2034" });
        }),
    ],
  ])(
    "dos choques (%s): 500, sin nada aplicado ni avisado, y el log con el tipo y el código",
    async (_label, arrange) => {
      const quiet = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      arrange();
      const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
      quiet.mockRestore();
      expect([status, body.error]).toEqual([500, "internal_error"]);
      expect(mockAttempts).toBe(2);
      expect(mockEvents).toEqual([]);
      expect(mockDeferred).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
      expect(logs.error).toHaveBeenCalledWith(
        expect.objectContaining({ entity: "Contact", errorCode: "P2034" }),
        "External validation submit failed; nothing applied"
      );
    }
  );

  it("doble envío: el reintento encuentra la verificación confirmada por el otro envío: already_verified, sin cambios, sin asiento y sin aviso", async () => {
    mockCommitFailures.push(conflict());
    mockTxStatus
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "verified" });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: "already_verified",
      tenantInfo: expect.any(Object),
    });
    expect(mockAttempts).toBe(2);
    // El servicio y el asiento corrieron solo en el intento que no confirmó.
    expect(mockServiceUpdate).toHaveBeenCalledTimes(1);
    expect(mockOnSubmitted).toHaveBeenCalledTimes(1);
    expect(mockEvents).toEqual([]);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("si ya no está pendiente al empezar la transacción: already_verified sin correr el servicio, el asiento ni la marca", async () => {
    mockTxStatus.mockResolvedValue({ status: "verified" });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.message]).toEqual([200, "already_verified"]);
    expect(mockServiceUpdate).not.toHaveBeenCalled();
    expect(mockOnSubmitted).not.toHaveBeenCalled();
    expect(mockTxMark).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("revocada mientras tanto: 410 revoked, sin nada", async () => {
    mockTxStatus.mockResolvedValue({ status: "revoked" });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body]).toEqual([410, { success: false, error: "revoked" }]);
    expect(mockOnSubmitted).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("si la marca no encuentra la verificación pendiente, se revierte todo: already_verified, sin aviso", async () => {
    mockTxMark.mockResolvedValueOnce({ count: 0 });
    mockTxStatus
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "verified" });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.message]).toEqual([200, "already_verified"]);
    expect(mockEvents).toEqual([]);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("cada intento recibe su propio applied: lo que el asiento le cambió en el que chocó no pasa al reintento", async () => {
    mockOnSubmitted.mockImplementationOnce(
      async (event: { applied: Record<string, unknown> }) => {
        event.applied.taxId = "cambiado";
        throw conflict();
      }
    );
    await submit({ firstName: "Ana", taxId: "   " });
    expect(mockOnSubmitted).toHaveBeenCalledTimes(2);
    expect(mockOnSubmitted.mock.calls[1][0].applied).toEqual({
      firstName: "Ana",
      taxId: null,
    });
  });
});

describe("lo que el asiento deja para después del commit (afterCommit)", () => {
  const seatWith = (afterCommit: () => Promise<void> | void) => async () => {
    mockEvents.push("seat");
    return { verified: true, afterCommit };
  };

  it("corre una vez, después del commit y antes del aviso", async () => {
    const afterCommit = jest.fn(async () => {
      mockOrder.push("afterCommit");
    });
    mockOnSubmitted.mockImplementation(seatWith(afterCommit));
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      verified: true,
    });
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual(["commit", "deferred", "afterCommit", "notify"]);
  });

  it("un choque y después la confirmación: corre solo el del intento que confirmó, una vez", async () => {
    const first = jest.fn();
    const second = jest.fn();
    mockOnSubmitted
      .mockImplementationOnce(seatWith(first))
      .mockImplementationOnce(seatWith(second));
    mockCommitFailures.push(conflict());
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body.message).toBe("verified");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("el primer intento devuelve afterCommit y falla al COMMIT; el segundo confirma con {}: no corre ninguno", async () => {
    const first = jest.fn();
    mockOnSubmitted
      .mockImplementationOnce(seatWith(first))
      .mockImplementationOnce(async () => {
        mockEvents.push("seat");
        return {};
      });
    mockCommitFailures.push(conflict());
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      verified: false,
    });
    expect(mockAttempts).toBe(2);
    // Lo que devolvió el intento descartado no se guarda para el siguiente.
    expect(first).not.toHaveBeenCalled();
  });

  it("dos choques: no corre ninguno", async () => {
    const first = jest.fn();
    const second = jest.fn();
    mockOnSubmitted
      .mockImplementationOnce(seatWith(first))
      .mockImplementationOnce(seatWith(second));
    mockCommitFailures.push(conflict(), conflict());
    const { status } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(500);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("si el asiento tira en el reintento, no corre el del intento que chocó", async () => {
    const first = jest.fn();
    mockOnSubmitted
      .mockImplementationOnce(seatWith(first))
      .mockImplementationOnce(async () => {
        throw new Error("redis caído");
      });
    mockCommitFailures.push(conflict());
    const { status } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(500);
    expect(first).not.toHaveBeenCalled();
  });

  it.each([
    [
      "la marca no encuentra la verificación pendiente",
      () => {
        mockTxMark.mockResolvedValueOnce({ count: 0 });
        mockTxStatus
          .mockResolvedValueOnce({ status: "pending" })
          .mockResolvedValueOnce({ status: "verified" });
      },
    ],
    [
      "el commit falla por otra cosa",
      () => mockCommitFailures.push(new Error("se cortó la conexión")),
    ],
  ])(
    "si algo después del asiento revierte la confirmación (%s), no corre",
    async (_label, arrange) => {
      const afterCommit = jest.fn();
      mockOnSubmitted.mockImplementation(seatWith(afterCommit));
      arrange();
      const { body } = await submit({ firstName: "Ana", taxId: "   " });
      expect(body.message).not.toBe("verified");
      expect(afterCommit).not.toHaveBeenCalled();
    }
  );

  it("si tira: la misma respuesta, el aviso sale igual y el log no lleva su mensaje", async () => {
    mockOnSubmitted.mockImplementation(
      seatWith(async () => {
        throw new Error(
          "no se pudo borrar la lectura de Ana Gómez, 20-99999999-9"
        );
      })
    );
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
      verified: true,
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(logs.error).toHaveBeenCalledWith(
      { entity: "Contact", errorType: "Error", errorAt: AT },
      "External validation submitted: the afterCommit of the project failed"
    );
    expect(logged()).not.toContain("Ana Gómez");
    expect(logged()).not.toContain("20-99999999-9");
  });
});

describe("después del commit", () => {
  it("el evento en vivo lleva el id del registro y si hubo datos verificados", async () => {
    await submit({ firstName: "Ana", taxId: "   " });
    const event = published().find(
      (e: any) => e.type === "externalValidation.submitted"
    );
    expect(event).toMatchObject({
      tenantId: "t1",
      payload: {
        entityName: "Contact",
        recordId: "c1",
        changedFields: ["taxId"],
        verified: true,
      },
    });
  });

  it("también sin cambios (el asiento pudo cambiar el registro)", async () => {
    await submit({ firstName: "Ana", taxId: "20-12345678-6" });
    expect(
      published().some((e: any) => e.type === "externalValidation.submitted")
    ).toBe(true);
  });

  it("un aviso guardado por administrador de sitio activo de la empresa, con el enlace al formulario del registro y la clave de texto", async () => {
    await submit({ firstName: "Ana", taxId: "   " });
    expect(mockUserFindMany).toHaveBeenCalledWith({
      where: {
        tenant_id_: "t1",
        active: true,
        roles: { some: { id: "SiteAdmin" } },
      },
      select: { id: true },
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    const [targets, input] = mockNotify.mock.calls[0];
    expect(targets).toEqual([
      { userId: "a1", tenantId: "t1" },
      { userId: "a2", tenantId: "t1" },
    ]);
    expect(input).toEqual({
      type: "system",
      priority: "medium",
      title: "Validación de datos recibida",
      body: "Ana Gómez cargó y validó sus datos.",
      objectType: "Contact",
      objectId: "c1",
      actionUrl: "/contact/view/c1",
      metadata: {
        i18nKey: "externalValidationSubmitted",
        params: { contactName: "Ana Gómez", verified: true },
        variant: "verified",
      },
    });
  });

  it("un administrador de sitio de otra empresa no recibe nada: la empresa sale de la verificación guardada, no del pedido", async () => {
    // Los usuarios de dos empresas; la consulta se evalúa de verdad sobre ellos,
    // y una clave que este test no conoce la hace fallar.
    const users = [
      { id: "a1", tenant_id_: "t1", active: true, roles: ["SiteAdmin"] },
      {
        id: "a2",
        tenant_id_: "t1",
        active: true,
        roles: ["User", "SiteAdmin"],
      },
      { id: "inactivo", tenant_id_: "t1", active: false, roles: ["SiteAdmin"] },
      { id: "usuario", tenant_id_: "t1", active: true, roles: ["User"] },
      { id: "otra", tenant_id_: "t2", active: true, roles: ["SiteAdmin"] },
    ];
    mockUserFindMany.mockImplementation(
      async (args: { where: Record<string, any> }) => {
        const { tenant_id_, active, roles, ...rest } = args.where;
        if (
          Object.keys(rest).length > 0 ||
          typeof roles?.some?.id !== "string"
        ) {
          throw new Error("una consulta de usuarios que este test no evalúa");
        }
        return users
          .filter(
            (u) =>
              u.tenant_id_ === tenant_id_ &&
              u.active === active &&
              u.roles.includes(roles.some.id)
          )
          .map((u) => ({ id: u.id }));
      }
    );
    const { body } = await call("post", "/public/external-validation/submit", {
      body: {
        vid: "v1",
        sig: SIG,
        tenantId: "t2",
        tenant_id_: "t2",
        data: { firstName: "Ana", taxId: "   ", tenant_id_: "t2" },
      },
    });
    expect(body.success).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toEqual([
      { userId: "a1", tenantId: "t1" },
      { userId: "a2", tenantId: "t1" },
    ]);
    // El nombre del aviso también se lee en la empresa de la verificación, con
    // displayNameSelect como select, sin otras claves.
    expect(mockContactFindFirst).toHaveBeenCalledWith({
      where: { id: "c1", tenant_id_: "t1" },
      select: { firstName: true, lastName: true },
    });
    for (const [args] of mockContactFindFirst.mock.calls) {
      expect(args.where).toEqual({ id: "c1", tenant_id_: "t1" });
    }
  });

  it("sin datos verificados: el texto de respaldo dice que cargó sus datos y no hay variante", async () => {
    mockOnSubmitted.mockImplementation(async () => {
      mockEvents.push("seat");
      return {};
    });
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body.verified).toBe(false);
    const input = mockNotify.mock.calls[0][1];
    expect(input.body).toBe("Ana Gómez cargó sus datos.");
    expect(input.metadata).toEqual({
      i18nKey: "externalValidationSubmitted",
      params: { contactName: "Ana Gómez", verified: false },
    });
  });

  it("sin nombre visible, el aviso nombra al contacto por su e-mail", async () => {
    mockContactFindFirst.mockImplementation(
      async (args: { select: Record<string, unknown> }) =>
        args.select.version_ ? OLD : null
    );
    await submit({ firstName: "Ana", taxId: "   " });
    expect(mockNotify.mock.calls[0][1].metadata.params.contactName).toBe(
      "ana@example.com"
    );
  });

  it("si avisar falla, la confirmación queda", async () => {
    mockNotify.mockRejectedValue(new Error("sin base"));
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body).toMatchObject({ success: true, message: "verified" });
  });

  it("sin administradores activos no se avisa y la confirmación queda", async () => {
    mockUserFindMany.mockResolvedValue([]);
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body.success).toBe(true);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("con un Redis que no contesta, los eventos en vivo no cuelgan la respuesta", () => {
  // La respuesta, o un error si no llega en 3 s: sin plazo, la confirmación quedaría
  // esperando a Redis. (Con un withDeadline roto, la prueba cae por el plazo de jest.)
  const answered = <T>(promise: Promise<T>) =>
    withDeadline(promise, 3000, "la confirmación, esperando a Redis");
  const types = () => published().map((e: any) => e.type);
  const PENDING =
    "SSE for external validation still pending after the deadline; it goes out when Redis answers";

  it("un publish que no resuelve nunca: la confirmación responde igual, dentro del plazo, con el aviso, y el log lo dice", async () => {
    mockPublish.mockImplementation(() => new Promise(() => undefined));
    const { status, body } = await answered(
      submit({ firstName: "Ana", taxId: "   " })
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      message: "verified",
      changes: 1,
      verified: true,
    });
    expect(mockTxMark).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(types()).toEqual(["emailVerification.verified"]);
    // Venció el plazo: no es una falla, los eventos salen cuando Redis conteste.
    expect(logs.warn).toHaveBeenCalledWith(
      { verificationId: "v1", timeoutMs: expect.any(Number) },
      PENDING
    );
    expect(logs.warn).not.toHaveBeenCalledWith(
      expect.anything(),
      "Failed to publish SSE for external validation"
    );
  });

  it("un publish que falla enseguida: la confirmación responde igual, y el log lleva el tipo del error, sin su mensaje", async () => {
    mockPublish.mockRejectedValueOnce(
      new Error("Redis rechazó el evento de ana@example.com")
    );
    const { status, body } = await answered(
      submit({ firstName: "Ana", taxId: "   " })
    );
    expect([status, body.message]).toEqual([200, "verified"]);
    expect(logs.warn).toHaveBeenCalledWith(
      { verificationId: "v1", errorType: "Error", errorAt: AT },
      "Failed to publish SSE for external validation"
    );
    expect(logs.warn).not.toHaveBeenCalledWith(expect.anything(), PENDING);
    expect(logged()).not.toContain("ana@example.com");
  });

  it("un Redis lento: la respuesta no lo espera, y los dos eventos salen igual, en orden, cuando contesta", async () => {
    let answer: () => void = () => undefined;
    mockPublish.mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve(1)))
    );
    const { body } = await answered(submit({ firstName: "Ana", taxId: "   " }));
    expect(body).toMatchObject({ success: true, message: "verified" });
    expect(types()).toEqual(["emailVerification.verified"]);
    answer();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(types()).toEqual([
      "emailVerification.verified",
      "externalValidation.submitted",
    ]);
  });

  it("si Redis falla después del plazo: queda en el log, sin su mensaje, y no queda un rechazo sin atrapar", async () => {
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let fail: () => void = () => undefined;
      mockPublish.mockImplementationOnce(
        () =>
          new Promise(
            (_, reject) =>
              (fail = () =>
                reject(
                  new Error("Redis se cayó con el evento de ana@example.com")
                ))
          )
      );
      const { body } = await answered(
        submit({ firstName: "Ana", taxId: "   " })
      );
      expect(body).toMatchObject({ success: true, message: "verified" });
      fail();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).not.toHaveBeenCalled();
      expect(types()).toEqual(["emailVerification.verified"]);
      expect(logs.warn).toHaveBeenCalledWith(
        { verificationId: "v1", errorType: "Error", errorAt: AT },
        "Failed to publish SSE for external validation after the deadline"
      );
      expect(logged()).not.toContain("ana@example.com");
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("lo que pasa después del commit no cambia la respuesta", () => {
  // El asiento del nombre de la empresa lee la base: si falla después del commit, la
  // confirmación ya quedó guardada y avisada. Su mensaje puede traer un nombre.
  const seatFails = () =>
    mockSenderDisplayName.mockRejectedValue(
      new Error("no se pudo leer el seudónimo de Ana Gómez, 20-99999999-9")
    );

  it("si el asiento senderDisplayName tira al armar la respuesta: 200 verified, el aviso salió, el nombre de la empresa de respaldo y el log sin contenido", async () => {
    seatFails();
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.success]).toEqual([200, true]);
    expect(body).toEqual({
      success: true,
      message: "verified",
      changes: 1,
      verified: true,
      tenantInfo: {
        tenantName: "EMPRESA",
        tenantLogo: null,
        tenantPublicUrl: null,
      },
    });
    expect(mockEvents).toEqual(["update", "seat", "verified"]);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(logs.error).toHaveBeenCalledWith(
      { entity: "Contact", errorType: "Error", errorAt: AT },
      "Public verification: senderDisplayName failed after the commit; showing the tenant name"
    );
    expect(logged()).not.toContain("Ana Gómez");
    expect(logged()).not.toContain("20-99999999-9");
  });

  it("lo mismo al ver already_verified en el reintento (otro envío la confirmó mientras tanto)", async () => {
    seatFails();
    mockCommitFailures.push(conflict());
    mockTxStatus
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "verified" });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.success]).toEqual([200, true]);
    expect(body).toEqual({
      success: true,
      message: "already_verified",
      tenantInfo: {
        tenantName: "EMPRESA",
        tenantLogo: null,
        tenantPublicUrl: null,
      },
    });
    expect(logs.error).toHaveBeenCalledWith(
      { entity: "Contact", errorType: "Error", errorAt: AT },
      "Public verification: senderDisplayName failed after the commit; showing the tenant name"
    );
    expect(logged()).not.toContain("Ana Gómez");
  });

  it("lo mismo si la verificación ya estaba confirmada al llegar el envío (already_verified desde la entrada)", async () => {
    seatFails();
    mockVerificationFindUnique.mockResolvedValue({
      id: "v1",
      email: "ana@example.com",
      tenant_id_: "t1",
      tenant_: { id: "t1", name: "EMPRESA", logo_data: null, publicUrl: null },
      status: "verified",
      expiresAt: new Date(Date.now() + 3600000),
      sourceEntity: "Contact",
      sourceRecordId: "c1",
    });
    const { status, body } = await submit({ firstName: "Ana", taxId: "   " });
    expect([status, body.success]).toEqual([200, true]);
    expect(body).toEqual({
      success: true,
      message: "already_verified",
      tenantInfo: {
        tenantName: "EMPRESA",
        tenantLogo: null,
        tenantPublicUrl: null,
      },
    });
    // No se volvió a confirmar nada.
    expect(mockAttempts).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(logs.error).toHaveBeenCalledWith(
      { entity: "Contact", errorType: "Error", errorAt: AT },
      "Public verification: senderDisplayName failed after the commit; showing the tenant name"
    );
    expect(logged()).not.toContain("Ana Gómez");
  });

  it("con el asiento andando, el nombre que da", async () => {
    mockSenderDisplayName.mockResolvedValue("  Editorial Alfa  ");
    const { body } = await submit({ firstName: "Ana", taxId: "   " });
    expect(body.tenantInfo).toEqual({
      tenantName: "Editorial Alfa",
      tenantLogo: null,
      tenantPublicUrl: null,
    });
  });
});

describe("el log no lleva lo que mandó el contacto ni su nombre", () => {
  it("de un error queda dónde falló (sus líneas at), sin su mensaje, aunque traiga un mail o una línea que parezca de la pila", async () => {
    mockOnSubmitted.mockImplementation(async () => {
      throw new Error(
        "no se pudo avisar a ana@example.com\n    at ana@example.com (inventada)"
      );
    });
    const { status } = await submit({
      firstName: "Ana",
      taxId: "20-99999999-9",
    });
    expect(status).toBe(500);
    const call = logs.error.mock.calls.find(
      (c: unknown[]) =>
        c[1] === "External validation submit failed; nothing applied"
    );
    const at: string[] = call[0].errorAt;
    expect(at.length).toBeGreaterThan(0);
    expect(at.length).toBeLessThanOrEqual(10);
    for (const line of at) expect(line).toMatch(/^at /);
    expect(logged()).not.toContain("ana@example.com");
  });

  it("en una confirmación (con un campo que la entidad no tiene)", async () => {
    const { body } = await submit({
      firstName: "Ana",
      taxId: "20-99999999-9",
      "Gómez <script>": "x",
    });
    expect(body.success).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(logs.warn).toHaveBeenCalledWith(
      { vid: "v1", rejectedFields: [], unknownFields: 1 },
      "External validation rejected fields"
    );
    // La confirmación queda en el log con la verificación, la entidad y el registro, sin el mail del contacto.
    expect(logs.info).toHaveBeenCalledWith(
      {
        verificationId: "v1",
        entity: "Contact",
        recordId: "c1",
        changesCount: 1,
        verified: true,
      },
      "External validation submitted"
    );
    for (const text of [
      "Ana Gómez",
      "20-99999999-9",
      "Gómez <script>",
      "ana@example.com",
    ]) {
      expect(logged()).not.toContain(text);
    }
  });

  it("si la transacción falla: el tipo del error, sin su mensaje", async () => {
    mockOnSubmitted.mockImplementation(async () => {
      throw new Error("el CUIT 20-99999999-9 no es el de Ana Gómez");
    });
    const { status } = await submit({
      firstName: "Ana",
      taxId: "20-99999999-9",
    });
    expect(status).toBe(500);
    expect(mockAttempts).toBe(1);
    expect(mockServiceUpdate).toHaveBeenCalledTimes(1);
    expect(mockOnSubmitted).toHaveBeenCalledTimes(1);
    expect(logs.error).toHaveBeenCalledWith(
      { entity: "Contact", errorType: "Error", errorAt: AT },
      "External validation submit failed; nothing applied"
    );
    expect(logged()).not.toContain("20-99999999-9");
    expect(logged()).not.toContain("Ana Gómez");
  });

  it("si avisar falla: el tipo y el código del error, sin su mensaje (que puede traer el aviso)", async () => {
    mockNotify.mockRejectedValue(
      Object.assign(
        new Error(
          'Invalid create() invocation: { body: "Ana Gómez cargó y validó sus datos." }'
        ),
        {
          code: "P2009",
        }
      )
    );
    const { body } = await submit({ firstName: "Ana", taxId: "20-99999999-9" });
    expect(body).toMatchObject({ success: true, message: "verified" });
    expect(logs.error).toHaveBeenCalledWith(
      {
        tenantId: "t1",
        entity: "Contact",
        errorType: "Error",
        errorCode: "P2009",
        errorAt: AT,
      },
      "External validation submitted: could not notify SiteAdmins"
    );
    expect(logged()).not.toContain("Ana Gómez");
    expect(logged()).not.toContain("20-99999999-9");
  });

  it("si otra cosa falla antes de la transacción: 500, y el log sin el mensaje del error", async () => {
    mockContactFindFirst.mockRejectedValue(
      new Error("falló la consulta con taxId 20-99999999-9")
    );
    const { status, body } = await submit({
      firstName: "Ana",
      taxId: "20-99999999-9",
    });
    expect([status, body.error]).toEqual([500, "internal_error"]);
    expect(logs.error).toHaveBeenCalledWith(
      { errorType: "Error", errorAt: AT },
      "Error in public/external-validation/submit"
    );
    expect(logged()).not.toContain("20-99999999-9");
  });
});

describe("la información de la página pública", () => {
  it("dice de qué entidad es la solicitud", async () => {
    const { body } = await call("get", "/public/verify-email/info", {
      query: { vid: "v1", sig: SIG },
    });
    expect(body).toMatchObject({
      success: true,
      mode: "dataValidation",
      entityName: "Contact",
    });
  });

  const info = async () =>
    (
      await call("get", "/public/verify-email/info", {
        query: { vid: "v1", sig: SIG },
      })
    ).body;

  it("cada fila de un catálogo trae, además del id y el nombre, sus códigos (extraFields), y ninguna otra columna", async () => {
    // Por el nombre, «Argelia» va antes que «Argentina»: con el código, la pantalla elige la correcta.
    mockCountryFindMany.mockResolvedValue([
      { id: "c-dz", name: "Argelia", code: "DZ", currency: "DZD" },
      { id: "c-ar", name: "Argentina", code: "AR", currency: "ARS" },
    ]);
    const body = await info();
    expect(body.lookups.Country).toStrictEqual([
      { id: "c-dz", displayId: "Argelia", code: "DZ" },
      { id: "c-ar", displayId: "Argentina", code: "AR" },
    ]);
    expect(mockCountryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true, code: true } })
    );
  });

  it.each([[""], ["   "], [null], [undefined], [42]])(
    "un código %p no va en la fila: solo un texto no vacío",
    async (code) => {
      mockCountryFindMany.mockResolvedValue([
        { id: "c-xx", name: "Sin código", code },
      ]);
      expect((await info()).lookups.Country).toStrictEqual([
        { id: "c-xx", displayId: "Sin código" },
      ]);
    }
  );

  it("un catálogo sin códigos (sin extraFields): sus filas son las de siempre, con el padre", async () => {
    mockProvinceFindMany.mockResolvedValue([
      { id: "p-cba", name: "Córdoba", country_id: "c-ar", code: "X" },
    ]);
    expect((await info()).lookups.Province).toStrictEqual([
      { id: "p-cba", displayId: "Córdoba", parentId: "c-ar" },
    ]);
  });
});
