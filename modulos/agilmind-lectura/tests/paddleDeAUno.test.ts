// PP-OCR lee de a una página por proceso, aunque le pidan varias a la vez.
let enCurso = 0;
let maximo = 0;
jest.mock("@gutenye/ocr-node", () => ({
  default: {
    create: async () => ({
      detect: async () => {
        enCurso++;
        maximo = Math.max(maximo, enCurso);
        await new Promise((r) => setTimeout(r, 30));
        enCurso--;
        return [];
      },
    }),
  },
}));

import { runPaddleOcr } from "../src/paddleOcr";

describe("PP-OCR de a una página", () => {
  it("las lecturas pedidas a la vez pasan de a una", async () => {
    const aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
    await Promise.all([1, 2, 3, 4].map(() => runPaddleOcr(Buffer.from("png"))));
    expect(maximo).toBe(1);
    aviso.mockRestore();
  });

  it("una lectura que falla no traba a las que siguen", async () => {
    const aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
    const resultados = await Promise.all([runPaddleOcr(Buffer.from("png")), runPaddleOcr(Buffer.from("png"))]);
    expect(resultados).toEqual([null, null]);
    aviso.mockRestore();
  });
});
