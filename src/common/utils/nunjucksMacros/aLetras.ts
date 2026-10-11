export function aLetrasFilter(value: any): string {
  const numStr = String(value || "0");

  const unidades = [
    "",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
  ];
  const decenas = [
    "",
    "diez",
    "veinte",
    "treinta",
    "cuarenta",
    "cincuenta",
    "sesenta",
    "setenta",
    "ochenta",
    "noventa",
  ];
  const especiales = [
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
    "dieciséis",
    "diecisiete",
    "dieciocho",
    "diecinueve",
  ];
  const veintes = [
    "veinte",
    "veintiuno",
    "veintidós",
    "veintitrés",
    "veinticuatro",
    "veinticinco",
    "veintiséis",
    "veintisiete",
    "veintiocho",
    "veintinueve",
  ];

  const convertirNumeroATextoInterno = (num: number): string => {
    if (isNaN(num)) {
      return String(value);
    }
    if (num < 0) return "menos " + convertirNumeroATextoInterno(Math.abs(num));
    if (num === 0) return "cero";
    if (num < 10) return unidades[num];
    if (num < 20) return especiales[num - 10];
    if (num < 30) return veintes[num - 20];
    if (num < 100) {
      const decena = Math.floor(num / 10);
      const unidad = num % 10;
      if (unidad === 0) return decenas[decena];
      return `${decenas[decena]} y ${unidades[unidad]}`;
    }
    if (num < 1000) {
      const centena = Math.floor(num / 100);
      const resto = num % 100;
      let txtCentena = "";
      if (centena === 1) {
        txtCentena = resto === 0 ? "cien" : "ciento";
      } else {
        switch (centena) {
          case 5:
            txtCentena = "quinientos";
            break;
          case 7:
            txtCentena = "setecientos";
            break;
          case 9:
            txtCentena = "novecientos";
            break;
          default:
            txtCentena = unidades[centena] + "cientos";
            break;
        }
      }
      const restoEnPalabras = convertirNumeroATextoInterno(resto);
      return resto === 0
        ? txtCentena.trim()
        : `${txtCentena.trim()}${
            restoEnPalabras === "cero" ? "" : " " + restoEnPalabras
          }`;
    }
    if (num < 1000000) {
      const miles = Math.floor(num / 1000);
      const resto = num % 1000;
      let txtMiles = "";
      if (miles === 1) {
        txtMiles = "mil";
      } else {
        txtMiles = convertirNumeroATextoInterno(miles) + " mil";
      }
      const restoEnPalabras = convertirNumeroATextoInterno(resto);
      return resto === 0
        ? txtMiles.trim()
        : `${txtMiles.trim()}${
            restoEnPalabras === "cero" ? "" : " " + restoEnPalabras
          }`;
    }
    return String(num);
  };

  const parts = numStr.split(".");
  const enteroStr = parts[0];
  const entero = parseInt(enteroStr, 10);

  if (isNaN(entero)) {
    return numStr;
  }

  if (entero === 0 && parseFloat(numStr) === 0) {
    return "cero";
  }

  let resultado = convertirNumeroATextoInterno(entero).trim();

  if (parts.length > 1) {
    const decimalStr = parts[1].substring(0, 2); // Consider up to two decimal places
    // const decimalNum = parseInt(decimalStr, 10); // Not strictly needed if just appending
    if (decimalStr.length > 0 && parseInt(decimalStr, 10) > 0) {
      // only add if decimal part is not zero
      resultado += ` con ${decimalStr}`; // e.g., "doce con 50"
    }
  }

  if (resultado.trim() === "" && parseFloat(numStr) !== 0) {
    return numStr;
  }

  return resultado;
}
