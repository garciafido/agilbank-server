import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "**/__tests__/**/*.test.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        // Transpila por archivo sin type-check completo: el gate de tipos es 'tsc'
        // (npm run typecheck / build), no el test runner. Evita falsos positivos del
        // chequeo aislado de ts-jest sobre tipos generados (Prisma JSON, etc.).
        isolatedModules: true,
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  globalSetup: "<rootDir>/jest.global-setup.ts",
  globalTeardown: "<rootDir>/jest.global-teardown.ts",
  testTimeout: 30000,
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  coveragePathIgnorePatterns: ["/node_modules/", "/dist/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
