// El paquete no publica tipos; la interfaz que usamos es mínima y está
// tipada localmente en paddleOcr.ts.
declare module "@gutenye/ocr-node" {
  const Ocr: { create(options?: unknown): Promise<{ detect(path: string): Promise<any[]> }> };
  export default Ocr;
}
