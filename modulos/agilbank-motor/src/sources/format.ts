export type FileFormat = "xlsx" | "xls" | "markup" | "pdf" | "image" | "heic" | "text";

const starts = (file: Buffer, bytes: number[]): boolean => bytes.every((b, i) => file[i] === b);

const OFFICE_XML = "urn:schemas-microsoft-com:office:spreadsheet";

/**
 * Una tabla HTML o una planilla XML 2003, que muchos home banking guardan con extensión .xls: después
 * de los espacios y de la marca de orden de bytes empieza con «<», y trae una tabla HTML o el espacio
 * de nombres de la planilla XML de Office.
 */
const isMarkup = (file: Buffer): boolean => {
  let i = starts(file, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (i < file.length && [0x20, 0x09, 0x0a, 0x0d].includes(file[i])) i++;
  if (file[i] !== 0x3c) return false;
  const text = file.toString("latin1");
  return /<table[\s>]/i.test(text) || text.includes(OFFICE_XML);
};

/** El formato por los primeros bytes, nunca por el nombre: el nombre lo eligió alguien. */
export const formatOf = (file: Buffer): FileFormat => {
  if (starts(file, [0x50, 0x4b, 0x03, 0x04])) return "xlsx";
  if (starts(file, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "xls";
  if (file.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (starts(file, [0xff, 0xd8, 0xff]) || starts(file, [0x89, 0x50, 0x4e, 0x47])) return "image";
  // La caja ftyp de un HEIF: «heic», «heix» o «mif1» desde el byte 8.
  if (file.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(file.subarray(8, 12).toString("latin1"))) return "heic";
  if (isMarkup(file)) return "markup";
  return "text";
};
