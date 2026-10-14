# agilbank-motor

El motor de AgilBank (Pronto IEB): lee un extracto bancario tal como lo entrega el banco y lo lleva
al resumen bancario canónico, con sus controles. Lo reciben agilbank-server y AgilErp como módulo,
en `modulos/agilbank-motor`.

- Spec de la API: `docs/superpowers/specs/2026-10-13-agilbank-api-de-lectura-design.md` (este repo).
- Spec de la lectura: `agilpost-motor/docs/superpowers/specs/2026-10-09-agilbank-lectura-design.md`.
- Planes: `docs/superpowers/plans/` (la API) y `agilpost-motor/docs/superpowers/plans/2026-10-*-agilbank-*.md`.
- `npm test`: la suite, sin E/S.
- `npm run test:mutation`: Stryker, con el portón en `break: 80` (spec §6). Al 14-10-2026 mata el
  96,54 % de los mutantes en todo `src`. La lectura: columns 95,38 · rows 93,40 · judge 96,47 ·
  identity 90,32 · counterparty 97,83 · classify 96,58 · header 88,15 · checks 94,58 · readStatement
  92,77 · publicReading 98,81; en la lectura de archivos y de valores, values 99,59 · catalog 100 ·
  text 98,80 · spreadsheet 96,71 · format 100. La API: http 98,04 · multipart 96,62 · statements
  99,54 · corrections 97,33 · routes 100 · backgroundReading 98,61. La corrida entera tarda unos 45
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
  las correcciones de la empresa y guarda la lectura. No toca un extracto ya leído: un trabajo
  tardío sobre él devuelve `read` sin leer. Cuenta en `readStarts` los arranques que no terminaron
  en error (un archivo que tumba al worker no tira error: el evento vence y se vuelve a tomar); con
  tres, lo marca `failed` sin leer, con la causa «La lectura se interrumpió tres veces.».
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
deadLetterHandlers["AbStatementRead"] = markStatementFailed;
```

Cómo sale un extracto de `en-proceso`: el paso lo deja `read`; un error deja `queued` y el worker
reintenta; al agotarse, `markStatementFailed` lo pone `failed`. Si el trabajo se pierde (un reinicio
entre el alta y la cola, un mensaje descartado), el extracto queda `queued` o `processing` sin
cambios: el reenvío del mismo archivo lo vuelve a leer cuando pasaron más de `STALE_AFTER_MINUTES`
(30) desde su último cambio. Por eso toda escritura del extracto deja `lastUpdatedAt_` y una
`version_` nueva. El reenvío de uno terminado (`failed`, o `read` con `unavailable`) vuelve
`readStarts` a cero; el de uno en proceso perdido lo conserva.

Los ámbitos de la credencial son `ab:leer` (enviar y consultar extractos) y `ab:corregir`
(correcciones). Se comparan exactos. Una credencial sin empresa no pasa, y para enviar o corregir
tiene que traer usuario de servicio.

La referencia para BDL es `agilbank-server/docs/api-agilbank.html`.
