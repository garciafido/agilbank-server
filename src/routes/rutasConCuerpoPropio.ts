// Las rutas de este proyecto que parsean su propio cuerpo.
//
// El asiento se emite en cada corrida, vacío. Lo que el proyecto declare acá
// SOBREVIVE: si toca este archivo, la próxima regeneración conflictúa.
//
// `server.ts` monta un `json()` global con el techo por default de express —100
// KB— porque GraphQL lo necesita. Ese parser corre ANTES de las rutas y marca el
// pedido como leído: el `json({ limit })` que una ruta monte después NO vuelve a
// leer el cuerpo, así que su techo no tiene efecto y un cuerpo grande muere con
// 413 sin llegar nunca al handler. El síntoma engaña, porque el parser de la
// ruta está ahí y parece estar rigiendo.
//
// Declarar el prefijo de esa ruta acá hace que el parser global la saltee.
//
// Límites, y son tres:
//
//   - La ruta QUEDA SIN PARSER hasta que monte el suyo. Sin eso `req.body` es
//     `undefined`, no un objeto vacío.
//   - El prefijo se compara contra el path completo, con el `/api` adelante.
//   - Los limitadores no se tocan: siguen corriendo antes que la ruta, y tienen
//     que seguir haciéndolo. Un techo de bytes alto sin techo de pedidos es una
//     forma de agotar la memoria del proceso.
//
// Lo que NO va acá: subir el techo de todo el sistema. Eso es cambiar el
// `json()` global, y le daría el mismo margen a GraphQL.

export const rutasConCuerpoPropio: string[] = [
  // La API de ProntoNet (agilbankApi.routes.ts) lee sus cuerpos: el envío con
  // busboy y las correcciones con su propio json() de 64 KB.
  "/api/v1/",
];
