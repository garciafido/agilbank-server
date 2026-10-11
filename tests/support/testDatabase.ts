/**
 * Apunta TODO test del proyecto a una base dedicada, y aborta si no lo logra.
 *
 * Este archivo es del GENERADOR y no se edita en el proyecto: no es comodidad,
 * es la única barrera entre una suite que limpia tablas y la base de desarrollo.
 * Un test que borra apuntando a la base equivocada cuesta horas de datos de
 * prueba armados a mano, y el daño no se nota hasta mucho después.
 *
 * Va en `setupFiles`, antes de que `src/prisma/client` construya el pool: ese
 * módulo lee `process.env.DATABASE_URL` al inicializarse, así que setearlo acá
 * es lo que garantiza que nadie escriba donde no debe. El pool usa
 * `DATABASE_URL_APP` antes que `DATABASE_URL` si el deployment la declara (el
 * rol de la aplicación, src/prisma/poolOptions.ts): también se apunta a la de test.
 *
 *   setupFiles: ["<rootDir>/tests/support/testDatabase.ts"]
 *
 * La URL se deriva de la de desarrollo agregando `_test` al nombre de la base,
 * o se fija a mano con TEST_DATABASE_URL.
 *
 * Preparar la base (una vez):
 *   psql "$DATABASE_URL" -c "CREATE DATABASE <base>_test;"
 *   npx prisma db push --url "$TEST_DATABASE_URL"
 */

import * as fs from "fs";
import * as path from "path";
import { requestPoolConfig } from "../../src/prisma/poolOptions";

/**
 * La URL de desarrollo.
 *
 * Lee `.env` a mano en vez de usar dotenv porque `setupFiles` corre antes que
 * cualquier carga de entorno del proyecto: acá `process.env.DATABASE_URL`
 * todavía puede estar vacío, y esperar a que alguien lo llene es justamente el
 * agujero que este archivo cierra.
 */
function developmentUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envFile = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envFile)) return "";

  const line = fs
    .readFileSync(envFile, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("DATABASE_URL="));

  return line
    ? line
        .split("=")
        .slice(1)
        .join("=")
        .trim()
        .replace(/^["']|["']$/g, "")
    : "";
}

/** Agrega `_test` al nombre de la base, conservando el resto de la URL. */
function withTestSuffix(url: string): string {
  return url.replace(
    /\/([^/?]+)(\?|$)/,
    (_m, db: string, tail: string) => `/${db}_test${tail}`
  );
}

const derived = withTestSuffix(developmentUrl());

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? derived;

// Se setea aunque esté vacío: dejar la de desarrollo sería peor que fallar.
process.env.DATABASE_URL = TEST_DATABASE_URL;
// La del rol de la aplicación, que el pool prefiere: a la misma de test. Se pone en
// vez de borrarla porque si algo carga el .env más tarde, dotenv no pisa una
// variable que ya está, y una borrada volvería con la base de la app.
process.env.DATABASE_URL_APP = TEST_DATABASE_URL;

/**
 * A qué base apunta una URL, para el mensaje de la guarda: el host y el nombre de
 * la base, nunca el usuario, la clave ni la query (que también puede traer la
 * clave). Si no se puede leer como una URL con "esquema://", no se muestra: sin
 * eso, URL toma lo que sigue a los dos puntos como el camino, tal cual.
 *
 * Exportada para su test (tests/generated/testDatabaseGuard.test.ts).
 */
export function describeUrl(url: string): string {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return "URL no válida";
  try {
    const parsed = new URL(url);
    const shown = `${parsed.host}${parsed.pathname}`;
    // Una @ que quedó en el host, el camino, la query o el fragmento es parte de una
    // clave sin codificar (con una /, un ? o un # que URL tomó como fin del usuario):
    // no se muestra.
    if (
      [parsed.host, parsed.pathname, parsed.search, parsed.hash].some((part) =>
        part.includes("@")
      )
    )
      return "URL no válida";
    // Y si la URL tiene una @, lo que se muestra tiene que ser, tal cual, el texto que
    // sigue a la última: el usuario y la clave terminan en una @, así que nada de lo
    // que va después es de ellos. Cubre lo que la lista de arriba no ve: un /.. en el
    // camino, que URL resuelve llevándose el pedazo con la @.
    if (
      url.includes("@") &&
      !url.slice(url.lastIndexOf("@") + 1).startsWith(shown)
    )
      return "URL no válida";
    return shown;
  } catch {
    return "URL no válida";
  }
}

/**
 * Guarda para cualquier suite que ESCRIBA o BORRE.
 *
 * Llamar al principio del `beforeAll`. Falla ruidosamente **antes** de tocar
 * nada: el modo de falla que importa no es el test que rompe, es el que pasa
 * después de haber vaciado la base equivocada.
 */
export function assertSafeTestDatabase(): void {
  // Las dos URL que usan los tests: DATABASE_URL (la leen el proyecto y sus
  // scripts) y la que de verdad usa el pool de src/prisma/client
  // (requestPoolConfig, que prefiere DATABASE_URL_APP). Las dos, de test.
  const urls: [string, string][] = [
    ["DATABASE_URL", process.env.DATABASE_URL ?? ""],
    [
      "la URL del pool (DATABASE_URL_APP, o DATABASE_URL)",
      requestPoolConfig(process.env.DATABASE_URL).connectionString ?? "",
    ],
  ];

  for (const [name, url] of urls) {
    if (!url) {
      throw new Error(
        "No se pudo determinar la base de test.\n" +
          "Definí TEST_DATABASE_URL, o DATABASE_URL en el .env para que se derive agregándole _test."
      );
    }

    if (!/\/[^/?]+_test(\?|$)/.test(url)) {
      throw new Error(
        `Este test escribe en la base y ${name} no apunta a una base _test.\n` +
          `Valor actual: ${describeUrl(url)}\n` +
          `Abortado antes de tocar ningún dato.`
      );
    }
  }
}
