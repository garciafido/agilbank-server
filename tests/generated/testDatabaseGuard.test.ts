// GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
/**
 * La guarda de la base de test (tests/support/testDatabase.ts) mira la URL que
 * de verdad usa el pool de src/prisma/client: si el deployment declara
 * DATABASE_URL_APP (el rol de la aplicación, src/prisma/poolOptions.ts), el pool
 * usa esa antes que DATABASE_URL.
 *
 * 1. Al cargarse, la guarda apunta DATABASE_URL y DATABASE_URL_APP a la base de
 *    test, y el pool queda en esa.
 * 2. Si después alguna de las dos apunta a una base que no termina en _test, o
 *    no hay ninguna, assertSafeTestDatabase frena antes de cualquier consulta.
 *    El mensaje dice solo el host y el nombre de la base: nunca el usuario, la
 *    clave ni la query, y una URL que no se puede leer no se muestra.
 * 3. Una URL que se lee bien (describeUrl) muestra su host y su base, aunque la
 *    clave tenga una @ o la query la clave.
 *
 * No usa base: no se conecta a nada.
 */

import { requestPoolConfig } from "../../src/prisma/poolOptions";

const NAMES = [
  "TEST_DATABASE_URL",
  "DATABASE_URL",
  "DATABASE_URL_APP",
] as const;
const before: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const name of NAMES) before[name] = process.env[name];
});
afterEach(() => {
  for (const name of NAMES) {
    if (before[name] === undefined) delete process.env[name];
    else process.env[name] = before[name];
  }
});

/** La guarda recién cargada (al cargarse apunta las URL a la de test), con el entorno de `env`. */
type Guard = {
  assertSafeTestDatabase: () => void;
  describeUrl: (url: string) => string;
};
function load(
  env: Partial<Record<typeof NAMES[number], string | undefined>>
): Guard {
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  let guard: Guard | undefined;
  jest.isolateModules(() => {
    guard = require("../support/testDatabase");
  });
  return guard!;
}

const TEST = "postgresql://prueba:clave@127.0.0.1:5432/proyecto_test";
const APP = "postgresql://app:secreta@127.0.0.1:5432/proyecto";

it("al cargarse apunta DATABASE_URL y DATABASE_URL_APP a la base de test, y el pool usa esa", () => {
  const { assertSafeTestDatabase } = load({
    TEST_DATABASE_URL: TEST,
    DATABASE_URL: APP,
    DATABASE_URL_APP: APP,
  });
  expect([process.env.DATABASE_URL, process.env.DATABASE_URL_APP]).toEqual([
    TEST,
    TEST,
  ]);
  expect(requestPoolConfig(process.env.DATABASE_URL).connectionString).toBe(
    TEST
  );
  expect(() => assertSafeTestDatabase()).not.toThrow();
});

it("si después DATABASE_URL_APP apunta a una base que no es de test, frena, aunque DATABASE_URL lo sea", () => {
  const { assertSafeTestDatabase } = load({ TEST_DATABASE_URL: TEST });
  process.env.DATABASE_URL_APP = APP;
  expect(() => assertSafeTestDatabase()).toThrow(
    /la URL del pool \(DATABASE_URL_APP, o DATABASE_URL\) no apunta a una base _test/
  );
  expect(() => assertSafeTestDatabase()).toThrow(
    /Valor actual: 127\.0\.0\.1:5432\/proyecto\n/
  );
  expect(() => assertSafeTestDatabase()).not.toThrow(/secreta|app:/);
});

/** El mensaje con que frena la guarda cuando DATABASE_URL_APP es `url`. */
const messageFor = (url: string): string => {
  const { assertSafeTestDatabase } = load({ TEST_DATABASE_URL: TEST });
  process.env.DATABASE_URL_APP = url;
  try {
    assertSafeTestDatabase();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("la guarda no frenó");
};

it.each([
  [
    "una clave con una @ sin codificar",
    "postgresql://app:se@creta@127.0.0.1:5432/proyecto",
    "Valor actual: 127.0.0.1:5432/proyecto\n",
  ],
  [
    "la clave en la query",
    "postgresql://127.0.0.1:5432/proyecto?user=app&password=secreta",
    "Valor actual: 127.0.0.1:5432/proyecto\n",
  ],
  [
    "una URL que no se puede leer",
    "app:secreta en ninguna parte",
    "Valor actual: URL no válida\n",
  ],
  // Una clave sin codificar con una /, un ? o un # que empieza con dígitos: URL la lee como puerto.
  [
    "una clave con una / que URL lee como puerto",
    "postgresql://app:2024/Secreta@db.host:5432/proyecto",
    "Valor actual: URL no válida\n",
  ],
  [
    "una clave con un ? que URL lee como puerto",
    "postgresql://app:12?secreta@db.host/proyecto",
    "Valor actual: URL no válida\n",
  ],
  [
    "una clave con un # que URL lee como puerto",
    "postgresql://app:12#secreta@db.host/proyecto",
    "Valor actual: URL no válida\n",
  ],
  [
    "una clave con una / y un # que URL lee como puerto",
    "postgresql://app:12/a#b@db.host/proyecto",
    "Valor actual: URL no válida\n",
  ],
  // Y con un /.. en el camino: URL lo resuelve y se lleva el pedazo con la @, así que en lo
  // que lee no queda ninguna. Lo frena que lo que se muestra no sigue a la última @.
  [
    "una clave con una / y un camino con /..",
    "postgresql://app:2024/Secreta@db.host/../proyecto",
    "Valor actual: URL no válida\n",
  ],
  // El usuario igual al host (postgres, como el servicio de docker compose) y una clave que
  // empieza con el puerto: lo que URL lee como host (el usuario y el principio de la clave)
  // es también lo que sigue a la última @. Lo frena la @ que quedó en el fragmento o la query.
  [
    "el usuario igual al host y una clave con un # que empieza con el puerto",
    "postgresql://postgres:5432#secreta@postgres:5432/proyecto",
    "Valor actual: URL no válida\n",
  ],
  [
    "el usuario igual al host y una clave con un ? que empieza con el puerto",
    "postgresql://postgres:5432?secreta@postgres:5432/proyecto",
    "Valor actual: URL no válida\n",
  ],
])("el mensaje no muestra la clave: %s", (_case, url, shown) => {
  const message = messageFor(url);
  expect(message).toContain(shown);
  expect(message).not.toMatch(
    /secreta|creta|password|app:|postgres:|2024|:12/i
  );
});

// Una URL que se lee bien muestra su host y su base, aunque la clave tenga una @ (sin
// codificar o codificada) o la query traiga la clave. La primera es de test y la guarda
// la deja pasar: por eso se mira describeUrl, que es lo que arma el mensaje.
it.each([
  [
    "postgresql://app:clave@db.host:5432/proyecto_test",
    "db.host:5432/proyecto_test",
  ],
  ["postgresql://app:p@ss@db.host/proyecto", "db.host/proyecto"],
  ["postgresql://app:p%40ss@db.host/proyecto", "db.host/proyecto"],
  [
    "postgresql://app@127.0.0.1:5432/proyecto?user=app&password=secreta",
    "127.0.0.1:5432/proyecto",
  ],
])("una URL que se lee bien muestra su host y su base: %s", (url, shown) => {
  expect(load({ TEST_DATABASE_URL: TEST }).describeUrl(url)).toBe(shown);
});

it("si DATABASE_URL no es de test, frena", () => {
  const { assertSafeTestDatabase } = load({ TEST_DATABASE_URL: TEST });
  process.env.DATABASE_URL = APP;
  expect(() => assertSafeTestDatabase()).toThrow(
    /DATABASE_URL no apunta a una base _test/
  );
});

it("sin ninguna URL, frena", () => {
  const { assertSafeTestDatabase } = load({ TEST_DATABASE_URL: "" });
  expect(() => assertSafeTestDatabase()).toThrow(
    /No se pudo determinar la base de test/
  );
});
