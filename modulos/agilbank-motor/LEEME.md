# agilbank-motor

El motor de AgilBank (Pronto IEB): lee un extracto bancario tal como lo entrega el banco y lo lleva
al resumen bancario canónico, con sus controles. Lo reciben agilbank-server y AgilErp como módulo,
en `modulos/agilbank-motor`.

- Spec: `agilpost-motor/docs/superpowers/specs/2026-10-09-agilbank-lectura-design.md`.
- Planes: `agilpost-motor/docs/superpowers/plans/2026-10-*-agilbank-*.md`.
- `npm test`: la suite, sin E/S.
- `npm run test:mutation`: Stryker, con el portón en `break: 80` (spec §6). Al 14-10-2026 mata el
  96,58 % de los mutantes en todo `src`. La lectura: columns 95,58 · rows 93,40 · judge 97,06 ·
  identity 90,32 · counterparty 97,83 · classify 96,54 · header 91,11 · checks 94,58 · readStatement
  91,57; en la lectura de archivos y de valores, values 99,59 · catalog 100 · text 98,80 ·
  spreadsheet 97,04 · format 96,08. La API: http 98,04 · multipart 96,96 · statements 99,40 ·
  corrections 97,79 · routes 100 · backgroundReading 98,26. La corrida entera tarda unos 45
  minutos; un archivo solo, `npx stryker run --mutate src/<archivo>.ts`. Stryker no arranca con Node
  18.16.1 (falla al cargar `execa`); con Node 22 corre.
- `npm run bench`: el banco de medición sobre los extractos de BDL. Lee de
  `AB_IEB_DIR` (por defecto la entrega de BDL en el Warehouse) y falla si no la encuentra.
- `npm run inventory`: los conceptos de los extractos que todavía no están en la tabla.
- Las tablas del canónico están en `src/catalog/`. Se publican como anexo del contrato
  (`docs/contrato/`).

## La API

El motor trae la API de lectura que consume ProntoNet; el producto solo la conecta. Exporta cuatro
cosas:

- `agilbankRoutes(transport, pieces)`: devuelve el router de express con las rutas del contrato:
  `POST /v1/extractos`, `GET /v1/extractos/:idExtracto`, `GET /v1/extractos/por-huella/:huella` y
  `POST /v1/correcciones`. Se monta bajo `/api`. El `transport` es `{ Router, json }` de express.
- `readStatementStage`: el paso `read` del pipeline `AbStatementRead`. Baja el archivo, lo lee con
  las correcciones de la empresa y guarda la lectura.
- `configureBackgroundReading({ storage })`: le dice al paso de dónde bajar el archivo.
- `markStatementFailed`: el manejador de reintentos agotados. Marca el extracto `failed`.

Las cuatro piezas que pasa el producto en `agilbankRoutes`:

- `db`: el cliente de Prisma, con la empresa filtrada por el motor en cada consulta.
- `authorizeClient(token, ámbito)`: devuelve el sistema cliente (empresa y usuario de servicio) o
  tira `AmbitoInsuficienteError` o `SistemaClienteNoAutorizadoError`.
- `storage()`: el proveedor de almacenamiento, con `uploadStream`.
- `enqueueReading(idExtracto, autorId, empresaId)`: crea el evento y publica en la cola, en la misma
  transacción.

Y las dos líneas de `src/workers/projectBootstrap.ts`:

```ts
configureBackgroundReading({ storage: getStorageProvider });
deadLetterHandlers["AbStatementRead"] = markStatementFailed as never;
```

Los ámbitos de la credencial son `ab:leer` (enviar y consultar extractos) y `ab:corregir`
(correcciones). Se comparan exactos. Una credencial sin empresa no pasa, y para enviar o corregir
tiene que traer usuario de servicio.

La referencia para BDL es `agilbank-server/docs/api-agilbank.html`.
