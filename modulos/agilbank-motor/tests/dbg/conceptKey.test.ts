import { conceptKey } from "../../src/dbg/conceptKey";
it("banco, código y texto normalizado sin números: dos renglones del mismo concepto con distinta fecha en el texto dan la misma clave", () => {
  const l = (text: string, code: string | null = null) => ({ bank: { code, text, extras: [] } });
  expect(conceptKey("191", l("Com. Mant. Cta 06/2026", "COM1"))).toBe("191|COM1|com mant cta");
  expect(conceptKey("191", l("Com. Mant. Cta 07/2026", "COM1"))).toBe("191|COM1|com mant cta");
  expect(conceptKey(null, l("IVA 21%"))).toBe("||iva");
});
