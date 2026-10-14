-- Fecha sin hora: el cambio de tipo a date va en un solo bloque DO, que Postgres corre entero:
-- si falla el ALTER de una tabla, ninguna queda cambiada.
-- Si falla: corregí la causa, `npx prisma migrate resolve --rolled-back 20261014101742_agilbank_updates` y `npx prisma migrate deploy`
-- (o el ciclo de haiku de nuevo). Repetirla no falla: pasar a date una columna que ya es date no cambia nada.
DO $fecha_sin_hora_tipo$
BEGIN
-- AlterTable
ALTER TABLE "ab_statement" ALTER COLUMN "period_from" SET DATA TYPE DATE,
ALTER COLUMN "period_to" SET DATA TYPE DATE;
END
$fecha_sin_hora_tipo$;
