/** Los tests que corren PP-OCR: lentos, con modelos. Fuera de `npm test` y de la mutación. */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
  testTimeout: 180000,
  // Ver el archivo: el OCR corre en el contexto de Node, no en el de jest.
  moduleNameMapper: { "^@gutenye/ocr-node$": "<rootDir>/tests/integration/ocrNodeNativo.js" },
};
