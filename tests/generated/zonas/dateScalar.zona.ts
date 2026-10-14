// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * El escalar Date de GraphQL (src/common/graphql/dateScalar.ts), con el proceso en
 * una de las seis zonas (lo corre tests/generated/calendarDate.test.ts), en un
 * schema con los inputs de filtro de fechas del proyecto (common.graphql):
 * - el día entra por una variable o un literal y le llega al resolver como el Date
 *   de su medianoche UTC; sale como "AAAA-MM-DD";
 * - lo que no es un día que existe se rechaza con BAD_USER_INPUT, sin llegar al
 *   resolver;
 * - FilterDate tipa sus comparaciones con el escalar y no tiene range, regex ni
 *   notIn; FilterDateTime queda como estaba.
 */
import * as fs from "fs";
import * as path from "path";
import { graphql } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { afirmarZona } from "../support/enCadaZona";
import { DateScalar } from "../../../src/common/graphql/dateScalar";

const ZONA = afirmarZona();
const COMMON = fs.readFileSync(
  path.resolve(__dirname, "../../../src/common/schemas/common.graphql"),
  "utf8"
);
/** Un bloque del SDL del proyecto, tal cual. */
const bloque = (inicio: RegExp): string => {
  const m = inicio.exec(COMMON);
  if (!m) throw new Error(`common.graphql no tiene ${inicio}`);
  return m[0];
};
const FILTER_DATE = bloque(/input FilterDate \{[^}]*\}/);
const FILTER_DATE_TIME = bloque(/input FilterDateTime \{[^}]*\}/);

let recibido: unknown;
const llamadas: string[] = [];
const schema = makeExecutableSchema({
  typeDefs: `
    scalar Date
    scalar DateTime
    ${FILTER_DATE}
    ${FILTER_DATE_TIME}
    type Prueba { dia: Date }
    type Query {
      eco(dia: Date): Prueba
      filtro(f: FilterDate): String
      filtroInstante(f: FilterDateTime): String
      salida(valor: String!): Prueba
    }
  `,
  resolvers: {
    Date: DateScalar,
    Query: {
      eco: (_: unknown, args: { dia: unknown }) => {
        llamadas.push("eco");
        recibido = args.dia;
        return { dia: args.dia };
      },
      filtro: (_: unknown, args: { f: unknown }) => {
        llamadas.push("filtro");
        recibido = args.f;
        return "ok";
      },
      filtroInstante: (_: unknown, args: { f: unknown }) => {
        recibido = args.f;
        return "ok";
      },
      // "date": el Date que da Prisma de una columna date; otro texto, ese texto.
      salida: (_: unknown, args: { valor: string }) => ({
        dia:
          args.valor === "date"
            ? new Date("1985-03-12T00:00:00.000Z")
            : args.valor,
      }),
    },
  },
});
const ejecutar = (source: string, variableValues?: Record<string, unknown>) =>
  graphql({ schema, source, variableValues });
const iso = (valor: unknown) =>
  valor instanceof Date ? valor.toISOString() : valor;

beforeEach(() => {
  recibido = undefined;
  llamadas.length = 0;
});

describe(`el escalar Date, con el proceso en ${ZONA}`, () => {
  it("por una variable: el resolver recibe la medianoche UTC del día y la respuesta es el día", async () => {
    const r = await ejecutar("query($d: Date) { eco(dia: $d) { dia } }", {
      d: "1985-03-12",
    });
    expect(r.errors).toBeUndefined();
    expect(iso(recibido)).toBe("1985-03-12T00:00:00.000Z");
    expect(r.data).toEqual({ eco: { dia: "1985-03-12" } });
  });

  it("por un literal, lo mismo", async () => {
    const r = await ejecutar('{ eco(dia: "2024-02-29") { dia } }');
    expect(r.errors).toBeUndefined();
    expect(iso(recibido)).toBe("2024-02-29T00:00:00.000Z");
    expect(r.data).toEqual({ eco: { dia: "2024-02-29" } });
  });

  it.each([
    ["2026-02-30"],
    ["12/03/1985"],
    ["1985-03-12T00:00:00.000Z"],
    [""],
    [19850312],
    [true],
  ])(
    "la variable %p se rechaza con BAD_USER_INPUT y no llega al resolver",
    async (valor) => {
      const r = await ejecutar("query($d: Date) { eco(dia: $d) { dia } }", {
        d: valor,
      });
      expect(r.errors?.map((e) => e.extensions?.code)).toEqual([
        "BAD_USER_INPUT",
      ]);
      expect(r.errors?.[0].message).toContain(
        'Date: el valor no es un día de calendario; se espera un día "AAAA-MM-DD" que exista'
      );
      expect(llamadas).toEqual([]);
    }
  );

  it("el literal de un día que no existe se rechaza con BAD_USER_INPUT", async () => {
    const r = await ejecutar('{ eco(dia: "2026-02-30") { dia } }');
    expect(r.errors?.map((e) => e.extensions?.code)).toEqual([
      "BAD_USER_INPUT",
    ]);
    expect(llamadas).toEqual([]);
  });

  it("sale como el día: el Date de Prisma, el texto, y un ISO con hora de un dato viejo", async () => {
    for (const [valor, dia] of [
      ["date", "1985-03-12"],
      ["1985-03-12", "1985-03-12"],
      ["1985-03-12T03:00:00.000Z", "1985-03-12"],
    ]) {
      const r = await ejecutar(
        "query($v: String!) { salida(valor: $v) { dia } }",
        { v: valor }
      );
      expect({ valor, data: r.data, errors: r.errors }).toEqual({
        valor,
        data: { salida: { dia } },
        errors: undefined,
      });
    }
    const malo = await ejecutar('{ salida(valor: "basura") { dia } }');
    expect(malo.errors?.length).toBe(1);
  });

  it("FilterDate: las comparaciones llegan como Date; not: null queda null", async () => {
    const r = await ejecutar("query($f: FilterDate) { filtro(f: $f) }", {
      f: {
        equals: "2024-02-29",
        gte: "2024-01-01",
        lt: "2025-01-01",
        lte: "2024-12-31",
        gt: "2023-12-31",
        in: ["2024-03-01"],
        not: null,
      },
    });
    expect(r.errors).toBeUndefined();
    const f = recibido as Record<string, unknown>;
    expect({
      equals: iso(f.equals),
      gte: iso(f.gte),
      lt: iso(f.lt),
      lte: iso(f.lte),
      gt: iso(f.gt),
      in: (f.in as unknown[]).map(iso),
      not: f.not,
    }).toEqual({
      equals: "2024-02-29T00:00:00.000Z",
      gte: "2024-01-01T00:00:00.000Z",
      lt: "2025-01-01T00:00:00.000Z",
      lte: "2024-12-31T00:00:00.000Z",
      gt: "2023-12-31T00:00:00.000Z",
      in: ["2024-03-01T00:00:00.000Z"],
      not: null,
    });
  });

  it("FilterDate rechaza un día que no existe adentro del filtro", async () => {
    const r = await ejecutar("query($f: FilterDate) { filtro(f: $f) }", {
      f: { gte: "2024-02-30" },
    });
    expect(r.errors?.map((e) => e.extensions?.code)).toEqual([
      "BAD_USER_INPUT",
    ]);
    expect(llamadas).toEqual([]);
  });

  it.each([["range"], ["regex"], ["notIn"]])(
    "FilterDate ya no tiene %s",
    async (campo) => {
      const r = await ejecutar(`{ filtro(f: { ${campo}: "x" }) }`);
      expect(r.errors?.[0].message).toContain(
        `Field "${campo}" is not defined by type "FilterDate"`
      );
    }
  );

  it("FilterDateTime no cambia: sus campos siguen siendo texto, con range", async () => {
    const r = await ejecutar(
      '{ filtroInstante(f: { gte: "2026-10-11T03:00:00.000Z", range: "x" }) }'
    );
    expect(r.errors).toBeUndefined();
    expect(recibido).toEqual({ gte: "2026-10-11T03:00:00.000Z", range: "x" });
  });
});
