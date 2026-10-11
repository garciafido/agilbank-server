/**
 * Índice de identidad: cada objeto y cada lista alcanzable desde los datos de
 * la plantilla, con su camino (`"authors[1]"`, `"works[0].alternativeTitles"`).
 * La raíz queda con `""`.
 *
 * - Recorre en profundidad, en el orden de las claves; si un mismo objeto
 *   aparece en dos lugares, queda el primer camino.
 * - Los ciclos no lo cuelgan: un objeto ya registrado no se vuelve a recorrer.
 * - Buffers y demás vistas binarias se registran pero no se recorren.
 *
 * Límite conocido: por quedarse con el primer camino, un objeto compartido
 * (la misma nacionalidad en dos autores) da la clave del primero también en
 * la aparición del segundo (ver `wrapPath` en renderWithFields). Los datos que
 * arma Prisma no comparten objetos entre filas; un caché o un mapa de
 * búsqueda en los datos sí lo haría.
 */
export function buildPathIndex(data: unknown): WeakMap<object, string> {
  const index = new WeakMap<object, string>();

  const visit = (value: unknown, path: string): void => {
    if (typeof value !== "object" || value === null || index.has(value)) {
      return;
    }
    index.set(value, path);
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    for (const key of Object.keys(value)) {
      visit(
        (value as Record<string, unknown>)[key],
        path === "" ? key : `${path}.${key}`
      );
    }
  };

  visit(data, "");
  return index;
}
