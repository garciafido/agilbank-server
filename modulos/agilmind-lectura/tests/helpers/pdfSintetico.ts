/**
 * Un PDF mínimo válido de `n` páginas: catálogo, árbol de páginas y n hojas vacías. Son unos
 * 400 bytes de estructura, así que no hace falta guardar binarios en el repositorio, y a
 * diferencia de un binario se ve qué hace que el archivo diga «N páginas».
 *
 * `cifrado` le agrega un diccionario `/Encrypt` al trailer, como los PDF protegidos contra
 * impresión que emiten los portales. El diccionario es de mentira: alcanza para que quien lo
 * lea sepa que el archivo se declara cifrado.
 */
export const pdfDe = (n: number, { cifrado = false }: { cifrado?: boolean } = {}): Buffer => {
  const objetos: string[] = [];
  const kids = Array.from({ length: n }, (_, i) => `${3 + i} 0 R`).join(" ");
  objetos.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);
  for (let i = 0; i < n; i++) {
    objetos.push(`${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n`);
  }
  if (cifrado) {
    objetos.push(`${3 + n} 0 obj\n<< /Filter /Standard /V 1 /R 2 /P -4 /O (0123456789012345678901234567890) /U (0123456789012345678901234567890) >>\nendobj\n`);
  }
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objetos) {
    offsets.push(cuerpo.length);
    cuerpo += o;
  }
  const xref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  const encrypt = cifrado ? ` /Encrypt ${3 + n} 0 R` : "";
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R${encrypt} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(cuerpo, "latin1");
};

/**
 * Un PDF con texto en Helvetica de 10 puntos: cada página es una lista de textos con la posición
 * de su línea base, en puntos desde abajo a la izquierda, como los escribe el PDF.
 */
export const pdfConTexto = (paginas: Array<Array<{ x: number; y: number; texto: string }>>): Buffer => {
  const objetos: string[] = [];
  const kids = paginas.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");
  objetos.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objetos.push(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>\nendobj\n`);
  objetos.push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  paginas.forEach((textos, i) => {
    const escapar = (t: string) => t.replace(/([()\\])/g, "\\$1");
    const contenido = textos.map((t) => `BT /F1 10 Tf ${t.x} ${t.y} Td (${escapar(t.texto)}) Tj ET`).join("\n");
    objetos.push(
      `${4 + 2 * i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>\nendobj\n`,
    );
    objetos.push(`${5 + 2 * i} 0 obj\n<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream\nendobj\n`);
  });
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objetos) {
    offsets.push(cuerpo.length);
    cuerpo += o;
  }
  const xref = cuerpo.length;
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) cuerpo += `${String(o).padStart(10, "0")} 00000 n \n`;
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(cuerpo, "latin1");
};
