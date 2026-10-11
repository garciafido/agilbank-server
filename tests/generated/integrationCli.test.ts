// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  issueCredential,
  rotateCredential,
  revokeCredential,
  listCredentials,
  parseArgs,
  parseExpiry,
  CredentialError,
} from "../../src/admin/integrationCli";
import {
  identificarSistemaCliente,
  huellaDeToken,
  SistemaClienteNoAutorizadoError,
} from "../../src/common/services/integrationScopes";

const AHORA = new Date("2026-08-05T12:00:00Z");
const VENCE = new Date("2026-12-31T23:59:59.999Z");
const AMBITOS = "ap:imputar ap:decidir";

// Una base en memoria con lo justo: igualdad en el where y relaciones por connect.
const baseEnMemoria = () => {
  const tablas: Record<string, any[]> = {
    tenant: [],
    user: [],
    integrationClient: [],
  };
  let siguiente = 0;
  const coincide = (fila: any, where: any = {}) =>
    Object.entries(where).every(([campo, valor]) => fila[campo] === valor);
  const aplanar = (data: any) => {
    const fila: any = {};
    for (const [campo, valor] of Object.entries(data)) {
      const conexion =
        valor && typeof valor === "object" ? (valor as any).connect : undefined;
      if (conexion)
        fila[campo === "tenant_" ? "tenant_id_" : campo + "_id"] = conexion.id;
      else fila[campo] = valor;
    }
    return fila;
  };
  // Lo que pide identificarSistemaCliente: el estado del usuario de servicio.
  const conUsuario = (tabla: string, fila: any) =>
    tabla === "integrationClient" && fila
      ? {
          ...fila,
          serviceUser:
            tablas.user.find((u) => u.id === fila.serviceUser_id) ?? null,
        }
      : fila;
  const delegado = (tabla: string) => ({
    findFirst: async ({ where }: any) =>
      conUsuario(tabla, tablas[tabla].find((f) => coincide(f, where)) ?? null),
    findMany: async ({ where }: any) =>
      tablas[tabla]
        .filter((f) => coincide(f, where))
        .map((f) => conUsuario(tabla, f)),
    create: async ({ data }: any) => {
      const fila = { id: tabla + "-" + ++siguiente, ...aplanar(data) };
      tablas[tabla].push(fila);
      return fila;
    },
    update: async ({ where, data }: any) => {
      const fila = tablas[tabla].find((f) => f.id === where.id);
      Object.assign(fila, aplanar(data));
      return fila;
    },
  });
  return {
    tablas,
    tenant: delegado("tenant"),
    user: delegado("user"),
    integrationClient: delegado("integrationClient"),
  };
};

const conEmpresa = () => {
  const db = baseEnMemoria();
  db.tablas.tenant.push(
    { id: "T1", name: "EMPRESA SA" },
    { id: "T2", name: "OTRA SA" }
  );
  db.tablas.user.push(
    { id: "u1", email: "servicio@empresa", active: true, tenant_id_: "T1" },
    { id: "u2", email: "servicio@otra", active: true, tenant_id_: "T2" },
    { id: "u3", email: "baja@empresa", active: false, tenant_id_: "T1" }
  );
  return db;
};

const emitir = (db: any, extra: any = {}) =>
  issueCredential(
    db,
    {
      tenant: "EMPRESA SA",
      user: "servicio@empresa",
      name: "ERP",
      scopes: AMBITOS,
      expiresAt: VENCE,
      ...extra,
    },
    AHORA
  );

describe("credenciales de integración desde la consola", () => {
  it("emite: el token se muestra una vez y se guarda solo su huella", async () => {
    const db = conEmpresa();
    const r = await emitir(db);
    expect(r.token.startsWith("apk_")).toBe(true);
    const fila = db.tablas.integrationClient[0];
    expect(fila.tokenHash).toBe(huellaDeToken(r.token));
    expect(JSON.stringify(db.tablas)).not.toContain(r.token);
    const sistema = await identificarSistemaCliente(r.token, db, AHORA);
    expect(sistema.tenantId).toBe("T1");
    expect(sistema.serviceUserId).toBe("u1");
    expect(sistema.scopes).toEqual(["ap:imputar", "ap:decidir"]);
  });

  it("la empresa se busca por nombre exacto o id, nunca por parecido", async () => {
    // Una credencial emitida para otra empresa le da a un tercero sus datos.
    await expect(emitir(conEmpresa(), { tenant: "EMPRESA" })).rejects.toThrow(
      CredentialError
    );
    const r = await emitir(conEmpresa(), { tenant: "T1" });
    expect(r.tenant.id).toBe("T1");
  });

  it("un usuario de servicio de otra empresa no sirve", async () => {
    await expect(
      emitir(conEmpresa(), { user: "servicio@otra" })
    ).rejects.toThrow(/otra empresa/);
  });

  it("un usuario de servicio inactivo no sirve: la credencial nacería cortada", async () => {
    await expect(
      emitir(conEmpresa(), { user: "baja@empresa" })
    ).rejects.toThrow(CredentialError);
  });

  it("sin decidir el vencimiento no emite; decidir que no vence, sí", async () => {
    await expect(
      emitir(conEmpresa(), { expiresAt: undefined })
    ).rejects.toThrow(/vencimiento/);
    const r = await emitir(conEmpresa(), { expiresAt: null });
    expect(r.expiresAt).toBeNull();
  });

  it("un vencimiento que ya pasó no emite", async () => {
    await expect(
      emitir(conEmpresa(), { expiresAt: new Date("2026-08-01T00:00:00Z") })
    ).rejects.toThrow(CredentialError);
  });

  it("sin ámbitos o con comodines no emite", async () => {
    await expect(emitir(conEmpresa(), { scopes: "" })).rejects.toThrow(
      CredentialError
    );
    await expect(emitir(conEmpresa(), { scopes: "ap:*" })).rejects.toThrow(
      /comodines/
    );
  });

  it("no pisa una credencial que ya existe: para eso está rotate", async () => {
    const db = conEmpresa();
    await emitir(db);
    await expect(emitir(db)).rejects.toThrow(/rotate/);
    expect(db.tablas.integrationClient).toHaveLength(1);
  });

  it("crea la empresa y el usuario de servicio solo si se pide", async () => {
    const db = baseEnMemoria();
    await expect(emitir(db, { tenant: "NUEVA SA" })).rejects.toThrow(
      /create-tenant/
    );
    await expect(
      emitir(db, { tenant: "NUEVA SA", createTenant: true })
    ).rejects.toThrow(/create-user/);
    const r = await emitir(db, {
      tenant: "NUEVA SA",
      createTenant: true,
      createUser: "Integración ERP",
    });
    const usuario = db.tablas.user[0];
    expect(usuario.tenant_id_).toBe(r.tenant.id);
    expect(usuario.active).toBe(true);
    // Nadie conoce la contraseña: es un hash de algo que no se guardó.
    expect(String(usuario.password).startsWith("$2")).toBe(true);
    const sistema = await identificarSistemaCliente(r.token, db, AHORA);
    expect(sistema.tenantId).toBe(r.tenant.id);
  });

  it("renovar cambia el token y el anterior deja de entrar", async () => {
    const db = conEmpresa();
    const emitido = await emitir(db);
    const renovado = await rotateCredential(
      db,
      { tenant: "EMPRESA SA", name: "ERP" },
      AHORA
    );
    expect(renovado.token).not.toBe(emitido.token);
    await expect(
      identificarSistemaCliente(emitido.token, db, AHORA)
    ).rejects.toThrow(SistemaClienteNoAutorizadoError);
    const sistema = await identificarSistemaCliente(renovado.token, db, AHORA);
    expect(sistema.tenantId).toBe("T1");
  });

  it("revocar corta, y renovar no reactiva una revocada", async () => {
    const db = conEmpresa();
    const emitido = await emitir(db);
    const r = await revokeCredential(
      db,
      { tenant: "EMPRESA SA", name: "ERP" },
      AHORA
    );
    expect(r.alreadyRevoked).toBe(false);
    await expect(
      identificarSistemaCliente(emitido.token, db, AHORA)
    ).rejects.toThrow(SistemaClienteNoAutorizadoError);
    await expect(
      rotateCredential(db, { tenant: "EMPRESA SA", name: "ERP" }, AHORA)
    ).rejects.toThrow(/revocada/);
    const otraVez = await revokeCredential(
      db,
      { tenant: "EMPRESA SA", name: "ERP" },
      AHORA
    );
    expect(otraVez.alreadyRevoked).toBe(true);
  });

  it("listar no expone huellas", async () => {
    const db = conEmpresa();
    await emitir(db);
    const filas = await listCredentials(db, { tenant: "EMPRESA SA" });
    expect(filas).toHaveLength(1);
    await expect(listCredentials(db, { tenant: "NO EXISTE" })).rejects.toThrow(
      CredentialError
    );
  });

  it("una opción mal escrita no se ignora", () => {
    // Con --expire en vez de --expires se emitiría sin la fecha que se quiso poner.
    expect(() => parseArgs(["issue", "--expire", "2026-12-31"])).toThrow(
      CredentialError
    );
    expect(() => parseArgs(["issue", "--create-tenant", "SI"])).toThrow(
      CredentialError
    );
    expect(() => parseArgs(["issue", "suelto"])).toThrow(CredentialError);
    expect(() => parseArgs(["borrar"])).toThrow(CredentialError);
    expect(
      parseArgs(["issue", "--no-expiry", "--tenant", "EMPRESA SA"]).flags
    ).toEqual({
      "no-expiry": true,
      tenant: "EMPRESA SA",
    });
  });

  it("una fecha sola vence al terminar ese día, en UTC", () => {
    expect(parseExpiry("2026-12-31", false)?.toISOString()).toBe(
      "2026-12-31T23:59:59.999Z"
    );
    expect(parseExpiry(undefined, true)).toBeNull();
    expect(parseExpiry(undefined, false)).toBeUndefined();
    expect(() => parseExpiry("2026-12-31", true)).toThrow(CredentialError);
    expect(() => parseExpiry("31/12/2026", false)).toThrow(CredentialError);
    expect(() => parseExpiry(true, false)).toThrow(CredentialError);
  });

  it("sin la entidad declarada, el error lo dice", async () => {
    await expect(issueCredential({}, { tenant: "X" }, AHORA)).rejects.toThrow(
      /IntegrationClient/
    );
  });
});
