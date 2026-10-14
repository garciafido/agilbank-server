import { authorizeCaller, bearerToken, fail, reply, INTERNAL_ERROR, type Authorize, type ClientSystem } from "../../src/api/http";

const CLIENT: ClientSystem = { id: "c1", name: "ProntoNet", tenantId: "T1", serviceUserId: "u1" };
const allow: Authorize = async () => ({ ok: true, client: CLIENT });

describe("bearerToken", () => {
  it("toma el token de un Bearer, sin importar mayúsculas en el esquema", () => {
    expect(bearerToken({ authorization: "Bearer abc" })).toBe("abc");
    expect(bearerToken({ authorization: "bearer abc" })).toBe("abc");
  });
  it("sin encabezado, con otro esquema o con un valor que no es texto: undefined", () => {
    expect(bearerToken({})).toBeUndefined();
    expect(bearerToken({ authorization: "Basic abc" })).toBeUndefined();
    expect(bearerToken({ authorization: ["Bearer abc"] })).toBeUndefined();
  });
});

describe("reply y fail", () => {
  it("arman la respuesta con la forma del contrato", () => {
    expect(reply(200, { a: 1 })).toEqual({ status: 200, body: { a: 1 } });
    expect(fail(400, "X", "mal", { campo: "c" })).toEqual({ status: 400, body: { codigo: "X", error: "mal", campo: "c" } });
    expect(INTERNAL_ERROR).toEqual({ status: 500, body: { codigo: "ERROR_INTERNO", error: "No se pudo completar el pedido." } });
  });
});

describe("authorizeCaller", () => {
  it("pasa el token y el ámbito pedidos", async () => {
    const calls: Array<[string | undefined, string]> = [];
    const spy: Authorize = async (t, s) => { calls.push([t, s]); return { ok: true, client: CLIENT }; };
    await authorizeCaller(spy, { authorization: "Bearer tk" }, "ab:leer", false);
    expect(calls).toEqual([["tk", "ab:leer"]]);
  });
  it("sin ámbito: 403 AMBITO_INSUFICIENTE; sin credencial válida: 401 NO_AUTORIZADO", async () => {
    const noScope = await authorizeCaller(async () => ({ ok: false, reason: "no-scope", message: "falta" }), {}, "ab:leer", false);
    expect(noScope).toEqual({ ok: false, response: { status: 403, body: { codigo: "AMBITO_INSUFICIENTE", error: "falta" } } });
    const bad = await authorizeCaller(async () => ({ ok: false, reason: "unauthorized", message: "no" }), {}, "ab:leer", false);
    expect(bad).toEqual({ ok: false, response: { status: 401, body: { codigo: "NO_AUTORIZADO", error: "no" } } });
  });
  it("una credencial sin empresa: 403 SIN_EMPRESA", async () => {
    const r = await authorizeCaller(async () => ({ ok: true, client: { ...CLIENT, tenantId: null } }), {}, "ab:leer", false);
    expect(r).toEqual({ ok: false, response: { status: 403, body: { codigo: "SIN_EMPRESA", error: "La integración no está asociada a una empresa." } } });
  });
  it("sin empresa y sin usuario de servicio: la falta de empresa va primero", async () => {
    const r = await authorizeCaller(async () => ({ ok: true, client: { ...CLIENT, tenantId: null, serviceUserId: null } }), {}, "ab:leer", true);
    expect(r).toEqual({ ok: false, response: { status: 403, body: { codigo: "SIN_EMPRESA", error: "La integración no está asociada a una empresa." } } });
  });
  it("una empresa vacía también es sin empresa", async () => {
    const r = await authorizeCaller(async () => ({ ok: true, client: { ...CLIENT, tenantId: "" } }), {}, "ab:leer", false);
    expect(r).toMatchObject({ ok: false, response: { status: 403, body: { codigo: "SIN_EMPRESA" } } });
  });
  it("sin usuario de servicio: 403 solo cuando la operación lo necesita", async () => {
    const sinUsuario: Authorize = async () => ({ ok: true, client: { ...CLIENT, serviceUserId: null } });
    expect(await authorizeCaller(sinUsuario, {}, "ab:leer", true)).toEqual({
      ok: false,
      response: { status: 403, body: { codigo: "SIN_USUARIO_DE_SERVICIO", error: "La integración no tiene un usuario de servicio." } },
    });
    expect(await authorizeCaller(sinUsuario, {}, "ab:leer", false)).toEqual({
      ok: true, caller: { client: { ...CLIENT, serviceUserId: null }, tenantId: "T1", serviceUserId: null },
    });
  });
  it("autorizado: devuelve la empresa y el usuario de servicio", async () => {
    expect(await authorizeCaller(allow, {}, "ab:leer", true)).toEqual({ ok: true, caller: { client: CLIENT, tenantId: "T1", serviceUserId: "u1" } });
  });
});
