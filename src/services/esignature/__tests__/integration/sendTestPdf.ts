/**
 * Integration script: Send a test PDF for signing via DocuSeal
 *
 * Generates a PDF with text tags, sends it to DocuSeal via POST /api/submissions/pdf,
 * and prints signing links. After both signers complete, DocuSeal sends the signed
 * document to each party automatically.
 *
 * Usage:
 *   DOCUSEAL_URL=https://agilsign.moon1.jupiter.ar \
 *   DOCUSEAL_API_KEY=your-api-key \
 *   npx tsx src/services/esignature/__tests__/integration/sendTestPdf.ts
 *
 * Environment variables:
 *   DOCUSEAL_URL     - DocuSeal instance URL
 *   DOCUSEAL_API_KEY - API key (X-Auth-Token)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || '';

const SIGNERS = [
  { email: 'garciafido@gmail.com', name: 'García Fido', role: 'Autor' },
  { email: 'nmaeso@gmail.com', name: 'N Maeso', role: 'Editor' },
];

// ─────────────────────────────────────────────────────────────────────────────
// PDF Generation with text tags
// ─────────────────────────────────────────────────────────────────────────────

async function generateContractPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 11;
  const lineHeight = 16;

  // ── Page 1: Contract body ──
  const page1 = pdf.addPage([595, 842]); // A4
  let y = 790;
  const margin = 60;
  const maxWidth = 595 - margin * 2;

  const drawText = (text: string, options?: { bold?: boolean; size?: number }) => {
    const f = options?.bold ? fontBold : font;
    const s = options?.size || fontSize;
    page1.drawText(text, { x: margin, y, font: f, size: s, color: rgb(0, 0, 0) });
    y -= lineHeight * (s / fontSize);
  };

  const drawWrapped = (text: string) => {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth && line) {
        drawText(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) drawText(line);
  };

  // Title
  drawText('ACUERDO DE PRUEBA - FIRMA ELECTRÓNICA', { bold: true, size: 14 });
  y -= 10;

  const today = new Date().toLocaleDateString('es-AR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  drawText(`Fecha: ${today}`);
  y -= 10;

  drawText('ENTRE LAS PARTES:', { bold: true });
  y -= 5;
  drawWrapped(
    `1. ${SIGNERS[0].name} (en adelante "el Autor"), con correo electrónico ${SIGNERS[0].email}.`
  );
  y -= 5;
  drawWrapped(
    `2. ${SIGNERS[1].name} (en adelante "el Editor"), con correo electrónico ${SIGNERS[1].email}.`
  );
  y -= 10;

  drawText('CONSIDERANDO:', { bold: true });
  y -= 5;
  drawWrapped(
    'Que las partes desean formalizar un acuerdo de prueba para validar el sistema ' +
    'de firma electrónica implementado en la plataforma Jupiter, operando a través ' +
    'de AgilSign (DocuSeal).'
  );
  y -= 10;

  drawText('LAS PARTES ACUERDAN:', { bold: true });
  y -= 5;
  drawWrapped(
    'PRIMERA: Este documento constituye una prueba técnica del sistema de firma electrónica. ' +
    'No genera obligaciones legales entre las partes.'
  );
  y -= 5;
  drawWrapped(
    'SEGUNDA: Cada parte firma electrónicamente este documento mediante la plataforma AgilSign, ' +
    'la cual registra: identidad del firmante (email verificado), fecha y hora de firma, ' +
    'dirección IP, y hash del documento.'
  );
  y -= 5;
  drawWrapped(
    'TERCERA: Al completarse todas las firmas, el sistema genera un certificado de auditoría ' +
    '(audit trail) que se adjunta al documento firmado como evidencia de integridad.'
  );
  y -= 20;

  // Signature blocks with DocuSeal text tags
  drawText('FIRMAS:', { bold: true });
  y -= 15;

  // Autor signature
  drawText('El Autor:', { bold: true });
  y -= 5;
  // DocuSeal text tag — the role matches the submitter role
  drawText('{{signature_Autor}}');
  y -= 30;
  drawText(`Nombre: ${SIGNERS[0].name}`);
  drawText(`Email: ${SIGNERS[0].email}`);
  y -= 5;
  drawText('Fecha de firma: {{date_Autor}}');
  y -= 25;

  // Editor signature
  drawText('El Editor:', { bold: true });
  y -= 5;
  drawText('{{signature_Editor}}');
  y -= 30;
  drawText(`Nombre: ${SIGNERS[1].name}`);
  drawText(`Email: ${SIGNERS[1].email}`);
  y -= 5;
  drawText('Fecha de firma: {{date_Editor}}');

  return Buffer.from(await pdf.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// DocuSeal API
// ─────────────────────────────────────────────────────────────────────────────

interface SubmitterResponse {
  id: number;
  submission_id: number;
  email: string;
  slug: string;
  status: string;
  role: string;
  embed_src: string;
}

interface SubmissionResponse {
  id: number;
  status: string;
  submitters: SubmitterResponse[];
  combined_document_url: string | null;
  audit_log_url: string | null;
}

async function sendPdfForSigning(pdfBuffer: Buffer): Promise<SubmitterResponse[]> {
  const payload = {
    pdf: { base64: pdfBuffer.toString('base64') },
    send_email: true,
    name: `Acuerdo de Prueba — ${new Date().toISOString().slice(0, 10)}`,
    submitters: SIGNERS.map((s, i) => ({
      email: s.email,
      name: s.name,
      role: s.role,
      order: i + 1,
    })),
    message: {
      subject: 'Documento de prueba para firma electrónica',
      body: 'Este es un documento de prueba del sistema de firma electrónica Jupiter/AgilSign. Por favor firmalo haciendo click en el botón.',
    },
  };

  const response = await fetch(`${DOCUSEAL_URL}/api/submissions/pdf`, {
    method: 'POST',
    headers: {
      'X-Auth-Token': DOCUSEAL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DocuSeal API error (${response.status}): ${error}`);
  }

  return response.json();
}

async function fetchSubmission(submissionId: number): Promise<SubmissionResponse> {
  const response = await fetch(`${DOCUSEAL_URL}/api/submissions/${submissionId}`, {
    headers: { 'X-Auth-Token': DOCUSEAL_API_KEY },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch submission ${submissionId}: ${response.status}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  if (!DOCUSEAL_URL || !DOCUSEAL_API_KEY) {
    console.error('Missing environment variables:');
    console.error('  DOCUSEAL_URL     — DocuSeal instance URL');
    console.error('  DOCUSEAL_API_KEY — API key');
    console.error('');
    console.error('Usage:');
    console.error('  DOCUSEAL_URL=https://agilsign.moon1.jupiter.ar \\');
    console.error('  DOCUSEAL_API_KEY=your-key \\');
    console.error('  npx tsx src/services/esignature/__tests__/integration/sendTestPdf.ts');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AgilSign Integration Test — PDF Submission + Firma');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Generate PDF
  console.log('1. Generando PDF de prueba con text tags...');
  const pdfBuffer = await generateContractPdf();
  console.log(`   PDF generado: ${pdfBuffer.length} bytes`);
  console.log('');

  // Step 2: Send to DocuSeal
  console.log('2. Enviando a DocuSeal para firma...');
  console.log(`   URL: ${DOCUSEAL_URL}`);
  console.log(`   Firmantes: ${SIGNERS.map(s => `${s.name} <${s.email}>`).join(', ')}`);
  console.log('');

  const submitters = await sendPdfForSigning(pdfBuffer);
  const submissionId = submitters[0].submission_id;

  console.log(`   Submission ID: ${submissionId}`);
  console.log('');

  // Step 3: Show signing links
  console.log('3. Links de firma (cada firmante también recibió email):');
  console.log('');
  for (const s of submitters) {
    console.log(`   ${s.role} (${s.email}):`);
    console.log(`   ${DOCUSEAL_URL}/s/${s.slug}`);
    console.log('');
  }

  // Step 4: Fetch full submission details
  const submission = await fetchSubmission(submissionId);
  console.log('4. Estado de la submission:');
  console.log(`   Status: ${submission.status}`);
  for (const s of submission.submitters) {
    console.log(`   - ${s.role} (${s.email}): ${s.status}`);
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Próximos pasos (manuales):');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  a) Cada firmante abre su link y firma');
  console.log('  b) DocuSeal envía email de confirmación a cada firmante');
  console.log('     con acceso al documento firmado');
  console.log('  c) DocuSeal dispara webhook submission.completed');
  console.log('  d) Nuestro completion handler descarga PDF firmado');
  console.log('     + audit log, los mergea, y almacena en DB');
  console.log('');
  console.log(`  Para verificar después de firmar:`);
  console.log(`  curl -s -H "X-Auth-Token: $DOCUSEAL_API_KEY" \\`);
  console.log(`    ${DOCUSEAL_URL}/api/submissions/${submissionId} | jq '.status'`);
  console.log('');
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
