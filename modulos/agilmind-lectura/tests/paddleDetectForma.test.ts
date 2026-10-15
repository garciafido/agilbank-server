// Una forma de detect() que no es la lista de líneas no es una página en blanco.
jest.mock("@gutenye/ocr-node", () => ({
  default: {
    create: async () => ({
      detect: async () => ({ texts: [{ text: "FACTURA", box: [[0, 0], [10, 0], [10, 5], [0, 5]] }], resizedImageWidth: 960, resizedImageHeight: 1280 }),
    }),
  },
}));

import { runPaddleOcr } from "../src/paddleOcr";

describe("runPaddleOcr ante otra forma de detect()", () => {
  it("avisa que la versión no es la esperada y no lee", async () => {
    const aviso = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(await runPaddleOcr(Buffer.from("png"))).toBeNull();
    const dichos = aviso.mock.calls.map((c) => String(c[0]));
    expect(dichos.some((d) => /no devolvió la lista de líneas/.test(d))).toBe(true);
    expect(dichos.some((d) => /no encontró texto/.test(d))).toBe(false);
    aviso.mockRestore();
  });
});
