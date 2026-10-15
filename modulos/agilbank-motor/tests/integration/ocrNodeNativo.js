/**
 * `@gutenye/ocr-node` cargado por Node y no por jest. Es un módulo ES: el registro de jest no lo
 * carga con `require`, y con `--experimental-vm-modules` lo carga en el contexto de jest, donde
 * onnxruntime rechaza sus tensores porque el `Float32Array` de ese contexto no es el de Node.
 * Node 22 carga un módulo ES con `require`, y el OCR corre entero en el contexto de Node.
 */
// `getBuiltinModule` da el `module` de Node: el `require("module")` de jest trae su propio
// `createRequire`, que vuelve a pasar por el registro de jest.
const { createRequire } = process.getBuiltinModule("module");
const path = require("path");

const lectura = path.dirname(require.resolve("@agilmind/lectura/package.json"));
module.exports = createRequire(path.join(lectura, "package.json"))("@gutenye/ocr-node");
