// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.

import { buildPathIndex } from "../../../src/common/utils/templateFields/pathIndex";

describe("buildPathIndex", () => {
  it("da el camino de cada objeto y lista, con la raíz vacía", () => {
    const data = {
      authors: [
        { taxId: "20-1" },
        { taxId: "27-2", country: { name_es: "Chile" } },
      ],
      contractMetadata: { editionInfo: { name: "Álbum" } },
      works: [{ title: "Zamba", alternativeTitles: ["La zamba", "Zambita"] }],
    };
    const index = buildPathIndex(data);
    expect(index.get(data)).toBe("");
    expect(index.get(data.authors)).toBe("authors");
    expect(index.get(data.authors[1])).toBe("authors[1]");
    expect(index.get(data.authors[1].country!)).toBe("authors[1].country");
    expect(index.get(data.contractMetadata.editionInfo)).toBe(
      "contractMetadata.editionInfo"
    );
    expect(index.get(data.works[0].alternativeTitles)).toBe(
      "works[0].alternativeTitles"
    );
  });

  it("con una referencia compartida gana el primer camino del recorrido", () => {
    const country = { name_es: "Argentina" };
    const data = { authors: [{ country }], publishers: [{ country }] };
    expect(buildPathIndex(data).get(country)).toBe("authors[0].country");
  });

  it("no se cuelga con ciclos", () => {
    const a: Record<string, unknown> = { name: "a" };
    const b: Record<string, unknown> = { name: "b", a };
    a.b = b;
    const index = buildPathIndex({ a });
    expect(index.get(a)).toBe("a");
    expect(index.get(b)).toBe("a.b");
  });

  it("registra un Buffer o una fecha sin recorrer su contenido", () => {
    const logo = Buffer.alloc(1_000_000);
    const fecha = new Date("2026-09-30T00:00:00Z");
    const index = buildPathIndex({ edition: { logo, fecha } });
    expect(index.get(logo)).toBe("edition.logo");
    expect(index.get(fecha)).toBe("edition.fecha");
  });

  it("con un valor que no es objeto devuelve un índice vacío", () => {
    const index = buildPathIndex(null);
    expect(index).toBeInstanceOf(WeakMap);
    expect(() => buildPathIndex("texto")).not.toThrow();
  });
});
