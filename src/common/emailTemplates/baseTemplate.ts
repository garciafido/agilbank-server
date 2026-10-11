import { EmailLanguage } from "./types";

export function getBaseTemplate(
  content: string,
  language: EmailLanguage = "es"
): string {
  const fontFamily = "Arial, sans-serif";
  const rtl = false; // Could be extended for RTL languages in the future

  return `
    <!DOCTYPE html>
    <html lang="${language}" dir="${rtl ? "rtl" : "ltr"}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: ${fontFamily};
          line-height: 1.6;
          color: #333333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        @media only screen and (max-width: 600px) {
          .container {
            padding: 10px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${content}
      </div>
    </body>
    </html>
  `;
}
