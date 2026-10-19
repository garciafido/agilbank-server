import { dictaminarExtracto } from "../src/juez/juecesDelExtracto";
import { toPublicReading } from "../src/publicReading";
import type { LecturaGuardada, StatementLine, StatementReading } from "../src/types";
import { resumirDictamen } from "@agilmind/lectura";

const line: StatementLine = {
  id: "r-1",
  order: 1,
  date: "2026-07-01",
  valueDate: null,
  type: { code: "comision", source: "table" },
  amountCents: -1000000,
  balanceCents: 151234560,
  reference: null,
  counterparty: null,
  bank: { code: "500", text: "Com. mantenimiento cuenta", extras: [] },
  chains: true,
  provenance: { origin: "cell", sheet: "H", page: null, pageTo: null, fromRow: 3, toRow: 3 },
};

const reading: StatementReading = {
  fingerprint: "ab",
  verdict: "verified",
  reason: null,
  header: {
    bankCode: "191", bankName: "Banco Credicoop Cooperativo Limitado", account: null, cbu: "1910018600001234567891",
    currency: "Pesos", periodFrom: "2026-07-01", periodTo: "2026-07-31", openingBalanceCents: 52944560, closingBalanceCents: 151234560,
  },
  lines: [line],
  warnings: [{ code: "sin-saldos", detail: "x", blocksProposals: false }],
  checks: {
    direction: "reverse", balanceIs: "after", linesWithBalance: 1, linesThatChain: 1, closesWithOwnBalances: true, closesWithProntoNet: null,
    printedBalances: { openingCents: 52944560, closingCents: 151234560 }, lineBalances: { openingCents: 52944560, closingCents: 151234560 },
  },
};

const withChecks = (checks: Partial<NonNullable<StatementReading["checks"]>>): StatementReading => ({
  ...reading,
  checks: { ...reading.checks!, ...checks },
});

describe("toPublicReading", () => {
  it("dice la lectura con las claves y los valores del contrato", () => {
    const p = toPublicReading(reading);
    expect(p.huella).toBe("ab");
    expect(p.veredicto).toBe("verificada");
    expect(p.motivo).toBeNull();
    expect(p.encabezado).toEqual({
      banco: { codigo: "191", nombre: "Banco Credicoop Cooperativo Limitado" },
      cuenta: null,
      cbu: "1910018600001234567891",
      moneda: "Pesos",
      periodoDesde: "2026-07-01",
      periodoHasta: "2026-07-31",
      saldoInicial: 529445.6,
      saldoFinal: 1512345.6,
    });
    expect(p.renglones[0]).toEqual({
      id: "r-1",
      orden: 1,
      fecha: "2026-07-01",
      fechaValor: null,
      tipo: { codigo: "comision", segun: "tabla" },
      importe: -10000,
      saldo: 1512345.6,
      referencia: null,
      contraparte: null,
      delBanco: { codigo: "500", texto: "Com. mantenimiento cuenta", complementos: [] },
      encadena: true,
      procedencia: { origen: "celda", hoja: "H", pagina: null, paginaHasta: null, filaDesde: 3, filaHasta: 3 },
    });
    expect(p.avisos[0]).toEqual({ codigo: "sin-saldos", detalle: "x", frenaPropuestas: false });
    expect(p.controles).toEqual({
      sentido: "inverso",
      saldoDeLaFila: "despues",
      renglonesConSaldo: 1,
      renglonesQueEncadenan: 1,
      cierraConSusSaldos: true,
      cierraConProntoNet: null,
    });
  });

  it("traduce cada veredicto", () => {
    expect(toPublicReading({ ...reading, verdict: "weak" }).veredicto).toBe("a-revisar");
    expect(toPublicReading({ ...reading, verdict: "abstained" }).veredicto).toBe("sin-lectura");
    expect(toPublicReading({ ...reading, verdict: "unavailable" }).veredicto).toBe("no-disponible");
  });

  it("traduce el origen, de dónde salió el tipo y el sentido", () => {
    const source = (s: StatementLine["type"]["source"]) => toPublicReading({ ...reading, lines: [{ ...line, type: { code: "x", source: s } }] }).renglones[0].tipo.segun;
    expect([source("company"), source("table"), source("rule"), source("none")]).toEqual(["empresa", "tabla", "regla", "ninguna"]);
    const text = toPublicReading({ ...reading, lines: [{ ...line, provenance: { origin: "text", sheet: null, page: null, pageTo: null, fromRow: 2, toRow: 3 } }] }).renglones[0];
    expect(text.procedencia).toEqual({ origen: "texto", hoja: null, pagina: null, paginaHasta: null, filaDesde: 2, filaHasta: 3 });
    expect(toPublicReading(withChecks({ direction: "chronological", balanceIs: "before" })).controles).toMatchObject({ sentido: "cronologico", saldoDeLaFila: "antes" });
  });

  const lecturaCon = (over: Partial<StatementLine>): StatementReading => ({ ...reading, lines: [{ ...line, ...over }] });

  it("la procedencia de un renglón leído de un PDF dice el origen, la página y las líneas", () => {
    const r = lecturaCon({ provenance: { origin: "pdf", sheet: null, page: 3, pageTo: 4, fromRow: 41, toRow: 2 } });
    expect(toPublicReading(r).renglones[0].procedencia).toEqual({ origen: "pdf", hoja: null, pagina: 3, paginaHasta: 4, filaDesde: 41, filaHasta: 2 });
  });

  it("la de un renglón leído por OCR dice ocr", () => {
    const r = lecturaCon({ provenance: { origin: "ocr", sheet: null, page: 1, pageTo: 1, fromRow: 7, toRow: 8 } });
    expect(toPublicReading(r).renglones[0].procedencia.origen).toBe("ocr");
  });

  it("los saldos null siguen null, y el cero es cero", () => {
    const p = toPublicReading({
      ...reading,
      header: { ...reading.header!, openingBalanceCents: null, closingBalanceCents: 0 },
      lines: [{ ...line, balanceCents: null, amountCents: 0 }],
    });
    expect(p.encabezado).toMatchObject({ saldoInicial: null, saldoFinal: 0 });
    expect(p.renglones[0]).toMatchObject({ saldo: null, importe: 0 });
  });

  describe("la lectura parcial", () => {
    const parcial: StatementReading = {
      ...reading,
      verdict: "weak",
      warnings: [{ code: "lectura-parcial", detail: "Se leyeron 1 de 2 páginas.", blocksProposals: true, data: { paginas: 2, paginasLeidas: 1, causa: "paginas" } }],
      checks: { ...reading.checks!, direction: "chronological" },
    };

    it("no publica el fin del período: es la fecha del último renglón leído, no la del extracto", () => {
      expect(toPublicReading(parcial).encabezado).toEqual({ ...toPublicReading(reading).encabezado, periodoHasta: null });
    });

    it("nada más cambia: el inicio del período, los saldos, los renglones, los avisos y los controles salen igual", () => {
      const completa = toPublicReading({ ...parcial, warnings: [] });
      const p = toPublicReading(parcial);
      expect(p.encabezado).toEqual({ ...completa.encabezado, periodoHasta: null });
      expect(p.encabezado!.periodoDesde).toBe("2026-07-01");
      expect(p.encabezado!.saldoInicial).toBe(529445.6);
      expect(p.renglones).toEqual(completa.renglones);
      expect(p.controles).toEqual({ ...completa.controles, cierraConSusSaldos: null, cierraConProntoNet: null });
      expect(p.avisos.map((a) => a.codigo)).toEqual(["lectura-parcial"]);
    });

    it("tampoco publica si cierra con sus saldos, ni cuando no cierra: la punta que no se vio no se afirma", () => {
      expect(toPublicReading(parcial).controles!.cierraConSusSaldos).toBeNull();
      expect(toPublicReading({ ...parcial, checks: { ...parcial.checks!, closesWithOwnBalances: false } }).controles!.cierraConSusSaldos).toBeNull();
      expect(toPublicReading({ ...parcial, checks: { ...parcial.checks!, closesWithOwnBalances: false } }).controles).toMatchObject({ cierraConProntoNet: null, renglonesConSaldo: 1 });
    });

    it("tampoco publica si cierra con ProntoNet: el juez deja esos saldos sin juzgar", () => {
      for (const cierra of [true, false]) {
        expect(toPublicReading({ ...parcial, checks: { ...parcial.checks!, closesWithProntoNet: cierra } }).controles!.cierraConProntoNet).toBeNull();
        expect(toPublicReading({ ...reading, checks: { ...reading.checks!, closesWithProntoNet: cierra } }).controles!.cierraConProntoNet).toBe(cierra);
      }
    });

    describe("el saldo final", () => {
      const conImpresos = (printed: { openingCents: number | null; closingCents: number | null }, over: Partial<StatementReading> = {}): StatementReading => ({
        ...parcial, ...over, checks: { ...parcial.checks!, printedBalances: printed },
      });

      it("si sale de un saldo de renglón, que es el último leído y no el del extracto, no se publica", () => {
        expect(toPublicReading(conImpresos({ openingCents: null, closingCents: null })).encabezado!.saldoFinal).toBeNull();
        expect(toPublicReading(conImpresos({ openingCents: 52944560, closingCents: null })).encabezado!.saldoFinal).toBeNull();
      });

      it("si es un saldo final impreso y leído, con su rótulo, se conserva", () => {
        expect(toPublicReading(conImpresos({ openingCents: null, closingCents: 151234560 })).encabezado!.saldoFinal).toBe(1512345.6);
      });

      it("el cero impreso también se conserva", () => {
        const r = conImpresos({ openingCents: null, closingCents: 0 }, { header: { ...reading.header!, closingBalanceCents: 0 } });
        expect(toPublicReading(r).encabezado!.saldoFinal).toBe(0);
      });

      it("el saldo inicial no cambia, salga de donde salga", () => {
        expect(toPublicReading(conImpresos({ openingCents: null, closingCents: null })).encabezado!.saldoInicial).toBe(529445.6);
      });

      it("sin el aviso, un saldo final que sale de un saldo de renglón se publica", () => {
        const r = { ...reading, checks: { ...reading.checks!, printedBalances: { openingCents: null, closingCents: null } } };
        expect(toPublicReading(r).encabezado!.saldoFinal).toBe(1512345.6);
      });

      it("sin los controles no se sabe de dónde sale: no se publica", () => {
        expect(toPublicReading({ ...parcial, checks: null }).encabezado!.saldoFinal).toBeNull();
        expect(toPublicReading({ ...reading, checks: null }).encabezado!.saldoFinal).toBe(1512345.6);
      });

      it("un saldo final que ya era null sigue null", () => {
        const r = conImpresos({ openingCents: null, closingCents: null }, { header: { ...reading.header!, closingBalanceCents: null } });
        expect(toPublicReading(r).encabezado!.saldoFinal).toBeNull();
      });
    });

    it("sin el aviso, cierraConSusSaldos se publica", () => {
      expect(toPublicReading(reading).controles!.cierraConSusSaldos).toBe(true);
      expect(toPublicReading({ ...reading, checks: { ...reading.checks!, closesWithOwnBalances: false } }).controles!.cierraConSusSaldos).toBe(false);
    });

    it("el encabezado interno no se toca: la conciliación y la comparación con ProntoNet usan el fin del período", () => {
      toPublicReading(parcial);
      expect(parcial.header!.periodTo).toBe("2026-07-31");
    });

    it("con otros avisos y sin el de lectura parcial, el fin del período se publica", () => {
      expect(toPublicReading(reading).encabezado!.periodoHasta).toBe("2026-07-31");
      expect(toPublicReading({ ...reading, warnings: [{ code: "no-cierra", detail: "x", blocksProposals: true }] }).encabezado!.periodoHasta).toBe("2026-07-31");
    });

    it("con el aviso entre otros, también", () => {
      const avisos = [{ code: "sin-saldos" as const, detail: "x", blocksProposals: false }, ...parcial.warnings];
      expect(toPublicReading({ ...parcial, warnings: avisos }).encabezado!.periodoHasta).toBeNull();
    });
  });

  describe("la lectura parcial de un extracto inverso", () => {
    // Lo más nuevo va arriba y el PDF se lee desde la página 1: las páginas que faltan son las más viejas.
    const renglon = (order: number, amountCents: number, balanceCents: number, date: string): StatementLine => ({ ...line, id: `L${order}`, order, date, amountCents, balanceCents });
    const inverso: StatementReading = {
      ...reading,
      verdict: "weak",
      header: { ...reading.header!, periodFrom: "2026-07-20", periodTo: "2026-07-31", openingBalanceCents: 280000, closingBalanceCents: 300000 },
      lines: [renglon(1, 10000, 300000, "2026-07-31"), renglon(2, 10000, 290000, "2026-07-20")],
      warnings: [{ code: "lectura-parcial", detail: "corte", blocksProposals: true, data: { paginas: 70, paginasLeidas: 60, causa: "paginas" } }],
      checks: {
        ...reading.checks!, direction: "reverse", linesWithBalance: 2,
        printedBalances: { openingCents: null, closingCents: null }, lineBalances: { openingCents: 280000, closingCents: 300000 },
      },
    };
    const conImpresos = (printed: { openingCents: number | null; closingCents: number | null }): StatementReading => ({ ...inverso, checks: { ...inverso.checks!, printedBalances: printed } });

    it("no publica el inicio del período ni un saldo inicial sacado de un renglón: son los del renglón más viejo leído", () => {
      expect(toPublicReading(inverso).encabezado).toMatchObject({ periodoDesde: null, saldoInicial: null });
    });

    it("el fin del período y el saldo final están arriba, en lo que se leyó: se publican", () => {
      expect(toPublicReading(inverso).encabezado).toMatchObject({ periodoHasta: "2026-07-31", saldoFinal: 3000 });
    });

    it("un saldo inicial impreso y leído se conserva, aunque sea cero", () => {
      expect(toPublicReading(conImpresos({ openingCents: 280000, closingCents: null })).encabezado!.saldoInicial).toBe(2800);
      const cero = { ...conImpresos({ openingCents: 0, closingCents: null }), header: { ...inverso.header!, openingBalanceCents: 0 } };
      expect(toPublicReading(cero).encabezado!.saldoInicial).toBe(0);
    });

    it("los cierres se callan igual que en el cronológico", () => {
      expect(toPublicReading({ ...inverso, checks: { ...inverso.checks!, closesWithProntoNet: true } }).controles).toMatchObject({ sentido: "inverso", cierraConSusSaldos: null, cierraConProntoNet: null });
    });

    it("sin el aviso, se publican las dos puntas", () => {
      expect(toPublicReading({ ...inverso, warnings: [] }).encabezado).toMatchObject({ periodoDesde: "2026-07-20", periodoHasta: "2026-07-31", saldoInicial: 2800, saldoFinal: 3000 });
    });
  });

  describe("sin lectura y no disponible", () => {
    const conMotivo: StatementReading = { ...reading, verdict: "abstained", reason: "No se encontró una tabla." };

    it.each(["abstained", "unavailable"] as const)("%s: encabezado y controles null, renglones vacío, aunque la lectura los traiga", (verdict) => {
      const p = toPublicReading({ ...conMotivo, verdict });
      expect(p.encabezado).toBeNull();
      expect(p.controles).toBeNull();
      expect(p.renglones).toEqual([]);
      expect(p.motivo).toBe("No se encontró una tabla.");
      expect(p.huella).toBe("ab");
    });

    it("la que sale del motor viene con todo vacío y se dice igual", () => {
      const p = toPublicReading({ fingerprint: "cd", verdict: "abstained", reason: "m", header: null, lines: [], warnings: [], checks: null });
      expect(p).toEqual({ huella: "cd", veredicto: "sin-lectura", motivo: "m", encabezado: null, renglones: [], avisos: [], controles: null });
    });

    it("una lectura a revisar sí trae el encabezado, los renglones y los controles", () => {
      const p = toPublicReading({ ...reading, verdict: "weak" });
      expect(p.encabezado).not.toBeNull();
      expect(p.controles).not.toBeNull();
      expect(p.renglones).toHaveLength(1);
    });
  });

  describe("los null del contrato", () => {
    it("saldoDeLaFila es null cuando el archivo no trae saldos", () => {
      expect(toPublicReading(withChecks({ balanceIs: null, linesWithBalance: 0, linesThatChain: 0 })).controles?.saldoDeLaFila).toBeNull();
    });

    it("saldoDeLaFila es null aunque el juez haya quedado con un sentido, si ningún renglón tiene saldo", () => {
      expect(toPublicReading(withChecks({ balanceIs: "after", linesWithBalance: 0, linesThatChain: 0 })).controles?.saldoDeLaFila).toBeNull();
    });

    it("saldoDeLaFila se dice cuando hay un solo renglón con saldo", () => {
      expect(toPublicReading(withChecks({ balanceIs: "before", linesWithBalance: 1 })).controles?.saldoDeLaFila).toBe("antes");
    });

    it("contraparte es null sin CUIT ni CBU, y viene con el que tenga", () => {
      const of = (counterparty: StatementLine["counterparty"]) => toPublicReading({ ...reading, lines: [{ ...line, counterparty }] }).renglones[0].contraparte;
      expect(of(null)).toBeNull();
      expect(of({ cuit: null, name: "ACME", cbu: null })).toBeNull();
      expect(of({ cuit: "30123456781", name: null, cbu: null })).toEqual({ cuit: "30123456781", nombre: null, cbu: null });
      expect(of({ cuit: null, name: null, cbu: "0140007600009876543219" })).toEqual({ cuit: null, nombre: null, cbu: "0140007600009876543219" });
    });

    it("el primer renglón con saldo y sin saldo inicial impreso es el punto de partida: encadena null, y uno menos que los que tienen saldo", () => {
      const p = toPublicReading({
        ...reading,
        lines: [
          { ...line, id: "r-1", order: 1, chains: true },
          { ...line, id: "r-2", order: 2, chains: true },
          { ...line, id: "r-3", order: 3, chains: null },
        ],
        checks: { ...reading.checks!, linesWithBalance: 3, linesThatChain: 2 },
      });
      expect(p.renglones.map((r) => r.encadena)).toEqual([true, true, null]);
      expect(p.controles).toMatchObject({ renglonesConSaldo: 3, renglonesQueEncadenan: 2 });
    });
  });

  describe("avisos", () => {
    it("trae los renglones y los datos solo cuando el aviso los tiene", () => {
      const p = toPublicReading({
        ...reading,
        warnings: [
          { code: "no-encadena", detail: "d", blocksProposals: false, lines: [2, 3] },
          { code: "varias-cuentas", detail: "e", blocksProposals: true, data: { cuentas: "a, b" } },
          { code: "no-cierra", detail: "f", blocksProposals: true },
        ],
      });
      expect(p.avisos).toEqual([
        { codigo: "no-encadena", detalle: "d", frenaPropuestas: false, renglones: [2, 3] },
        { codigo: "varias-cuentas", detalle: "e", frenaPropuestas: true, datos: { cuentas: "a, b" } },
        { codigo: "no-cierra", detalle: "f", frenaPropuestas: true },
      ]);
      expect(Object.keys(p.avisos[2])).toEqual(["codigo", "detalle", "frenaPropuestas"]);
    });
  });

  describe("no comparte nada con la lectura del motor", () => {
    it("los renglones y los datos de un aviso son copias: cambiar el de adentro no cambia el público", () => {
      const internal: StatementReading = {
        ...reading,
        warnings: [{ code: "varias-cuentas", detail: "e", blocksProposals: true, lines: [1, 2], data: { cuentas: "a, b" } }],
      };
      const p = toPublicReading(internal);
      internal.warnings[0].lines!.push(3);
      internal.warnings[0].data!.cuentas = "otra";
      internal.warnings[0].data!.nueva = 1;
      expect(p.avisos[0].renglones).toEqual([1, 2]);
      expect(p.avisos[0].datos).toEqual({ cuentas: "a, b" });
    });

    it("los complementos del banco también son una copia", () => {
      const internal: StatementReading = { ...reading, lines: [{ ...line, bank: { ...line.bank, extras: ["x"] } }] };
      const p = toPublicReading(internal);
      internal.lines[0].bank.extras.push("y");
      expect(p.renglones[0].delBanco.complementos).toEqual(["x"]);
    });
  });

  describe("no expone nada que no sea del contrato", () => {
    it("lo que la lectura lleve de más, en cualquier nivel, no sale", () => {
      const sucio = {
        ...reading,
        secreto: 1,
        header: { ...reading.header!, interno: 2 },
        lines: [{ ...line, interno: 3, type: { ...line.type, interno: 4 }, bank: { ...line.bank, interno: 5 }, provenance: { ...line.provenance, interno: 6 } }],
        warnings: [{ code: "sin-saldos", detail: "x", blocksProposals: false, interno: 7 }],
        checks: { ...reading.checks!, interno: 8 },
      } as unknown as StatementReading;
      const p = toPublicReading(sucio);
      expect(Object.keys(p)).toEqual(["huella", "veredicto", "motivo", "encabezado", "renglones", "avisos", "controles"]);
      expect(Object.keys(p.encabezado!)).toEqual(["banco", "cuenta", "cbu", "moneda", "periodoDesde", "periodoHasta", "saldoInicial", "saldoFinal"]);
      expect(Object.keys(p.renglones[0])).toEqual([
        "id", "orden", "fecha", "fechaValor", "tipo", "importe", "saldo", "referencia", "contraparte", "delBanco", "encadena", "procedencia",
      ]);
      expect(Object.keys(p.renglones[0].tipo)).toEqual(["codigo", "segun"]);
      expect(Object.keys(p.renglones[0].delBanco)).toEqual(["codigo", "texto", "complementos"]);
      expect(Object.keys(p.renglones[0].procedencia)).toEqual(["origen", "hoja", "pagina", "paginaHasta", "filaDesde", "filaHasta"]);
      expect(Object.keys(p.avisos[0])).toEqual(["codigo", "detalle", "frenaPropuestas"]);
      expect(Object.keys(p.controles!)).toEqual([
        "sentido", "saldoDeLaFila", "renglonesConSaldo", "renglonesQueEncadenan", "cierraConSusSaldos", "cierraConProntoNet",
      ]);
      expect(JSON.stringify(p)).not.toMatch(/interno|secreto/);
    });

    it("el dictamen guardado junto a la lectura no se publica", () => {
      const dictamen = dictaminarExtracto(reading);
      expect(toPublicReading({ ...reading, dictamen } as never)).toEqual(toPublicReading(reading));
      expect(JSON.stringify(toPublicReading({ ...reading, dictamen } as never))).not.toMatch(/dictamen|sospechosos|parteMasDebil/);
    });

    it("la lectura como se guarda, con el dictamen resumido o con su falla, publica lo mismo que la lectura", () => {
      const conResumen: LecturaGuardada = { ...reading, dictamen: resumirDictamen(dictaminarExtracto(reading)) };
      const conFalla: LecturaGuardada = { ...reading, dictamen: null, dictamenFallo: "juez roto" };
      for (const guardada of [conResumen, conFalla]) {
        expect(toPublicReading(guardada)).toEqual(toPublicReading(reading));
        expect(JSON.stringify(toPublicReading(guardada))).not.toMatch(/dictamen|cierran|juez roto/);
      }
    });

    it("el JSON de una lectura no tiene claves undefined ni nombres del motor", () => {
      const json = JSON.stringify(toPublicReading(reading));
      expect(json).not.toMatch(/fingerprint|verdict|amountCents|balanceCents|provenance|counterparty|blocksProposals|linesWithBalance/);
    });
  });
});
