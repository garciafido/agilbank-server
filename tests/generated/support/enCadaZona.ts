// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * Las seis zonas en que corren las pruebas de la fecha sin hora, y cómo se corren:
 * un jest hijo por zona, con TZ en su entorno (adentro de un test la zona no se
 * puede cambiar: jest le da una copia de process.env). Los archivos de casos
 * (tests/generated/zonas/*.zona.ts) empiezan con afirmarZona().
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/** Cada zona y el desfase de `new Date(2026, 0, 15)` en ella, en minutos (getTimezoneOffset). */
export const ZONAS: ReadonlyArray<readonly [string, number]> = [
  ["America/Argentina/Buenos_Aires", 180],
  ["UTC", 0],
  ["Asia/Tokyo", -540],
  ["Pacific/Kiritimati", -840],
  ["Pacific/Pago_Pago", 660],
  ["Pacific/Auckland", -780],
];

const RAIZ = path.resolve(__dirname, "../../..");

/**
 * El plazo de un jest hijo. spawnSync bloquea el proceso, así que el plazo del it que
 * lo llama no corta nada: manda este. El it usa el mismo número.
 */
export const PLAZO_POR_ZONA_MS = 15 * 60 * 1000;

/**
 * Corre los archivos que encuentra `patron` (un glob de jest, relativo a la raíz del
 * proyecto) en un jest hijo con el proceso en `zona`, con el mismo entorno (la base de
 * test, si la hay) y la configuración `config`: jest.generated.config.ts para los casos
 * sin base, que solo cargan lo generado; jest.custom.config.ts, la suite del proyecto, para
 * los que cargan el server entero (src/entities arrastra el código propio, y lo que ese
 * código necesita en jest, como un stub de un paquete ESM, el proyecto lo pone ahí), que
 * además apunta la base a la de test antes de construir el pool.
 */
export function correrEnZona(
  patron: string,
  zona: string,
  config: ConfigDeJest = "jest.generated.config.ts"
): { status: number | null; salida: string } {
  const r = spawnSync(
    process.execPath,
    [
      require.resolve("jest/bin/jest"),
      "-c",
      config,
      "--ci",
      "--colors=false",
      "--runInBand",
      "--forceExit",
      "--testMatch",
      `**/${patron}`,
    ],
    // --forceExit y un plazo: un handle abierto (el latido de SSEManager, un pool) no puede colgar al corredor.
    {
      cwd: RAIZ,
      env: { ...process.env, TZ: zona },
      encoding: "utf8",
      maxBuffer: 1 << 26,
      timeout: PLAZO_POR_ZONA_MS,
    }
  );
  // Si el hijo no terminó solo (venció el plazo, ENOBUFS, ENOENT, una señal), status es
  // null: la causa está en r.error y r.signal, no en la salida.
  const causa = [
    r.error ? `error: ${r.error.message}` : "",
    r.signal ? `señal: ${r.signal}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    status: r.status,
    salida: `${r.stdout ?? ""}${r.stderr ?? ""}${causa ? `\n${causa}\n` : ""}`,
  };
}

type ConfigDeJest = "jest.generated.config.ts" | "jest.custom.config.ts";

/**
 * La configuración de la suite del proyecto (jest.custom.config.ts), para los casos que cargan
 * el server entero. El generador la emite una vez y es del proyecto: si no la tiene (la borró o
 * la renombró), va la generada, con un aviso que dice qué se pierde.
 */
export function configDeLaSuiteDelProyecto(): {
  config: ConfigDeJest;
  aviso: string | null;
} {
  if (fs.existsSync(path.join(RAIZ, "jest.custom.config.ts")))
    return { config: "jest.custom.config.ts", aviso: null };
  return {
    config: "jest.generated.config.ts",
    aviso:
      "El proyecto no tiene jest.custom.config.ts: los casos con base corren con jest.generated.config.ts, " +
      "sin lo que el proyecto le agrega a jest para su código (un stub de un paquete ESM, por ejemplo).",
  };
}

/** Las últimas líneas de la salida de un jest hijo que falló: los casos en rojo y por qué. */
export const finalDe = (salida: string): string =>
  salida.split("\n").slice(-80).join("\n");

/** Al principio de cada archivo de casos: falla si el proceso no está en la zona que pidió el corredor. */
export function afirmarZona(): string {
  const zona = process.env.TZ ?? "";
  const esperado = ZONAS.find(([z]) => z === zona);
  if (!esperado)
    throw new Error(`TZ="${zona}" no es una de las seis zonas de la prueba`);
  const desfase = new Date(2026, 0, 15).getTimezoneOffset();
  if (desfase !== esperado[1]) {
    throw new Error(
      `TZ=${zona}, pero el proceso tiene un desfase de ${desfase} minutos (se esperaban ${esperado[1]})`
    );
  }
  return zona;
}
