// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import {
  publishEvent,
  subscribeToAllEvents,
  unsubscribeFromAllEvents,
  type EventListener,
  type EventPayload,
} from "../../src/common/services/eventBus";
import {
  runWithTransactionScope,
  runAfterCommit,
} from "../../src/common/services/transactionScope";

describe("lo que sale de una transacción sale al commitear", () => {
  let entregados: EventPayload[];
  let oyente: EventListener;

  beforeEach(() => {
    entregados = [];
    oyente = (payload) => {
      entregados.push(payload);
    };
    subscribeToAllEvents(oyente);
  });

  afterEach(() => {
    unsubscribeFromAllEvents(oyente);
  });

  const publicar = (entityId: string) =>
    publishEvent("Cosa", "UPDATE", { entityId });

  it("fuera de una transacción entrega en el acto", async () => {
    await publicar("1");
    expect(entregados.map((e) => e.entityId)).toEqual(["1"]);
  });

  it("adentro no entrega nada hasta que el bloque termina", async () => {
    let vistosAdentro = -1;

    await runWithTransactionScope(async () => {
      await publicar("1");
      await publicar("2");
      vistosAdentro = entregados.length;
    });

    expect(vistosAdentro).toBe(0);
    expect(entregados.map((e) => e.entityId)).toEqual(["1", "2"]);
  });

  it("si el bloque tira, el evento no se entrega nunca", async () => {
    await expect(
      runWithTransactionScope(async () => {
        await publicar("1");
        throw new Error("la transacción revirtió");
      })
    ).rejects.toThrow("la transacción revirtió");

    expect(entregados).toHaveLength(0);
  });

  it("anidado, entrega el bloque de afuera y una sola vez", async () => {
    let vistosTrasElInterno = -1;

    await runWithTransactionScope(async () => {
      await runWithTransactionScope(async () => {
        await publicar("interno");
      });
      vistosTrasElInterno = entregados.length;
      await publicar("externo");
    });

    // El bloque de adentro no sabe si el de afuera va a commitear: no le
    // corresponde entregar nada.
    expect(vistosTrasElInterno).toBe(0);
    expect(entregados.map((e) => e.entityId)).toEqual(["interno", "externo"]);
  });

  it("si revierte el de afuera, tampoco sale lo del de adentro", async () => {
    await expect(
      runWithTransactionScope(async () => {
        await runWithTransactionScope(async () => {
          await publicar("interno");
        });
        throw new Error("revirtió la de afuera");
      })
    ).rejects.toThrow("revirtió la de afuera");

    expect(entregados).toHaveLength(0);
  });

  it("dos transacciones en paralelo no se mezclan", async () => {
    const primera = runWithTransactionScope(async () => {
      await publicar("a1");
      await new Promise((r) => setTimeout(r, 10));
      await publicar("a2");
    });

    const segunda = runWithTransactionScope(async () => {
      await publicar("b1");
      throw new Error("la segunda revierte");
    });

    await Promise.all([primera, segunda.catch(() => undefined)]);

    // b1 pertenecía a la que revirtió: no sale. Y a1/a2 salieron juntos al
    // final de la suya, no intercalados con la otra.
    expect(entregados.map((e) => e.entityId)).toEqual(["a1", "a2"]);
  });

  it("lo diferido con runAfterCommit corre al salir, no antes", async () => {
    const hechos: string[] = [];
    let hechoAdentro = -1;

    await runWithTransactionScope(async () => {
      await runAfterCommit(async () => {
        hechos.push("aviso");
      });
      hechoAdentro = hechos.length;
    });

    expect(hechoAdentro).toBe(0);
    expect(hechos).toEqual(["aviso"]);
  });

  it("lo diferido no corre si la transacción revirtió", async () => {
    const hechos: string[] = [];

    await expect(
      runWithTransactionScope(async () => {
        await runAfterCommit(async () => {
          hechos.push("aviso");
        });
        throw new Error("revirtió");
      })
    ).rejects.toThrow("revirtió");

    expect(hechos).toEqual([]);
  });

  it("fuera de una transacción, runAfterCommit corre en el acto", async () => {
    const hechos: string[] = [];
    await runAfterCommit(async () => {
      hechos.push("aviso");
    });
    expect(hechos).toEqual(["aviso"]);
  });

  it("eventos y avisos salen en el orden en que ocurrieron", async () => {
    const traza: string[] = [];
    const anotador: EventListener = (p) => traza.push(`evento:${p.entityId}`);
    subscribeToAllEvents(anotador);

    try {
      await runWithTransactionScope(async () => {
        await publicar("1");
        await runAfterCommit(async () => {
          traza.push("aviso");
        });
        await publicar("2");
      });
    } finally {
      unsubscribeFromAllEvents(anotador);
    }

    expect(traza).toEqual(["evento:1", "aviso", "evento:2"]);
  });

  it("un pendiente que falla no tumba al que espera ni frena a los demás", async () => {
    const hechos: string[] = [];

    await runWithTransactionScope(async () => {
      await runAfterCommit(async () => {
        throw new Error("Redis caído");
      });
      await runAfterCommit(async () => {
        hechos.push("el siguiente igual corre");
      });
    });

    expect(hechos).toEqual(["el siguiente igual corre"]);
  });

  it("el error de un oyente no impide entregar los demás eventos", async () => {
    const roto: EventListener = (payload) => {
      if (payload.entityId === "1") throw new Error("oyente roto");
    };
    subscribeToAllEvents(roto);

    try {
      await runWithTransactionScope(async () => {
        await publicar("1");
        await publicar("2");
      });
    } finally {
      unsubscribeFromAllEvents(roto);
    }

    expect(entregados.map((e) => e.entityId)).toEqual(["1", "2"]);
  });
});
