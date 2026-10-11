/**
 * El texto propio del proyecto para el mail de validación de datos: el que le
 * pide a un contacto cargar y/o verificar sus datos. Lo usa
 * src/common/emailTemplates/emailVerificationEmail.ts.
 *
 * Es un asiento del proyecto: el generador lo emite sin textos propios (el mail
 * usa los suyos) y el proyecto lo puede reemplazar en develop. Mientras el
 * generador no cambie este archivo, la regeneración no pisa la versión del
 * proyecto. Si lo cambia, git mezcla solo lo que no se pisa con lo del proyecto
 * y da conflicto donde los dos cambiaron las mismas líneas o líneas pegadas:
 * después de regenerar hay que revisar este archivo, y tsc avisa si la firma
 * dejó de calzar.
 *
 * Contrato:
 * - message reemplaza el mensaje del mail ("{tenantName} requiere que cargues
 *   y/o verifiques tus datos."). Admite {tenantName}, que el mail cambia, todas
 *   las veces que aparece, por el nombre con que se presenta la empresa
 *   (escapado en el HTML).
 * - Texto plano: el mail lo escapa para HTML. Sin message, vacío o con solo
 *   espacios, va el del generador.
 * - El saludo, el asunto, la instrucción, el botón y el pie siguen siendo los
 *   del generador.
 */
export type DataValidationLanguage = "es" | "en" | "pt";

export interface DataValidationCopy {
  message?: string;
}

export function dataValidationCopy(
  _language: DataValidationLanguage
): DataValidationCopy {
  return {};
}
