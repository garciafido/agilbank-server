/**
 * Watchdog dev-only contra procesos huérfanos.
 *
 * Cuando el editor o la terminal matan al `npm` padre, a los nietos no les
 * llega señal alguna: `concurrently` y los procesos de ts-node-dev quedan
 * vivos, se re-parentan a PID 1 y siguen quemando CPU sin escuchar ningún
 * puerto. Este watchdog revisa `process.ppid` y, si el padre pasó a ser 1,
 * el proceso se despide.
 *
 * Gate doble OBLIGATORIO — no relajar ninguna de las dos condiciones:
 * HAIKU_DEV_WATCHDOG=1 la setean ÚNICAMENTE los scripts `dev` del
 * package.json, y además NODE_ENV no puede ser production. En Docker y en
 * producción tener a PID 1 de padre es lo NORMAL (el proceso es hijo directo
 * de init/tini): un watchdog sin gate mata el server en producción.
 */
export function startDevOrphanWatchdog(name: string): void {
  if (process.env.HAIKU_DEV_WATCHDOG !== '1') return;
  if (process.env.NODE_ENV === 'production') return;

  const interval = setInterval(() => {
    if (process.ppid === 1) {
      console.error(`[${name}] Parent process died (ppid=1) — exiting to avoid an orphan process burning CPU`);
      process.exit(0);
    }
  }, 5000);
  // No mantener vivo el proceso solo por el watchdog
  interval.unref();
}
