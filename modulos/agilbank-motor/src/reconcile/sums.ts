export interface SumItem { id: string; cents: number }
/** `exhausted`: la búsqueda se cortó por tiempo, así que pudo quedar una combinación sin ver. */
export interface SumSearch { combos: string[][]; exhausted: boolean }

/** El reloj se mira cada 1.024 pasos: mirarlo en cada uno costaría más que el paso. */
const CLOCK_EVERY = 1023;

/**
 * Las combinaciones de ítems que suman exacto el objetivo, hasta `maxCombos`. Recorre de mayor a menor
 * valor absoluto y poda cuando lo que queda no alcanza: un pago masivo cuyo total es la suma de todos los
 * candidatos se encuentra sin explorar nada más. Solo suman los ítems del signo del objetivo. Una combinación que
 * `accept` rechaza no cuenta para `maxCombos`: si contara, podría tapar a una segunda que sí vale.
 */
export const exactSubsets = (
  items: SumItem[],
  target: number,
  opts: { maxCombos: number; minSize: number; maxSize: number; deadline: number; now: () => number; accept?: (ids: string[]) => boolean },
): SumSearch => {
  if (opts.now() > opts.deadline) return { combos: [], exhausted: true };
  const sign = Math.sign(target);
  const xs = items.filter((i) => Math.sign(i.cents) === sign).map((i) => ({ id: i.id, a: Math.abs(i.cents) })).sort((p, q) => q.a - p.a);
  const suffix = new Array<number>(xs.length + 1).fill(0);
  for (let i = xs.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + xs[i].a;
  const combos: string[][] = [];
  const chosen: string[] = [];
  let exhausted = false;
  let steps = 0;
  const walk = (i: number, left: number): void => {
    if (combos.length >= opts.maxCombos || exhausted) return;
    if ((++steps & CLOCK_EVERY) === 0 && opts.now() > opts.deadline) {
      exhausted = true;
      return;
    }
    if (left === 0) {
      if (chosen.length >= opts.minSize && (!opts.accept || opts.accept([...chosen]))) combos.push([...chosen]);
      return;
    }
    if (chosen.length >= opts.maxSize || suffix[i] < left) return;
    if (xs[i].a <= left) {
      chosen.push(xs[i].id);
      walk(i + 1, left - xs[i].a);
      chosen.pop();
    }
    walk(i + 1, left);
  };
  walk(0, Math.abs(target));
  return { combos, exhausted };
};
