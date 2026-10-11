// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Un error en el log: lo que sirve para entenderlo, nunca el pedido ni la
 * respuesta (src/utils/logger.ts, serializeError).
 *
 * El serializador de pino para errores copia toda propiedad enumerable. Un
 * error de axios trae el pedido entero (config.headers, con Authorization y
 * X-API-Key; config.data, con el cuerpo) y la respuesta: con `err: error` en un
 * log, todo eso terminaba en la línea, y de ahí en Loki. El logger del proyecto
 * deja solo type, message, stack, code, un status numérico y la causa (con la
 * misma regla, hasta 3 niveles y sin colgarse con un ciclo), para `err` y para
 * `error`.
 *
 * Y sin perder lo que hace falta para diagnosticar: un error se reconoce por su
 * forma (también uno de otro realm), los hijos de un AggregateError van con la
 * misma regla (el ECONNREFUSED de Node 22 trae en ellos las direcciones que
 * fallaron), y de un error de GraphQL va su extensions.code.
 *
 * No usa base ni Redis: los errores se arman acá, y las líneas se escriben en
 * un arreglo con los serializers del logger del proyecto.
 */

import { AxiosError } from "axios";
import { GraphQLError } from "graphql";
import pino from "pino";
import * as vm from "vm";
import { logger, serializeError } from "../../src/utils/logger";

const SECRETS = [
  "sk_live_SECRETO123",
  "k_SECRETO456",
  "ana@example.com",
  "X-API-Key",
  "Authorization",
];

/** Un error de axios como el de un 401 de una API externa, con credenciales y datos personales. */
function axiosError(): AxiosError {
  const config: any = {
    url: "https://api.example.com/sign",
    method: "post",
    headers: {
      Authorization: "Bearer sk_live_SECRETO123",
      "X-API-Key": "k_SECRETO456",
    },
    data: JSON.stringify({ signerEmail: "ana@example.com" }),
  };
  const response: any = {
    status: 401,
    statusText: "Unauthorized",
    headers: { "x-echo-authorization": "Bearer sk_live_SECRETO123" },
    config,
    data: { error: "invalid token", signer: "ana@example.com" },
  };
  return new AxiosError(
    "Request failed with status code 401",
    "ERR_BAD_REQUEST",
    config,
    { path: "/sign" },
    response
  );
}

/** Un logger con los serializers del logger del proyecto, que escribe sus líneas en un arreglo. */
function capture() {
  const lines: string[] = [];
  const log = pino(
    { serializers: (logger as any)[pino.symbols.serializersSym] },
    { write: (line: string) => void lines.push(line) }
  );
  return { log, lines };
}

const expectNoSecrets = (line: string) => {
  for (const secret of SECRETS) expect(line).not.toContain(secret);
  expect(line).not.toMatch(/"(config|request|response|headers|data)"/);
};

describe("logger del proyecto: errores sin el pedido ni la respuesta", () => {
  it("usa serializeError para err y para error", () => {
    const serializers = (logger as any)[pino.symbols.serializersSym];
    expect(serializers.err).toBe(serializeError);
    expect(serializers.error).toBe(serializeError);
  });

  it.each([
    [
      "err",
      (log: pino.Logger, e: unknown) => log.error({ err: e }, "Job failed"),
    ],
    [
      "error",
      (log: pino.Logger, e: unknown) => log.error({ error: e }, "Job failed"),
    ],
    [
      "el error como primer argumento",
      (log: pino.Logger, e: unknown) => log.error(e, "Job failed"),
    ],
  ])(
    "un AxiosError bajo %s no deja encabezados, cuerpo ni datos personales en la línea",
    (_how, write) => {
      const { log, lines } = capture();
      write(log, axiosError());
      expect(lines).toHaveLength(1);
      expectNoSecrets(lines[0]);
      const err = Object.values(JSON.parse(lines[0])).find(
        (v: any) => v && v.type === "AxiosError"
      ) as any;
      expect(err).toMatchObject({
        type: "AxiosError",
        message: "Request failed with status code 401",
        code: "ERR_BAD_REQUEST",
        status: 401,
      });
      expect(err.stack).toContain("Request failed with status code 401");
    }
  );

  it("mensaje, stack, code, status y causa quedan; nada más", () => {
    const outer = Object.assign(
      new Error("Upstream signing failed", { cause: axiosError() }),
      { code: "SIGN_FAILED" }
    );
    const { log, lines } = capture();
    log.error({ err: outer }, "Job failed");
    expectNoSecrets(lines[0]);
    const { err } = JSON.parse(lines[0]);
    expect(Object.keys(err).sort()).toEqual([
      "cause",
      "code",
      "message",
      "stack",
      "type",
    ]);
    expect(err).toMatchObject({
      type: "Error",
      message: "Upstream signing failed",
      code: "SIGN_FAILED",
    });
    expect(Object.keys(err.cause).sort()).toEqual([
      "code",
      "message",
      "stack",
      "status",
      "type",
    ]);
    expect(err.cause).toMatchObject({
      type: "AxiosError",
      code: "ERR_BAD_REQUEST",
      status: 401,
    });
  });

  it("toma el status de statusCode cuando no hay respuesta", () => {
    expect(
      serializeError(Object.assign(new Error("Not found"), { statusCode: 404 }))
    ).toMatchObject({ status: 404 });
  });

  it("una causa circular no cuelga", () => {
    const a: any = new Error("a");
    const b: any = new Error("b", { cause: a });
    a.cause = b;
    const self: any = new Error("self");
    self.cause = self;
    expect(serializeError(a)).toEqual({
      type: "Error",
      message: "a",
      stack: a.stack,
      cause: {
        type: "Error",
        message: "b",
        stack: b.stack,
        cause: "[Circular]",
      },
    });
    expect((serializeError(self) as any).cause).toBe("[Circular]");
  });

  it("la cadena de causas se corta a los 3 niveles", () => {
    let error: any = new Error("nivel 6");
    for (let i = 5; i >= 0; i--)
      error = new Error(`nivel ${i}`, { cause: error });
    const out: any = serializeError(error);
    expect(out.message).toBe("nivel 0");
    expect(out.cause.cause.cause.message).toBe("nivel 3");
    expect(out.cause.cause.cause.cause).toBe("[cause depth limit]");
  });

  it("lo que no es un Error: un texto queda igual; lo demás, solo su tipo, sin pasarlo a texto", () => {
    expect(serializeError("connection reset")).toBe("connection reset");
    expect(serializeError(42)).toEqual({ type: "number" });
    expect(serializeError(null)).toEqual({ type: "null" });
    expect(serializeError(undefined)).toEqual({ type: "undefined" });
    const thrown = {
      message: "rejected",
      headers: { Authorization: "Bearer sk_live_SECRETO123" },
      email: "ana@example.com",
    };
    expect(serializeError(thrown)).toEqual({ type: "Object" });
    expect(serializeError(Object.create(null))).toEqual({ type: "object" });
    // Ni el contenido de un archivo ni una URL con usuario, clave y token.
    expect(serializeError(Buffer.from("CONTENIDO_DEL_ARCHIVO"))).toEqual({
      type: "Buffer",
    });
    expect(
      serializeError(
        new URL("https://user:PASSWORD_URL@api.example.com/x?token=QTOKEN")
      )
    ).toEqual({ type: "URL" });
  });

  it("nunca tira: ante cualquier falla da { type: 'Unserializable' }, y el llamado al logger sigue", () => {
    const getterThrows = Object.defineProperty(new Error("x"), "stack", {
      get() {
        throw new Error("no stack");
      },
    });
    const proxyThrows = new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
        getPrototypeOf() {
          throw new Error("trap");
        },
      }
    );
    const toPrimitiveThrows = {
      [Symbol.toPrimitive]() {
        throw new Error("no primitive");
      },
      toString() {
        throw new Error("no string");
      },
    };
    expect(serializeError(getterThrows)).toEqual({ type: "Unserializable" });
    expect(serializeError(proxyThrows)).toEqual({ type: "Unserializable" });
    expect(serializeError(toPrimitiveThrows)).toEqual({ type: "Object" });
    const { log, lines } = capture();
    for (const value of [
      getterThrows,
      proxyThrows,
      toPrimitiveThrows,
      Object.create(null),
    ]) {
      expect(() => log.error({ err: value }, "x")).not.toThrow();
      expect(() => log.error({ error: value }, "x")).not.toThrow();
    }
    expect(lines).toHaveLength(8);
    expect(lines.join("\n")).not.toContain("PASSWORD_URL");
  });

  it("un error de otro realm (vm) se reconoce por su forma: van su stack y su code", () => {
    const foreign = vm.runInNewContext(
      'const e = new Error("vm boom"); e.code = "E_VM"; e'
    );
    expect(foreign instanceof Error).toBe(false);
    const out: any = serializeError(foreign);
    expect(out).toMatchObject({
      type: "Error",
      message: "vm boom",
      code: "E_VM",
    });
    expect(out.stack).toContain("vm boom");
  });

  /** Como el AggregateError de Node 22 al conectarse a un nombre con IPv6 e IPv4 (autoSelectFamily). */
  const refused = (address: string) =>
    Object.assign(new Error(`connect ECONNREFUSED ${address}:4999`), {
      code: "ECONNREFUSED",
      address,
      port: 4999,
    });
  const aggregate = (errors: unknown[]) =>
    Object.assign(new AggregateError(errors, ""), { code: "ECONNREFUSED" });

  it("un AggregateError lleva sus hijos con la misma regla, y si no tiene mensaje, el de ellos", () => {
    const { log, lines } = capture();
    log.error(
      {
        err: new TypeError("fetch failed", {
          cause: aggregate([refused("::1"), refused("127.0.0.1")]),
        }),
      },
      "x"
    );
    const { err } = JSON.parse(lines[0]);
    expect(err.cause).toMatchObject({
      type: "AggregateError",
      code: "ECONNREFUSED",
      message:
        "connect ECONNREFUSED ::1:4999; connect ECONNREFUSED 127.0.0.1:4999",
    });
    expect(err.cause.errors.map((e: any) => Object.keys(e).sort())).toEqual([
      ["code", "message", "stack", "type"],
      ["code", "message", "stack", "type"],
    ]);
    expect(err.cause.errors.map((e: any) => e.message)).toEqual([
      "connect ECONNREFUSED ::1:4999",
      "connect ECONNREFUSED 127.0.0.1:4999",
    ]);
  });

  it("de un AggregateError van hasta 5 hijos, con la profundidad compartida y sin ciclos", () => {
    const many: any = serializeError(
      aggregate([1, 2, 3, 4, 5, 6, 7].map((n) => refused(`10.0.0.${n}`)))
    );
    expect(many.errors).toHaveLength(6);
    expect(many.errors[4].message).toBe("connect ECONNREFUSED 10.0.0.5:4999");
    expect(many.errors[5]).toBe("[2 more]");
    const deep: any = serializeError(
      new Error("n0", {
        cause: new Error("n1", {
          cause: new Error("n2", { cause: aggregate([refused("::1")]) }),
        }),
      })
    );
    expect(deep.cause.cause.cause.type).toBe("AggregateError");
    expect(deep.cause.cause.cause.errors).toBe("[errors depth limit]");
    const self: any = aggregate([]);
    self.errors.push(self);
    expect((serializeError(self) as any).errors).toEqual(["[Circular]"]);
  });

  it("de un error de GraphQL va solo extensions.code, y solo si es un texto", () => {
    const withMeta = new GraphQLError(
      "El único autor es también el único editor",
      {
        extensions: {
          code: "VALIDATION_ERROR",
          meta: { actualValue: "ana@example.com" },
        },
      }
    );
    const out: any = serializeError(withMeta);
    expect(out.extensions).toEqual({ code: "VALIDATION_ERROR" });
    expect(JSON.stringify(out)).not.toContain("ana@example.com");
    expect(JSON.stringify(out)).not.toContain("actualValue");
    expect(
      (
        serializeError(
          new GraphQLError("x", { extensions: { code: 42 } })
        ) as any
      ).extensions
    ).toBeUndefined();
  });
});
