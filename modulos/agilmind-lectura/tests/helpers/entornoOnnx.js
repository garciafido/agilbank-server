// onnxruntime-node arma los tensores de salida con los arrays tipados del proceso y los compara
// con `instanceof` contra los del entorno: con los de la caja de Jest no coinciden («A float32
// tensor's data must be type of function Float32Array»). Este entorno usa los del proceso.
const { TestEnvironment } = require("jest-environment-node");

class EntornoOnnx extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const nombre of ["Float32Array", "Float64Array", "Int8Array", "Int16Array", "Int32Array", "BigInt64Array", "Uint8Array", "Uint8ClampedArray", "Uint16Array", "Uint32Array", "BigUint64Array", "ArrayBuffer"]) {
      this.global[nombre] = globalThis[nombre];
    }
  }
}

// Stryker necesita su mezcla para medir la cobertura por test en un entorno propio.
let exportado = EntornoOnnx;
try {
  exportado = require("@stryker-mutator/jest-runner").mixinJestEnvironment(EntornoOnnx);
} catch {
  // sin Stryker instalado, el entorno sirve igual
}
module.exports = exportado;
