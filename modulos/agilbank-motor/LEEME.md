# agilbank-motor

El motor de AgilBank (Pronto IEB): lee un extracto bancario tal como lo entrega el banco y lo lleva
al resumen bancario canónico, con sus controles. Lo reciben agilbank-server y AgilErp como módulo,
en `modulos/agilbank-motor`.

- Spec: `agilpost-motor/docs/superpowers/specs/2026-10-09-agilbank-lectura-design.md`.
- Planes: `agilpost-motor/docs/superpowers/plans/2026-10-*-agilbank-*.md`.
- `npm test`: la suite, sin E/S.
- `npm run test:mutation`: Stryker, con el portón en `break: 80` (spec §6). Al 10-10-2026 mata el
  95,38 % de los mutantes en todo `src` y el 95,14 % en la lógica pura (columns 95,18 · rows 91,51 ·
  judge 95,88 · identity 88,71 · counterparty 97,83 · classify 96,54); en la lectura de archivos y de
  valores, values 99,59 · catalog 100 · text 98,66 · spreadsheet 94,30. La corrida entera tarda unos
  25 minutos; un archivo solo, `npx stryker run --mutate src/<archivo>.ts`.
- `npm run bench`: el banco de medición sobre los extractos de BDL. Lee de
  `AB_IEB_DIR` (por defecto la entrega de BDL en el Warehouse) y falla si no la encuentra.
- `npm run inventory`: los conceptos de los extractos que todavía no están en la tabla.
- Las tablas del canónico están en `src/catalog/`. Se publican como anexo del contrato
  (`docs/contrato/`).
