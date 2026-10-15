# agilmind-lectura

Lo que lee un documento sin saber qué documento es: el render de un PDF con poppler, el PP-OCR con
sus modelos latinos, el texto del PDF con la posición de cada palabra y el orden de lectura.

Lo usan agilpost-motor (comprobantes) y agilbank-motor (extractos). Es un módulo de solo código del
generador: no trae entidades; lo lleva a cada producto que declare un motor que dependa de él.

Reglas:
- Todo parámetro viaja en la llamada: no hay configuración global que un producto le cambie al otro.
- Lo propio de un dominio queda en su motor.
- Un cambio acá se mide con los bancos de los dos motores, porque llega a los dos.

`npm run test:mutation` corre Stryker sobre la lógica pura, con `break: 80`: el gate de CI. El
10-10-2026 daba 45,41 % sobre todo `src/`; sobre lo que mide hoy da 95,8 %. Los casos puros de la
geometría y del orden de lectura están acá y también en el motor, que prueba el uso que hace AgilPost.

`mutate` lista archivos enteros. Lo que queda afuera es E/S, y se cubre con los tests que mockean el
motor, con los que corren poppler y con los bancos de los dos motores: `paddleOcr.ts` (cargar el
modelo ONNX y leer con él), `pdf.ts` (pdftoppm y pdfinfo), `pdfTextGeometry.ts` (pdftotext) y
`pdfPaginas.ts` (pdftotext y pdftoppm sobre un rango de páginas) y `foto.ts` (sharp: enderezar por EXIF,
achicar y girar una foto, y los píxeles en grises de una imagen). Lo que esos cinco deciden sobre
datos está en `ordenDeLectura.ts`, `paginasDePdf.ts`, `pdfGeometry.ts` y `paginasDelPdf.ts` (las
palabras por página, el número de página de un render y el tamaño de un PNG), que sí se miden. Una
función nueva con E/S va en uno de los cinco; una que solo transforma datos, en uno de los otros.
