import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { uploadTempDir } from "../constants";
import { UploadedFile } from "../../graphql/types";

/**
 * Creates a temporary file from string content
 * @param content The file content as string
 * @param filename The desired filename
 * @param mimetype The file MIME type
 * @returns UploadedFile object ready for processing
 */
export const createTempFileFromString = (
  content: string,
  filename: string,
  mimetype: string
): UploadedFile => {
  const ticket = uuidv4();
  const tempPath = path.join(uploadTempDir, `${ticket}.temp`);

  // Asegurar que el directorio temporal existe
  if (!fs.existsSync(uploadTempDir)) {
    fs.mkdirSync(uploadTempDir, { recursive: true });
  }

  fs.writeFileSync(tempPath, content, "utf-8");

  return {
    ticket,
    filename,
    mimetype,
    size: Buffer.byteLength(content, "utf-8"),
    encoding: "utf-8",
  };
};

/**
 * Creates a temporary file from Buffer content
 * @param content The file content as Buffer
 * @param filename The desired filename
 * @param mimetype The file MIME type
 * @returns UploadedFile object ready for processing
 */
export const createTempFileFromBuffer = (
  content: Buffer,
  filename: string,
  mimetype: string
): UploadedFile => {
  const ticket = uuidv4();
  const tempPath = path.join(uploadTempDir, `${ticket}.temp`);

  // Asegurar que el directorio temporal existe
  if (!fs.existsSync(uploadTempDir)) {
    fs.mkdirSync(uploadTempDir, { recursive: true });
  }

  fs.writeFileSync(tempPath, content);

  return {
    ticket,
    filename,
    mimetype,
    size: content.length,
    encoding: undefined,
  };
};
