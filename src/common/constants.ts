import * as path from "path";

export const uploadFilesRoot =
  process.env.UPLOAD_DIR || path.join(__dirname, "public");
export const uploadTempDir = path.join(uploadFilesRoot, ".tmp"); // SIEMPRE subcarpeta del uploadFilesRoot
export const tempExtension = "temp";
