import * as fs from "fs";
import { readBatch } from "../../src/reconcile/batch";

// El archivo real de BDL: la prueba solo cuenta, no imprime ni guarda nada del archivo.
const FILE = "/Volumes/Warehouse/agilerp-datasets/AgilBank/entregas-bdl/2026-10-08-ieb/Ejemplos Extractos/71140 - descarga_pagos (2).csv";
const maybe = fs.existsSync(FILE) ? it : it.skip;

maybe("el archivo de pagos de BDL: 63 transferencias, una con error", () => {
  const r = readBatch(fs.readFileSync(FILE));
  expect(r.ok && r.transfers.length).toBe(63);
  expect(r.ok && r.transfers.filter((t) => t.failed).length).toBe(1);
});
