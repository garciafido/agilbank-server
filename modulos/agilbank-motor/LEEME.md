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
  `POST /v1/correcciones`, y las del apareo (abajo): `POST /v1/extractos/:idExtracto/conciliacion`,
  `GET /v1/conciliaciones/:idConciliacion` y `POST /v1/lotes`, y la de las decisiones,
  `POST /v1/decisiones`. Se monta bajo `/api`. El `transport`
  es `{ Router, json }` de express.
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

Los ámbitos de la credencial son `ab:leer` (enviar y consultar extractos), `ab:corregir`
(correcciones), `ab:conciliar` (las tres rutas del apareo) y `ab:decidir` (las decisiones). Se
comparan exactos. Una credencial sin empresa no pasa, y para enviar, corregir, conciliar, subir un lote
o informar decisiones tiene que traer usuario de servicio; las consultas no lo piden.

La referencia para BDL es `agilbank-server/docs/api-agilbank.html`.

## El apareo

`reconcile` (`src/reconcile/`) es una función pura: toma los renglones de una lectura y los valores
pendientes de ProntoNet, y devuelve una propuesta por renglón: `apareo` (con los valores que le
corresponden), `a-revisar` (con sus candidatos) o `pendiente`. Va de lo más firme a lo más débil:
número e importe, importe único en la ventana, contraparte, intercambiables, un renglón contra varios
valores, varios renglones contra un valor, e importe único en el período. La traducción del contrato
(en castellano) a los nombres del motor está solo en `src/reconcile/request.ts` (entrada) y
`src/reconcile/publicReconciliation.ts` (salida). Las rutas están en `src/api/reconciliations.ts`. La
referencia para BDL, con las reglas en llano, es `agilbank-server/docs/api-agilbank.html`
(secciones 08 a 12); el diseño, `docs/superpowers/specs/2026-10-15-agilbank-apareo-design.md`.

- `npm run bench:apareo`: el banco del apareo. Lee el extracto de cada caso de BDL (`AB_IEB_DIR`),
  concilia con sus datos y compara por conjunto: cobertura de los valores que el usuario concilió,
  precisión, y que ningún apareo lleve un valor «no reflejado». Falla si algún caso baja de su piso.
- **La regla de los avisos:** una lectura con `no-cierra` o `lectura-parcial` se concilia igual, pero
  todo sale `weak` con la marca `lectura-con-aviso`; con `varias-cuentas` o `cuenta-distinta` no se
  concilia (409 `OTRA_CUENTA`), porque los valores son de otra cuenta. La confianza de una propuesta
  nunca supera la del renglón en que se apoya.
- Un techo de tiempo cubre todo el apareo (6 s por pedido) y cada búsqueda de una suma (2 s): lo que no se
  terminó de buscar vuelve `a-revisar` con un motivo que dice por qué, nunca un apareo ni un `pendiente`.
  Lo mismo un renglón que no se buscó por un tope (más de 50 valores del mismo importe, una suma con más de
  200 valores, un día con más de 40 renglones del grupo). `pendiente` queda para «se buscó y no hay»: un
  renglón con varios valores en la ventana que ningún paso pudo separar vuelve `a-revisar` con ellos.
- Ningún dato de un caso de BDL va al código, a las pruebas ni a los informes: se inventan.

## Los DBG y el aprendizaje

`src/dbg/` abre los renglones que el apareo dejó `pendiente` y que son de la familia banco en
propuestas `dbg`: un cargo con su IVA y su percepción de IVA, con el tipo de gasto y la cuenta. Es parte
de `reconcile`, que llama a `openPending` al final. La traducción del contrato (en castellano) a los
nombres del motor está en los mismos tres lugares de siempre: `src/reconcile/request.ts` (los
catálogos y la historia que entran), `src/reconcile/publicReconciliation.ts` (la propuesta que sale) y
`src/api/decisions.ts` (la decisión que llega). La referencia para BDL es
`agilbank-server/docs/api-agilbank.html` (secciones 08, 09, 13 y 14); el diseño,
`docs/superpowers/specs/2026-10-16-agilbank-dbg-y-aprendizaje-design.md`.

- `grouping.ts`: arma los grupos (RF-25). Un IVA o una percepción de IVA se pega al cargo con el que
  comparte número, o con el único cargo cercano que cierra con la alícuota; el IVA del día puede ir con
  varios cargos del mismo día y tipo cuya suma cierra. Con más de una forma de agrupar no elige: el IVA
  queda solo. Los impuestos y las recaudaciones van siempre solos.
- `learning.ts`: aporta cada fuente de la cuenta: lo que la empresa decidió, su historia
  (`historiaDbg`) y el catálogo por nombre. La historia y las decisiones pesan lo reciente: el
  peso cae a la mitad cada 180 días.
- `open.ts`: junta todo. `pairOf` decide el orden de firmeza de la cuenta (decisión, historia, catálogo
  por nombre, sin cuenta) y la confianza. Un DBG que sale de las decisiones baja a `weak` si la
  cuenta de IVA o de percepción que necesita no vino de ellas, y también si un renglón del grupo no
  encadena o si otro cargo del día aprendió otro par.
- `src/api/decisions.ts`: `POST /v1/decisiones`. Guarda una decisión por renglón de cada conciliación;
  la de un grupo DBG se guarda con el renglón del cargo, así que decidir cualquier renglón del grupo es
  decidir el grupo, y repetirla la reemplaza.

**La regla del aprendizaje:** una decisión enseña solo si es sobre un `dbg` o un `pendiente` y lo
elegido es un `dbg` o un `pendiente`. Una sobre un `apareo` o un `a-revisar` se registra y no enseña. La
cuenta aprendida es `grounded` con 3 decisiones o más sobre el mismo concepto, el 80 % o más del peso en
el mismo par y la última (que no sea una rechazada) de menos de un año; si no, el par de más peso sale
`weak`. La misma regla decide entre `dbg` y `pendiente`. Una rechazada no enseña: le resta su peso al par
que se había propuesto. Solo cuentan las decisiones de la misma empresa y del mismo banco.

El resultado guardado de una conciliación se reusa mientras no cambien el pedido (con los catálogos y la
historia) ni las decisiones de la empresa y el banco. Con decisiones, dura hasta el día siguiente: su
peso depende de la edad.

- `npm run bench:dbg`: el banco de DBG. Lee el extracto de cada caso de BDL (`AB_IEB_DIR`), concilia
  en arranque en frío (sin decisiones, con la historia y los catálogos del caso) y mide qué parte de la
  familia banco sale como `dbg` y qué parte del importe lleva la cuenta correcta. Imprime solo conteos y
  porcentajes, nunca un dato del caso, y falla si algún caso baja de su piso.

## La lectura visual

Un PDF o una foto se lee en `src/sources/visual.ts`, con poppler y PP-OCR del módulo
`@agilmind/lectura`. El formato sale de los primeros bytes, nunca del nombre.

- **PDF:** cada página se lee por su texto si el texto sirve; la que no, por OCR. Si alguna página
  necesita OCR y el OCR no está, la lectura sale `unavailable`: no se lee a medias. Un PDF dañado o
  con contraseña sale `abstained`.
- **Fotos JPG, PNG, TIFF y WebP:** hasta 4.000.000 de píxeles, enderezadas por su EXIF. Si no aparecen
  movimientos, se prueban giradas. Las fotos HEIC salen `abstained`, con el pedido de mandarlas en
  JPG, PNG o PDF. Un TIFF de varias páginas, también: sharp abre solo la primera, y el pedido es
  mandarlo en PDF.
- **Techos** (`VISUAL_LIMITS`): 600 s de lectura y 60 páginas. Pasado cualquiera, se devuelve lo leído
  hasta la última página entera, con el aviso `lectura-parcial`, que frena las propuestas. El aviso
  trae la causa en `datos.causa`: `tiempo`, `render` (una página que no salió del render), `ocr` (una
  página en la que el OCR falló) o `paginas`. Las tres primeras son fallas nuestras de un momento, y el
  reenvío del archivo lo lee de nuevo; el tope de páginas es del archivo y queda. A unos 5,6 s por
  página, las 60 páginas entran en los 600 s salvo con la máquina muy cargada; si se corta dos veces, el
  aviso por tiempo pide mandarlo partido en archivos más chicos. El techo vale
  porque el paso corre sin la transacción de 5 minutos del andamiaje (`.transactional(false)` en el
  DSL del producto); el evento del worker vence a los 30. Si en lo leído no está la tabla, el
  resultado dice cuántas páginas se leyeron y por qué se cortó: con un corte nuestro sale `unavailable`,
  porque la tabla puede estar en lo que falta; con el tope de páginas, `abstained`.
- **Resolución:** el OCR renderiza a **150 dpi**. A 200 dpi no lee mejor en conjunto y tarda entre
  1,24 y 1,34 veces más. El Credicoop 06, de 38 páginas, tardó 213 s a 150 dpi con carga de 4 a 6, en
  una corrida anterior a los arreglos de columnas: por 1,24, a 200 serían unos 264 s.
- **Meta de 180 s:** no se alcanza. El Credicoop 06 a 150 dpi tarda 213 s con la mejor carga medida y
  340 s con carga 8 a 10. Repartir el OCR en paralelo dentro de un proceso no rinde: lo mostró la
  medición de la enmienda de la spec de la lectura
  (`agilpost-motor/docs/superpowers/specs/2026-10-09-agilbank-lectura-design.md`). No se agrega paralelismo en esta etapa.

La medición del 14-10-2026, con `npm run bench:visual`. Cada archivo se leyó a 150 y a 200 dpi,
intercalados, dos veces cada uno y sin el techo de tiempo. Las dos pasadas de cada resolución dieron
lo mismo. Con carga de 4 a 14 en 8 núcleos, los segundos sirven para
comparar las resoluciones entre sí, no como el tiempo del servidor.

| archivo | renglones 150 / 200 | encadenan 150 / 200 | veredicto | s 150 / 200 | 200 / 150 | carga |
|---|---|---|---|---|---|---|
| BBVA 06 (fuente rota) | 114 / 115 | **102/109** / 99/108 | weak en las dos | 45 / 61 | 1,34 | 4 a 13 |
| Credicoop 06 (caso 01) | 962 / 960 | 0/0 / 0/0 | weak en las dos | 340 / 420 | 1,24 | 8 a 10 |
| BPN 06 | 378 / 359 | 0/0 / **236/359** | weak en las dos | 67 / 86 | 1,28 | 8 a 14 |
| BPN 08 | 193 / 194 | 0/0 / 0/0 | weak en las dos | 39 / 51 | 1,29 | 7 a 11 |
| BPN 09 | 211 / 213 | **150/211** / 0/0 | weak en las dos | 42 / 53 | 1,26 | 6 a 8 |

Ninguna resolución gana en todos. A 200 el BPN 06 encadena, pero con todos los importes en positivo,
y no cierra. A 200 se pierde el encadenamiento del BPN 09 y tres renglones que encadenaban en el
BBVA 06. En el BPN 08, 82 importes cambian de signo, y no hay saldos que digan cuál es el correcto.
El Credicoop 06 no trae saldos por renglón: las dos lecturas coinciden en 950 renglones de 962 y 960
(`bench:visual`). En una sonda aparte, que no está en el repo, la suma de sus importes quedó 4,4
veces más lejos del cierre de `cuenta.json` a 200 que a 150.
Con esta carga, el Credicoop 06 pasó los 240 s también a 150 dpi (340 s): con el techo de
entonces se habría cortado con `lectura-parcial`.

Para correr:

- `npm run test:integration`: los tests que corren PP-OCR, con imágenes y PDF sintéticos. Toman los
  modelos del módulo de lectura si `AP_PADDLE_MODELS_DIR` no está.
- `npm run bench`: el banco de las etapas 2 y 3, sobre los extractos de BDL (`AB_IEB_DIR`).
  `AB_BENCH_BUDGET_MS` sube el techo de tiempo para medir solo la lectura con la máquina cargada.
- `npm run bench:visual`: la medición de la resolución. `AB_VISUAL_FILES` (las etiquetas de
  `bench/files.ts`, separadas por comas) elige qué archivos medir. `AB_VISUAL_PASSES`, un entero
  ≥ 1 (por defecto 2), cuántas pasadas por resolución; con menos de 2, «pasadas iguales» dice «n/a».

Los dos bancos necesitan los modelos:

```bash
AP_PADDLE_MODELS_DIR=$(pwd)/node_modules/@agilmind/lectura/modelos/paddle-latin-v5 npm run bench:visual
```
