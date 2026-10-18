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

`PP-OCRv5_mobile_det.onnx` es la detección oficial `PP-OCRv5_mobile_det` (Hugging Face
`PaddlePaddle/PP-OCRv5_mobile_det`, commit 0d63e78e2b68; el `.pdiparams` coincide con el oid LFS),
convertida con paddle2onnx 2.0.1 y paddlepaddle 3.0.0, opset 14 y el verificador de ONNX. La usa solo
la detección oficial (`paddleOficial.ts`); gutenye no la mira, porque con su pre-proceso esta red
publica peor que la v4 del paquete.

| Archivo | sha256 |
|---|---|
| PP-OCRv5_mobile_det.onnx | d7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924 |
| PP-OCRv5_mobile_det.yml (el `inference.yml` que viene con el modelo) | 98069072e1b6b37d727fd9d9f11725faa46d6ea0de012f2ed26caea011c37699 |
| inference.pdiparams de origen | afa1820cb16c1fd0dad589d0f8b389139061c1ef6d68019685fd07be997dda5b |

## Similitud (EmbeddingGemma)

No está en el repo: son 316 MB. La imagen los baja al construir, de
`onnx-community/embeddinggemma-300m-ONNX` en la versión fijada en `haiku-module.json`, y
verifica cada archivo por su sha256. `AP_EMBEDDING_MODELS_DIR` apunta a la carpeta donde quedan;
con la variable, la similitud nunca baja nada.
