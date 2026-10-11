import { UploadedFile } from "../../graphql/types";
import { getStorageProvider, keyGenerator } from "../storage";
import { tempExtension, uploadTempDir } from "../constants";
import { ValidationError } from "../errors";
import * as fs from "fs";
import * as path from "path";

export const getFileName = (basePath: string, entityId: string) => {
  return `${basePath}${entityId}`;
};

export const getFilePath = (file_path: string, file_name: string) => {
  return path.join(file_path, file_name);
};

async function moveUploaded(
  ticket: string,
  baseName: string,
  uuid: string,
  filename: string
) {
  const storage = getStorageProvider();
  const source = path.join(uploadTempDir, `${ticket}.${tempExtension}`);

  // El staging pudo expirar (temp sweep) o perderse: sin este check el upload
  // revienta con un ENOENT críptico. Error claro y accionable para el usuario.
  if (!fs.existsSync(source)) {
    throw new ValidationError(
      `El archivo subido "${filename}" ya no está disponible (la subida expiró). Vuelva a subirlo y guarde nuevamente.`,
      { code: "UPLOAD_TEMP_EXPIRED", field: baseName }
    );
  }

  const destinationKey = path.join(baseName, uuid, filename);

  await storage.upload(source, destinationKey, {
    contentType: "application/octet-stream",
  });
}

export const moveUploadedFiles = async (
  entityId: string,
  filesToMove: { name: string; uploadedFile: UploadedFile; uuid: string }[]
) => {
  for (let u of filesToMove) {
    await moveUploaded(
      u.uploadedFile.ticket,
      u.name,
      u.uuid,
      u.uploadedFile.filename
    );
  }
};

export const removeFile = async (fileData: any, id: string) => {
  const storage = getStorageProvider();
  const key = path.join(fileData.baseName, fileData.uuid, fileData.filename);
  await storage.delete(key);
};
