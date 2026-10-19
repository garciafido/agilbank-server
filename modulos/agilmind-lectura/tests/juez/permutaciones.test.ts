// agilmind-lectura/tests/juez/permutaciones.test.ts
// La regla 7 sobre un caso completo: campos, listas y jueces, cada uno en cualquier orden, dan el mismo dictamen.
import { coordinar, controlDeSuma, indice, TOPE_POR_DEFECTO, type Juez, type Lectura, type Propuesta } from "../../src/juez";

const pesos = (id: string, valor: number) => ({ id, valor: { tipo: "centavos" as const, valor, moneda: "ARS" }, veredicto: "grounded" as const });
const lectura: Lectura = {
  campos: [pesos("total", 1210), pesos("neto", 1000), pesos("iva", 210)],
  listas: [
    { id: "renglones", elementos: [pesos("r1", 600), pesos("r2", 400)] },
    { id: "descuentos", elementos: [pesos("d1", 30), pesos("d2", 70)] },
  ],
};
const jueces: Juez[] = [
  { id: "cierre", version: "1", juzgar: (l) => [controlDeSuma({ id: "total = neto + iva", total: "total", partes: ["neto", "iva"], tolerancia: 0, veredictoSiCierra: "verified" }, indice(l))] },
  { id: "suma", version: "1", juzgar: (l) => [controlDeSuma({ id: "neto = Σ renglones", total: "neto", partes: l.listas.find((x) => x.id === "renglones")!.elementos.map((e) => e.id), tolerancia: 0, veredictoSiCierra: "verified" }, indice(l))] },
];

const perms = <T>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

it("todas las permutaciones de campos y jueces dan el mismo dictamen", () => {
  const ref = coordinar(lectura, { jueces, despeja: new Set(), tope: TOPE_POR_DEFECTO });
  for (const campos of perms(lectura.campos)) for (const listas of perms(lectura.listas)) for (const js of perms(jueces)) {
    expect(coordinar({ campos, listas }, { jueces: js, despeja: new Set(), tope: TOPE_POR_DEFECTO })).toEqual(ref);
  }
});

describe("con despeja activo y jueces que proponen", () => {
  const sinIva: Lectura = {
    campos: [pesos("total", 1210), pesos("neto", 1000), { id: "iva", valor: null, veredicto: "abstained" }],
    listas: lectura.listas,
  };
  const propone = (id: string, valor: number): Juez => ({
    id, version: "1",
    juzgar: (l) => [controlDeSuma({ id: "total = neto + iva", total: "total", partes: ["neto", "iva"], tolerancia: 0, veredictoSiCierra: "verified" }, indice(l))],
    proponer: (): { propuestas: Propuesta[]; ambiguas: Propuesta[]; truncada: boolean } => ({
      propuestas: [{
        campo: "iva", valor: { tipo: "centavos", valor, moneda: "ARS" }, controles: ["total = neto + iva"], derivadaDe: ["total = neto + iva"],
        origen: { camino: "despeje" }, veredicto: "verified", motivo: `despejado por ${id}`,
      }],
      ambiguas: [],
      truncada: false,
    }),
  });
  const js = [propone("a-despeja", 210), propone("b-despeja", 210), propone("c-despeja", 999), jueces[1]];
  const declaracion = (jueces: Juez[]) => ({ jueces, despeja: new Set(["a-despeja", "b-despeja", "c-despeja"]), tope: TOPE_POR_DEFECTO });

  it("las propuestas, las ambiguas y los controles no dependen del orden de nada", () => {
    const ref = coordinar(sinIva, declaracion(js));
    expect(ref.propuestas.length + ref.ambiguas.length).toBeGreaterThan(0);
    for (const campos of perms(sinIva.campos)) for (const listas of perms(sinIva.listas)) for (const orden of perms(js)) {
      expect(coordinar({ campos, listas }, declaracion(orden))).toEqual(ref);
    }
  });
});
