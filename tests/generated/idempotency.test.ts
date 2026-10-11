// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  runIdempotent,
  huellaDe,
  ClaveIdempotenteReusadaError,
  OperacionEnCursoError,
} from "../../src/common/services/idempotency";

const EMPRESA_A = "empresa-a";
const EMPRESA_B = "empresa-b";

/**
 * Delegate en memoria con el MISMO índice único que la entidad:
 * (tenant_id_, client, key). La empresa va PRIMERO porque es la que faltaba: la
 * clave se buscaba por los dos últimos y dos empresas con la misma clave se
 * leían el resultado la una de la otra.
 *
 * `findFirst` omite las claves con valor `undefined`, que es la semántica de
 * Prisma y lo que hace válido a este test: un fake que las COMPARA vuelve
 * inofensivo justo el defecto que hay que atrapar — con el filtro de empresa
 * quitado, el caso cross-tenant pasaba igual.
 *
 * El create tira P2002 igual que Prisma, que es lo que hace que la carrera se
 * resuelva donde se tiene que resolver.
 */
const delegateFalso = () => {
  const filas: any[] = [];
  let n = 0;
  const empresaDe = (data: any) => data.tenant_?.connect?.id ?? data.tenant_id_;
  return {
    filas,
    idempotencyRecord: {
      findFirst: async ({ where }: any) => {
        const condiciones = Object.entries(where).filter(
          ([, v]) => v !== undefined
        );
        return (
          filas.find((f) =>
            condiciones.every(([k, v]) => (f as any)[k] === v)
          ) ?? null
        );
      },
      create: async ({ data }: any) => {
        const empresa = empresaDe(data);
        if (
          filas.some(
            (f) =>
              f.tenant_id_ === empresa &&
              f.client === data.client &&
              f.key === data.key
          )
        ) {
          const e: any = new Error("Unique constraint failed");
          e.code = "P2002";
          throw e;
        }
        const fila = { id: `r${++n}`, ...data, tenant_id_: empresa };
        filas.push(fila);
        return fila;
      },
      update: async ({ where, data }: any) => {
        const fila = filas.find((f) => f.id === where.id);
        Object.assign(fila, data);
        return fila;
      },
    },
  };
};

describe("idempotencia: una clave, una ejecución", () => {
  it("la primera llamada ejecuta", async () => {
    const db = delegateFalso();
    let veces = 0;
    const r = await runIdempotent(
      {
        empresa: EMPRESA_A,
        cliente: "facturacion",
        clave: "k1",
        cuerpo: { a: 1 },
      },
      async () => {
        veces++;
        return { comprobante: "A-0001" };
      },
      db
    );

    expect(veces).toBe(1);
    expect(r.repetido).toBe(false);
    expect(r.resultado).toEqual({ comprobante: "A-0001" });
  });

  it("reintentar con el mismo cuerpo NO ejecuta de nuevo y devuelve lo mismo", async () => {
    const db = delegateFalso();
    let veces = 0;
    const fn = async () => {
      veces++;
      return { comprobante: `A-000${veces}` };
    };
    const cuerpo = { concepto: "abono", monto: 1000 };

    const primera = await runIdempotent(
      { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1", cuerpo },
      fn,
      db
    );
    // Cinco reintentos, como los de un cliente al que se le cortó la respuesta.
    for (let i = 0; i < 5; i++) {
      const otra = await runIdempotent(
        { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1", cuerpo },
        fn,
        db
      );
      expect(otra.repetido).toBe(true);
      expect(otra.resultado).toEqual(primera.resultado);
    }

    expect(veces).toBe(1);
  });

  it("la misma clave con OTRO cuerpo es un error, no una corrección", async () => {
    const db = delegateFalso();
    const fn = async () => ({ comprobante: "A-0001" });
    await runIdempotent(
      {
        empresa: EMPRESA_A,
        cliente: "facturacion",
        clave: "k1",
        cuerpo: { monto: 1000 },
      },
      fn,
      db
    );

    // Reusar la clave para un hecho distinto es el error de cliente más común.
    // Si ganara la última, sería una corrección silenciosa de algo ya emitido.
    await expect(
      runIdempotent(
        {
          empresa: EMPRESA_A,
          cliente: "facturacion",
          clave: "k1",
          cuerpo: { monto: 9999 },
        },
        fn,
        db
      )
    ).rejects.toThrow(ClaveIdempotenteReusadaError);
  });

  it("la clave es por cliente: dos sistemas no se pisan", async () => {
    const db = delegateFalso();
    let veces = 0;
    const fn = async () => {
      veces++;
      return { n: veces };
    };
    await runIdempotent(
      {
        empresa: EMPRESA_A,
        cliente: "facturacion",
        clave: "misma",
        cuerpo: { a: 1 },
      },
      fn,
      db
    );
    await runIdempotent(
      {
        empresa: EMPRESA_A,
        cliente: "cobranzas",
        clave: "misma",
        cuerpo: { a: 1 },
      },
      fn,
      db
    );
    expect(veces).toBe(2);
  });

  it("la clave es por EMPRESA: dos empresas no se pisan", async () => {
    // Era la fuga: la lectura buscaba (cliente, clave) sobre una tabla cuyo único
    // es (empresa, cliente, clave). La segunda empresa recibía el resultado
    // guardado de la primera, con repetido:true y sin ejecutar nada. En una API
    // que emite comprobantes fiscales, eso es devolver el CAE de otra empresa.
    const db = delegateFalso();
    const clave = { cliente: "facturacion", clave: "misma", cuerpo: { a: 1 } };
    let veces = 0;

    const a = await runIdempotent(
      { empresa: EMPRESA_A, ...clave },
      async () => {
        veces++;
        return { de: "A" };
      },
      db
    );
    const b = await runIdempotent(
      { empresa: EMPRESA_B, ...clave },
      async () => {
        veces++;
        return { de: "B" };
      },
      db
    );

    expect(a.resultado).toEqual({ de: "A" });
    expect(b.resultado).toEqual({ de: "B" });
    expect(a.repetido).toBe(false);
    expect(b.repetido).toBe(false);
    expect(veces).toBe(2);
  });

  it("sin empresa corta, en vez de leer global", async () => {
    // `tenant_id_: undefined` en un where de Prisma NO filtra: OMITE la condición.
    // Degradar acá volvería la clave global sin que nada avise.
    const db = delegateFalso();
    await expect(
      runIdempotent(
        { empresa: "", cliente: "facturacion", clave: "k1" },
        async () => 1,
        db
      )
    ).rejects.toThrow(/Falta la empresa/);
    expect(db.filas).toHaveLength(0);
  });

  it("si la operación falla, la clave NO queda tomada: se puede reintentar", async () => {
    const db = delegateFalso();
    let veces = 0;
    const fn = async () => {
      veces++;
      if (veces === 1) throw new Error("ARCA no respondió");
      return { comprobante: "A-0001" };
    };
    const cuerpo = { monto: 1000 };

    await expect(
      runIdempotent(
        { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1", cuerpo },
        fn,
        db
      )
    ).rejects.toThrow("ARCA no respondió");

    // El fallo no dejó efecto, así que negarle el reintento dejaría al cliente
    // sin salida: no puede reusar la clave ni sabe si algo quedó a medias.
    const r = await runIdempotent(
      { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1", cuerpo },
      fn,
      db
    );
    expect(r.resultado).toEqual({ comprobante: "A-0001" });
    expect(veces).toBe(2);
  });

  it("dos llamadas en paralelo con la misma clave: una ejecuta, la otra no adivina", async () => {
    const db = delegateFalso();
    let veces = 0;
    const fn = async () => {
      veces++;
      await new Promise((r) => setTimeout(r, 10));
      return { comprobante: "A-0001" };
    };
    const cuerpo = { monto: 1000 };
    const dos = [
      runIdempotent(
        { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1", cuerpo },
        fn,
        db
      ),
      runIdempotent(
        { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1", cuerpo },
        fn,
        db
      ),
    ];
    const [a, b] = await Promise.allSettled(dos);

    // Exactamente una ejecución. La que perdió la carrera NO devuelve un
    // resultado inventado ni espera a ciegas: avisa que está en curso.
    expect(veces).toBe(1);
    const rechazadas = [a, b].filter((r) => r.status === "rejected");
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      OperacionEnCursoError
    );
  });

  it("sin la entidad declarada, el error dice qué falta", async () => {
    await expect(
      runIdempotent(
        { empresa: EMPRESA_A, cliente: "facturacion", clave: "k1" },
        async () => 1,
        {}
      )
    ).rejects.toThrow(/IdempotencyRecord/);
  });

  it("la huella no depende del orden de las claves del objeto", () => {
    // Si dependiera, un cliente que serializa distinto vería "otro cuerpo" y
    // recibiría un error donde correspondía la respuesta guardada.
    expect(huellaDe({ a: 1, b: 2 })).toBe(huellaDe({ a: 1, b: 2 }));
    expect(huellaDe({ a: 1 })).not.toBe(huellaDe({ a: 2 }));
  });
});
