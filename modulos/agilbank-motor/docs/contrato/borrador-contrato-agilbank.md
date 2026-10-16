# AgilBank: borrador del contrato

> **Reemplazado** por la referencia de la API, `agilbank-server/docs/api-agilbank.html`: la lectura (§1 a §6, §8 y el anexo), la conciliación y las decisiones (§7).
> Lo firme es lo que dice la referencia. Este borrador queda como antecedente.

*Para BDL · borrador del 10-10-2026 · lo firme es la lectura, la conciliación y las decisiones: están en la referencia*

Este borrador es para que puedan desarrollar en paralelo la carga del extracto en el Resumen de
Conciliación, la pantalla de propuestas y el aviso de las decisiones. Sigue la misma lógica que
Pronto IAC: envío del documento, consulta del estado, pedido con contexto y aviso de decisiones.

| Parte | Estado |
|---|---|
| Enviar un extracto, consultarlo y el objeto de la lectura (§1 a §5) | Firme para la etapa de lectura. Puede sumar campos, no cambiar los que hay |
| Las correcciones de las tablas (§6) | Firme en la forma |
| Pedir la conciliación (§7) | Firme: está en la referencia de la API |
| Informar las decisiones (§7) | Firme: está en la referencia de la API |

## 1. El circuito

1. ProntoNet envía el extracto con los datos de la cuenta (§3) y recibe un `idExtracto`.
2. Consulta el extracto (§4) hasta que la lectura termina, y recibe el resumen bancario canónico
   con sus controles.
3. Descarta los renglones que ya tenía, por su `id`, y asigna cada renglón nuevo al resumen del mes
   por su fecha.
4. Pide la conciliación de los renglones nuevos con los valores pendientes y los catálogos (§7).
5. Informa cada decisión del tesorero (§7).

## 2. Autenticación

Igual que AgilPost: cada instalación tiene su credencial, que viaja en
`Authorization: Bearer <credencial>`. La empresa sale de la credencial: lo de una empresa nunca se
usa para otra.

## 3. Enviar un extracto

`POST /api/v1/extractos` · `multipart/form-data`

| Parte | Qué es |
|---|---|
| `archivo` | El extracto tal como lo entregó el banco. Hasta 60 MB y 1.500 renglones |
| `cuenta` | JSON con lo que ProntoNet sabe de la cuenta (abajo). Todo es opcional, pero cuanto más mandan, más se controla. Si mandan los saldos, manden también el período: sin período, los saldos no se comparan |
| `nombre` | El nombre original del archivo, si quieren conservarlo |

```json
{
  "banco": "BANCO CREDICOOP CENTRAL",
  "numero": "CTA CTE. PESOS $ 191-001-055555/5",
  "cbu": "1910001800005555555555",
  "moneda": "Pesos",
  "periodoDesde": "2026-07-01",
  "periodoHasta": "2026-07-31",
  "saldoInicial": 1250432.15,
  "saldoFinal": 980432.10
}
```

**Respuesta · 202** `{ "idExtracto": "…", "huella": "…", "estado": "en-proceso" }`

**Un archivo que ya mandaron** (la misma huella, la misma empresa) responde **200** con el mismo
`idExtracto` y su resultado, sin leerlo de nuevo (RF-11). La excepción es una falla nuestra: si el
intento anterior quedó en `fallido`, terminó con el veredicto `no-disponible` o con una
`lectura-parcial` cortada por tiempo, render u OCR, el archivo se lee de nuevo, porque nada de eso dice
nada del archivo. Esa vez responde **202** con el mismo
`idExtracto` y `"estado": "en-proceso"`. La huella es el SHA-256 del archivo: la pueden calcular ustedes.

Formatos: XLSX, XLS, CSV y TXT; también el «XLS» que en realidad es una tabla HTML o una planilla XML
2003. Desde la etapa 3, también PDF (con texto o escaneado) y fotos JPG, PNG, TIFF y WebP; las fotos
HEIC y los TIFF de varias páginas vuelven con el veredicto `sin-lectura` y el motivo. El detalle está en la referencia de la API.

## 4. Consultar un extracto

`GET /api/v1/extractos/{idExtracto}` y `GET /api/v1/extractos/por-huella/{huella}`

```json
{ "idExtracto": "…", "huella": "…", "estado": "leido", "lectura": { } }
```

| `estado` | Qué quiere decir |
|---|---|
| `en-proceso` | Todavía se está leyendo. Pregunten de nuevo |
| `leido` | La lectura terminó. `lectura` viene siempre (§5), con cualquier veredicto, también `sin-lectura` y `no-disponible` |
| `fallido` | El servicio no pudo terminar por un error interno nuestro. No viene `lectura`. Mándenlo de nuevo: se vuelve a leer. No es una conclusión sobre el archivo |

## 5. La lectura: el resumen bancario canónico

```json
{
  "huella": "9f2c…",
  "veredicto": "verificada",
  "motivo": null,
  "encabezado": {
    "banco": { "codigo": "191", "nombre": "Banco Credicoop Cooperativo Limitado" },
    "cuenta": "CTA CTE. PESOS $ 191-001-055555/5",
    "cbu": "1910001800005555555555",
    "moneda": "Pesos",
    "periodoDesde": "2026-07-01",
    "periodoHasta": "2026-07-31",
    "saldoInicial": 1250432.15,
    "saldoFinal": 980432.10
  },
  "renglones": [
    {
      "id": "r-818c556e8def0a8f574d",
      "orden": 58,
      "fecha": "2026-07-01",
      "fechaValor": null,
      "tipo": { "codigo": "transferencia-recibida", "segun": "tabla" },
      "importe": 15000.50,
      "saldo": 1265432.65,
      "referencia": "100123",
      "contraparte": { "cuit": "30234567892", "nombre": "ACME", "cbu": null },
      "delBanco": { "codigo": "974", "texto": "Transf. Interbanking - Distinto Titular Ord.:30234567892-ACME", "complementos": [] },
      "encadena": null,
      "procedencia": { "origen": "celda", "hoja": "saldos_y_movimientos", "pagina": null, "paginaHasta": null, "filaDesde": 66, "filaHasta": 67 }
    }
  ],
  "avisos": [],
  "controles": {
    "sentido": "inverso",
    "saldoDeLaFila": "despues",
    "renglonesConSaldo": 58,
    "renglonesQueEncadenan": 57,
    "cierraConSusSaldos": true,
    "cierraConProntoNet": true
  }
}
```

### El veredicto

| `veredicto` | Qué quiere decir |
|---|---|
| `verificada` | Los saldos encadenan renglón a renglón, de punta a punta, y no hay ningún aviso que frene las propuestas. Es una regla aritmética: vale como la confirmación de un tercero |
| `a-revisar` | Se leyó, pero algo no cierra: hay saltos de saldo, el archivo no trae saldos, o hay un aviso que frene las propuestas |
| `sin-lectura` | No se pudo armar la tabla de movimientos. `motivo` dice por qué, en castellano |
| `no-disponible` | No pudimos mirar el archivo por una falla nuestra. No dice nada del archivo. Mándenlo de nuevo: se vuelve a leer |

Un aviso que no frena las propuestas, como `concepto-nuevo`, puede venir con `verificada`.

### El encabezado

| Campo | Qué es |
|---|---|
| `banco.codigo`, `banco.nombre` | El código de entidad (los tres primeros dígitos del CBU) y el nombre. Si el banco todavía no está en nuestra tabla, viene el código y `nombre` en `null` |
| `cuenta`, `moneda` | Los que mandaron |
| `cbu` | El del archivo si lo trae; si no, el que mandaron |
| `periodoDesde`, `periodoHasta` | La fecha del primer y del último renglón. **Describen el archivo, no el resumen del mes**: un extracto diario cubre unos días y uno mensual puede cruzar de mes |
| `saldoInicial`, `saldoFinal` | Los leídos o, si el archivo no los imprime, los que salen del primer y del último saldo de renglón. `null` si no hay ninguno |

### El renglón

| Campo | Qué es |
|---|---|
| `id` | Identificador estable: el mismo movimiento tiene el mismo id en el extracto del día y en el del mes, aunque el texto del concepto cambie o un canal no traiga la referencia. Sale de la cuenta, la fecha y el importe, con un ordinal entre los renglones que comparten los tres (por su referencia si el archivo la trae; si no, por su orden). La cuenta es la que mandaron, su CBU o si no su número, y si no mandaron ninguno, el CBU del archivo: manden siempre la misma identificación de la cuenta. Descarten los repetidos por este id, dentro de la cuenta |
| `orden` | La posición en el archivo, desde 1 |
| `fecha`, `fechaValor` | Con formato `AAAA-MM-DD`. `fechaValor` solo si el banco la informa |
| `tipo.codigo` | El tipo canónico (anexo) |
| `tipo.segun` | De dónde salió: `empresa` (una corrección de la empresa), `tabla` (la tabla común), `regla` (una regla general: viene con el aviso `concepto-nuevo`) o `ninguna` (quedó `sin-clasificar`) |
| `importe` | Con signo, desde el punto de vista del banco: positivo entra plata. Igual que en ProntoNet |
| `saldo` | El saldo de la fila, si el archivo lo trae |
| `referencia` | El número de comprobante, de cheque o de operación, tal como lo trae el banco |
| `contraparte` | CUIT, nombre y CBU de la otra parte, cuando el extracto los trae. El nombre puede venir cortado por el banco |
| `delBanco` | Lo que dice el banco, tal cual: su código de operación, su texto y las otras columnas de la fila |
| `encadena` | `true` si el saldo anterior más el importe da su saldo; `false` si no; `null` si no hay con qué controlarlo: los renglones sin saldo y el primer renglón con saldo cuando el archivo no imprime el saldo inicial (es el punto de partida) |
| `procedencia` | De dónde salió el renglón: `celda` (una planilla, con su hoja), `texto` (un CSV o TXT), `pdf` (el texto de un PDF) u `ocr` (la imagen de un PDF o una foto). `pagina` y `paginaHasta` son la página donde empieza y donde termina el renglón (`null` en planillas y textos). `filaDesde` y `filaHasta` son filas numeradas desde 1 como en la planilla; en `pdf` y `ocr`, líneas dentro de su página |

### Los avisos

Cada aviso trae `codigo`, `detalle` (en castellano, para mostrar), `frenaPropuestas` y, si se
refiere a renglones, `renglones` con sus órdenes.

| `codigo` | Cuándo | ¿Frena las propuestas? |
|---|---|---|
| `no-cierra` | El saldo inicial más los renglones no da el saldo final, o los saldos del archivo no son los que mandaron (solo si mandaron el período y el archivo lo cubre). Puede venir más de una vez | Sí |
| `varias-cuentas` | El archivo trae movimientos de más de una cuenta. `datos.cuentas` las identifica | Sí |
| `cuenta-distinta` | El CBU del archivo no es el que mandaron. `datos.cbuDelArchivo` y `datos.cbuDeProntoNet` dicen cuáles son | Sí |
| `sin-saldos` | Ningún renglón se pudo controlar contra el saldo anterior: el archivo no trae saldos, trae solo los saldos inicial y final, trae un solo saldo, tiene una columna de saldo que no encadena con los importes, o sus saldos no se controlan entre sí. También sale cuando solo se pudo controlar un renglón: `verificada` pide al menos dos. `detalle` dice cuál | No |
| `no-encadena` | Hay renglones cuyo saldo no encadena con el anterior | No |
| `concepto-nuevo` | Un concepto que no está en la tabla. `datos.texto` trae el texto del banco, `datos.codigo` su código de operación (o `null`) y `datos.tipo` lo que se propuso | No |
| `lectura-parcial` | La lectura de un PDF se cortó a mitad. `datos.causa` dice por qué: `tiempo`, `render`, `ocr` o `paginas`. Con las tres primeras, el reenvío lo lee de nuevo; si una por `tiempo` se vuelve a cortar, hay que mandarlo partido en archivos más chicos | Sí |

### Los controles

`sentido` (`cronologico` o `inverso`: si el más nuevo está arriba), `saldoDeLaFila` (`despues` o
`antes`: si el saldo impreso es el que queda después del movimiento o el que había antes, como el
saldo de apertura del día), cuántos renglones tienen saldo y cuántos encadenan, y si los saldos
cierran con los del archivo y con los que mandaron (`null` si no hay con qué comparar).

### Lo que puede venir en `null`

- `encabezado` y `controles` son `null` cuando el veredicto es `sin-lectura` o `no-disponible`. En ese
  caso `renglones` viene vacío.
- `controles.saldoDeLaFila` es `null` cuando el archivo no trae saldos.
- `contraparte` es `null` cuando el renglón no trae ni CUIT ni CBU. Cuando viene, `nombre` puede ser
  `null`.

## 6. Las correcciones de las tablas

`POST /api/v1/correcciones`

```json
{ "banco": "191", "codigoDelBanco": "IVAA1", "textoDelBanco": "IVA-Ali Adic RG 2408 s/Comis-Rec Gastos", "tipo": "percepcion-iva" }
```

`banco` y `codigoDelBanco` pueden ir en `null`. Una alícuota se manda con `alicuota`: se guarda con la
corrección y la usa la etapa de débitos y créditos.
**Respuesta · 201** `{ "idCorreccion": "…", "vigente": "empresa", "revision": "pendiente" }`.

La corrección vale desde la lectura siguiente **solo para la empresa** que la mandó. Nosotros la
revisamos: lo confirmado pasa a la tabla común y les llega a todos.

## 7. La conciliación y las decisiones

La conciliación de un extracto con los valores de ProntoNet está definida en la referencia de la API,
`agilbank-server/docs/api-agilbank.html` (secciones 08 a 12): conciliar un extracto
(`POST /api/v1/extractos/{idExtracto}/conciliacion`), consultar una conciliación
(`GET /api/v1/conciliaciones/{idConciliacion}`) y subir el detalle de un pago masivo
(`POST /api/v1/lotes`). La propuesta de crear un DBG para un renglón sin apareo, con sus catálogos y su
historia, y el aviso de lo que aceptó, corrigió o rechazó el tesorero
(`POST /api/v1/decisiones`), también están definidos en la referencia (secciones 08, 09, 13 y 14).
Lo firme es lo que dice la referencia; este párrafo no la repite.

Sigue para una etapa posterior: qué proponer crear para un renglón sin apareo que no es un gasto del
banco (`op`, `inversion`: hoy esos renglones vuelven `pendiente`, y la forma de la propuesta no
cambia).

## 8. Límites

60 MB y 1.500 renglones por archivo (RNF-04). Un extracto diario se lee en menos de un minuto; el
tiempo del resumen mensual en PDF se mide en la próxima etapa.

Un archivo más grande que lo que entra en un extracto vuelve con el veredicto `sin-lectura` y el
motivo: una hoja con más de 50.000 filas o 256 columnas, un libro con más de 5.000.000 de celdas, un
texto con más de 200.000 líneas, o un «XLS» de HTML o XML 2003 con más de 20 MB, 100.000 celdas o
2.000 celdas combinadas.

## Anexo: los tipos canónicos (primera versión)

Hay 30 tipos, en tres familias: «Movimientos con terceros», «Gastos e impuestos del banco» y
«Sin tipo».

| Código | Nombre | Familia |
|---|---|---|
| `transferencia-recibida` | Transferencia recibida | Movimientos con terceros |
| `transferencia-enviada` | Transferencia enviada | Movimientos con terceros |
| `transferencia-cuenta-propia` | Entre cuentas del mismo titular | Movimientos con terceros |
| `debin` | Débito o crédito inmediato (DEBIN) | Movimientos con terceros |
| `pago-masivo` | Un lote de pagos en un solo renglón | Movimientos con terceros |
| `cheque-pagado` | Cheque propio pagado | Movimientos con terceros |
| `echeq-pagado` | ECHEQ propio pagado | Movimientos con terceros |
| `deposito-cheques` | Cheques de terceros depositados | Movimientos con terceros |
| `debito-automatico` | Débito automático o directo | Movimientos con terceros |
| `pago-arca` | Pago a ARCA (VEP) | Movimientos con terceros |
| `pago-servicio` | Pago de servicios o de tarjeta | Movimientos con terceros |
| `fci-suscripcion` | Suscripción a un fondo común de inversión | Movimientos con terceros |
| `fci-rescate` | Rescate de un fondo común de inversión | Movimientos con terceros |
| `leasing` | Cuota, seguro o compra de un leasing | Movimientos con terceros |
| `prestamo` | Cuota o acreditación de un préstamo | Movimientos con terceros |
| `orden-judicial` | Embargo o transferencia por orden judicial | Movimientos con terceros |
| `impuesto-debitos` | Impuesto ley 25.413 sobre débitos | Gastos e impuestos del banco |
| `impuesto-creditos` | Impuesto ley 25.413 sobre créditos | Gastos e impuestos del banco |
| `impuesto-25413` | Impuesto ley 25.413, sin decir si es sobre débitos o sobre créditos | Gastos e impuestos del banco |
| `devolucion-impuesto` | Devolución o reversión del impuesto 25.413 | Gastos e impuestos del banco |
| `anulacion-debito` | Anulación o reversión de un débito | Gastos e impuestos del banco |
| `sircreb` | Recaudación de IIBB sobre acreditaciones | Gastos e impuestos del banco |
| `recaudacion-iibb` | Recaudación de IIBB de una jurisdicción | Gastos e impuestos del banco |
| `percepcion-iibb` | Percepción de IIBB | Gastos e impuestos del banco |
| `comision` | Comisión del banco | Gastos e impuestos del banco |
| `iva` | IVA sobre una comisión o un cargo | Gastos e impuestos del banco |
| `percepcion-iva` | Percepción de IVA (RG 2408) | Gastos e impuestos del banco |
| `intereses` | Intereses cobrados por el banco | Gastos e impuestos del banco |
| `sellos` | Impuesto de sellos | Gastos e impuestos del banco |
| `sin-clasificar` | Un concepto que todavía no está en la tabla | Sin tipo |

## Lo que nos falta de ustedes

- Su revisión de los tipos canónicos de este anexo.
- Los ejemplos que faltan: cuentas en dólares, extractos diarios, archivos de texto, fotos y el
  extracto de Provincia sin retocar.
