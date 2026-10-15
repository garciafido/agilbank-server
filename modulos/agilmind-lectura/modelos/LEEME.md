# Modelos del motor

Viajan con el motor para que la imagen de un producto lea igual que el banco, sin bajar nada
en runtime. El generador los copia a la imagen (`haiku-module.json` → `imagen`).

## paddle-latin-v5

El reconocimiento latino oficial de PaddleOCR, `latin_PP-OCRv5_mobile_rec`, convertido a ONNX
con paddle2onnx. `dict.txt` sale de `inference.yml`, que viene con el modelo. La detección no
está acá: es la que trae `@gutenye/ocr-models`, y `paddleOcr.ts` la usa cuando la carpeta no
tiene `det.onnx`.

| Archivo | sha256 |
|---|---|
| rec.onnx | 7888113072263cb471b93f66dd5e2ad70548dc526fa1ace760d0d973dd121498 |
| dict.txt | c3ab00106e4a4d151a8575b1129b91901a68a35b79a81fd63faab00418b87d75 |

Se activa con `AP_PADDLE_MODELS_DIR` apuntando a esta carpeta. Sin la variable, PaddleOCR usa
el reconocimiento chino del paquete, que en texto latino casi no emite espacios.

## Similitud (EmbeddingGemma)

No está en el repo: son 316 MB. La imagen los baja al construir, de
`onnx-community/embeddinggemma-300m-ONNX` en la versión fijada en `haiku-module.json`, y
verifica cada archivo por su sha256. `AP_EMBEDDING_MODELS_DIR` apunta a la carpeta donde quedan;
con la variable, la similitud nunca baja nada.
