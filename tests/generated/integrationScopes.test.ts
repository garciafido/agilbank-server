// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  autorizarSistemaCliente,
  identificarSistemaCliente,
  exigirAmbito,
  contextoDeSistemaCliente,
  huellaDeToken,
  parsearAmbitos,
  SistemaClienteNoAutorizadoError,
  AmbitoInsuficienteError,
} from "../../src/common/services/integrationScopes";

const AHORA = new Date("2026-08-05T12:00:00Z");

const dbCon = (filas: any[]) => ({
  integrationClient: {
    findFirst: async ({ where }: any) =>
      filas.find((f) => f.tokenHash === where.tokenHash) ?? null,
  },
});

const clienteActivo = (over: any = {}) => ({
  id: "c1",
  name: "jupiter",
  tenant_id_: "T1",
  tokenHash: huellaDeToken("secreto"),
  scopes: "sales:issue reports:read",
  status: "active",
  expiresAt: null,
  serviceUser_id: "u-jupiter",
  serviceUser: { active: true },
  ...over,
});

describe("ámbitos de un sistema cliente", () => {
  it("con el ámbito pedido, pasa", async () => {
    const s = await autorizarSistemaCliente(
      "secreto",
      "sales:issue",
      dbCon([clienteActivo()]),
      AHORA
    );
    expect(s.name).toBe("jupiter");
    expect(s.tenantId).toBe("T1");
  });

  it("sin el ámbito pedido, corta", async () => {
    await expect(
      autorizarSistemaCliente(
        "secreto",
        "periods:close",
        dbCon([clienteActivo()]),
        AHORA
      )
    ).rejects.toThrow(AmbitoInsuficienteError);
  });

  it("el rechazo dice qué ámbito falta y cuáles tiene", async () => {
    // Un "no autorizado" pelado obliga a quien integra a adivinar; y adivinar
    // termina en pedir el ámbito más ancho que exista.
    try {
      await autorizarSistemaCliente(
        "secreto",
        "periods:close",
        dbCon([clienteActivo()]),
        AHORA
      );
      throw new Error("no cortó");
    } catch (e: any) {
      expect(e.message).toContain("periods:close");
      expect(e.message).toContain("sales:issue");
    }
  });

  it("no hay comodines: sales:* no habilita sales:issue", () => {
    // Un comodín se concede una vez y nadie revisa qué abarcó cuando
    // aparecieron operaciones nuevas.
    const sistema = {
      id: "c1",
      name: "jupiter",
      tenantId: "T1",
      scopes: ["sales:*"],
      serviceUserId: "u",
    };
    expect(() => exigirAmbito(sistema, "sales:issue")).toThrow(
      AmbitoInsuficienteError
    );
  });

  it("sin token, no autorizado", async () => {
    await expect(
      identificarSistemaCliente(undefined, dbCon([clienteActivo()]), AHORA)
    ).rejects.toThrow(SistemaClienteNoAutorizadoError);
  });

  it("todo rechazo da el MISMO error que un token inexistente", async () => {
    // Distinguirlos le diría a quien prueba tokens cuáles existen.
    const mensajes: string[] = [];
    const casos = [
      dbCon([]), // inexistente
      dbCon([clienteActivo({ status: "revoked" })]),
      dbCon([clienteActivo({ expiresAt: new Date("2026-08-01T00:00:00Z") })]),
      dbCon([clienteActivo({ serviceUser: { active: false } })]),
    ];
    for (const db of casos) {
      try {
        await identificarSistemaCliente("secreto", db, AHORA);
        throw new Error("no cortó");
      } catch (e: any) {
        expect(e).toBeInstanceOf(SistemaClienteNoAutorizadoError);
        mensajes.push(e.message);
      }
    }
    expect(new Set(mensajes).size).toBe(1);
  });

  it("con el usuario de servicio dado de baja, no se identifica", async () => {
    // El sistema escribe como ese usuario: darlo de baja corta la integración
    // aunque el token siga vigente.
    await expect(
      identificarSistemaCliente(
        "secreto",
        dbCon([clienteActivo({ serviceUser: { active: false } })]),
        AHORA
      )
    ).rejects.toThrow(SistemaClienteNoAutorizadoError);
  });

  it("un vencimiento futuro NO invalida", async () => {
    const db = dbCon([
      clienteActivo({ expiresAt: new Date("2026-12-31T00:00:00Z") }),
    ]);
    const s = await identificarSistemaCliente("secreto", db, AHORA);
    expect(s.name).toBe("jupiter");
  });

  it("el token no se guarda: lo que se compara es su huella", async () => {
    const db = dbCon([clienteActivo()]);
    // La fila no contiene el token en claro por ningún lado.
    expect(JSON.stringify(clienteActivo())).not.toContain("secreto");
    await expect(identificarSistemaCliente("otro", db, AHORA)).rejects.toThrow(
      SistemaClienteNoAutorizadoError
    );
  });

  it("los ámbitos se leen separados por espacios, y el vacío no es un ámbito", () => {
    expect(parsearAmbitos("a b  c")).toEqual(["a", "b", "c"]);
    expect(parsearAmbitos("")).toEqual([]);
    expect(parsearAmbitos(null)).toEqual([]);
  });

  it("opera como su usuario de servicio, no como un actor nuevo", async () => {
    // Que escriba como un User es lo que hace que el filtro de empresa, los
    // permisos y la auditoría sigan valiendo sin tocar SecurePrismaOps.
    const s = await identificarSistemaCliente(
      "secreto",
      dbCon([clienteActivo()]),
      AHORA
    );
    const ctx = await contextoDeSistemaCliente(
      s,
      async (id) => ({
        usuario: { id, tenant_id_: "T1", active: true },
        permisos: new Set(["a_create"]),
      }),
      s.serviceUserId!
    );
    expect(ctx.currentUser.id).toBe("u-jupiter");
    expect(ctx.currentUser.tenant_id_).toBe("T1");
    expect(ctx.isSystemMode).toBe(false);
    expect(ctx.permissions().has("a_create")).toBe(true);
  });

  it("NUNCA es modo sistema: un programa no se salta el filtro de empresa", async () => {
    const s = await identificarSistemaCliente(
      "secreto",
      dbCon([clienteActivo()]),
      AHORA
    );
    const ctx = await contextoDeSistemaCliente(
      s,
      async (id) => ({
        usuario: { id, tenant_id_: "T1", active: true },
        permisos: new Set(),
      }),
      s.serviceUserId!
    );
    // isSystemMode significa "confiá en lo que venga". Una máquina jamás.
    expect(ctx.isSystemMode).toBe(false);
  });

  it("si el usuario de servicio está inactivo, la integración corta", async () => {
    // Dar de baja la identidad tiene que cortar: si no, quedaría escribiendo
    // igual, que es lo contrario de lo que quiso quien la dio de baja.
    const s = await identificarSistemaCliente(
      "secreto",
      dbCon([clienteActivo()]),
      AHORA
    );
    await expect(
      contextoDeSistemaCliente(
        s,
        async (id) => ({
          usuario: { id, tenant_id_: "T1", active: false },
          permisos: new Set(),
        }),
        s.serviceUserId!
      )
    ).rejects.toThrow(SistemaClienteNoAutorizadoError);
  });

  it("sin usuario de servicio, tampoco opera", async () => {
    const s = await identificarSistemaCliente(
      "secreto",
      dbCon([clienteActivo()]),
      AHORA
    );
    await expect(
      contextoDeSistemaCliente(s, async () => null, "inexistente")
    ).rejects.toThrow(SistemaClienteNoAutorizadoError);
  });

  it("sin la entidad declarada, el error dice qué falta", async () => {
    await expect(
      identificarSistemaCliente("secreto", {}, AHORA)
    ).rejects.toThrow(/IntegrationClient/);
  });
});
