// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * La fecha sin hora, en las seis zonas: corre los archivos de casos sin base
 * (tests/generated/zonas/*.zona.ts) en un jest hijo por zona (support/enCadaZona.ts).
 * Si una zona falla, muestra el final de su salida.
 */
import {
  PLAZO_POR_ZONA_MS,
  ZONAS,
  correrEnZona,
  finalDe,
} from "./support/enCadaZona";

describe.each(ZONAS.map(([zona]) => [zona]))("con el proceso en %s", (zona) => {
  it(
    "pasan los casos de la fecha sin hora",
    () => {
      const { status, salida } = correrEnZona(
        "tests/generated/zonas/*.zona.ts",
        zona
      );
      expect({
        zona,
        status,
        salida: status === 0 ? "" : finalDe(salida),
      }).toEqual({ zona, status: 0, salida: "" });
    },
    PLAZO_POR_ZONA_MS
  );
});
