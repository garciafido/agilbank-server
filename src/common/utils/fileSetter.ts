import { UploadedFile } from "../../graphql/types";
import { Prisma } from "../../prisma/generated-client/client";
import { keyGenerator } from "../storage";
import { ValidationError } from "../errors";

export const getDatePath = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

export type FileServerDataType = {
  baseName: string;
  filename: string;
  mimetype: string;
  size: number;
  uuid: string;
};

export const fileServerDataSetter = (
  baseName: string,
  uploadedFile: UploadedFile | undefined | null,
  filesToMove: { name: string; uploadedFile: UploadedFile; uuid: string }[],
  uuid?: string
): FileServerDataType | typeof Prisma.JsonNull => {
  if (!uploadedFile || uploadedFile.ticket === "remove") {
    return null;
  }

  // Sin ticket el archivo no llegó nunca: la subida falló o no terminó antes de
  // guardar. El cliente ya lo frena, así que esto es la última red, y el mensaje
  // es lo que ve el usuario: tiene que decirle qué hacer. Sin nombre es el
  // marcador que el cliente manda cuando un archivo obligatorio no está.
  if (!uploadedFile.ticket || uploadedFile.ticket.trim() === "") {
    throw new ValidationError(
      uploadedFile.filename
        ? `El archivo "${uploadedFile.filename}" no llegó al servidor: su subida no terminó. Vuelve a adjuntarlo y guarda nuevamente.`
        : "Falta un archivo obligatorio, o su subida no terminó. Adjúntalo y guarda nuevamente.",
      {
        code: "FILE_UPLOAD_EMPTY_TICKET",
        field: baseName,
        constraint: "ticket must not be empty",
        actualValue: uploadedFile.ticket,
        suggestedAction: "Re-upload the file before submitting the form",
      }
    );
  }

  const fileUuid = uuid || uploadedFile.ticket;

  filesToMove.push({ name: baseName, uploadedFile, uuid: fileUuid });
  return {
    baseName,
    filename: uploadedFile.filename,
    mimetype: uploadedFile.mimetype,
    size: uploadedFile.size,
    uuid: fileUuid,
  };
};

export const fileClientDataSetter = (
  baseName: string,
  uploadedFile: UploadedFile | undefined | null
) => {
  if (!uploadedFile || uploadedFile.ticket === "remove") {
    return null;
  }
  return {
    name: uploadedFile.filename,
    mimetype: uploadedFile.mimetype,
    size: uploadedFile.size,
    url: baseName,
  };
};
