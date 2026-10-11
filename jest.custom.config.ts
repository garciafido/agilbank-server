import type { Config } from "@jest/types";

/**
 * Suite del PROYECTO — el loop rápido.
 *
 * **Este archivo es tuyo.** El generador lo emite una sola vez, con contenido
 * idéntico en cada corrida, para que el merge base→develop conserve lo que le
 * agregues. Toqueteálo sin miedo.
 *
 *   npx jest -c jest.custom.config.ts
 *
 * Existe separado del `jest.config.ts` generado por dos razones concretas:
 *
 *   1. `jest.config.ts` ES un archivo generado: modificarlo produce conflicto
 *      en cada regeneración.
 *   2. Su `globalSetup` corre `prisma db push`, que **destruye la base de
 *      test**. La mayoría de los tests de dominio son aritmética y reglas: no
 *      hay motivo para pagar ese costo ni ese riesgo en cada corrida.
 *
 * Levanta las dos mitades: lo que escribe el proyecto (`tests/custom/`) y lo
 * que emite el generador (`tests/generated/`). Nunca edites la segunda: se
 * reescribe entera en cada regeneración.
 */
const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "<rootDir>/tests/custom/**/*.test.ts",
    "<rootDir>/tests/generated/**/*.test.ts",
  ],
  testPathIgnorePatterns: ["/node_modules/"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      { tsconfig: "tsconfig.json", isolatedModules: true },
    ],
  },
  setupFiles: [
    "<rootDir>/tests/support/jest.setup.ts",
    // Apunta DATABASE_URL a la base de test ANTES de que se construya el pool.
    // No lo saques: es lo único que impide que una suite que limpia tablas
    // apunte a la base de desarrollo.
    "<rootDir>/tests/support/testDatabase.ts",
  ],
  // En serie por default: varias suites comparten la misma base y pueden mutar
  // filas de código único. En paralelo se pisan, y el fallo aparece en un
  // archivo que no tiene la culpa. Subilo cuando sepas que no aplica.
  maxWorkers: 1,
  testTimeout: 30000,
  clearMocks: true,
  // El pool de prisma queda abierto tras el último test; sin esto jest avisa y
  // cuelga un segundo. El cierre real lo hace `$disconnect` en cada suite.
  forceExit: true,
  collectCoverage: false,
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};

export default config;
