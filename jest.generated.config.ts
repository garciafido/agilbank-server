import type { Config } from "@jest/types";

// GENERADO POR HAIKU — no editar.
// Los tests de tests/generated/ no tocan la base: no hay globalSetup a propósito.
const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/generated/**/*.test.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      { tsconfig: "tsconfig.json", isolatedModules: true },
    ],
  },
  setupFiles: ["reflect-metadata"],
  testTimeout: 30000,
  clearMocks: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
