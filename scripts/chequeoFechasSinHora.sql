-- GENERADO POR HAIKU — no editar: se reescribe en cada regeneración.
-- Fecha sin hora: chequeo de SOLO LECTURA, para correr en producción ANTES del deploy que pasa
-- los campos date a días de calendario. No muestra datos: solo cuenta.
--   psql "$DATABASE_URL" -f scripts/chequeoFechasSinHora.sql
--
-- que = columna: cada columna de un campo date. hora_sospechosa cuenta los valores con hora
--   entre las 21:00 y las 23:59 UTC: el cambio de tipo se queda con el día UTC de cada valor,
--   y con esas horas ese día puede no ser el que se cargó.
-- que = snapshot: cada campo date de un snapshot (data_). hora_sospechosa como arriba, y
--   no_convertibles: lo que no es ni un día ni un ISO con hora que se pueda leer (la
--   reescritura de los snapshots lo deja como está).
--
-- Una columna o una tabla que todavía no existe (llega con este deploy) sale con
-- "(no existe todavía: llega con este deploy)" y sin conteos: no tiene datos viejos.
--
-- Si hay horas sospechosas, una migración propia del proyecto que corra antes del cambio de
-- tipo puede llevar cada valor al mediodía UTC de su día: se decide caso por caso antes del
-- deploy. Necesita Postgres 16 o más (pg_input_is_valid).
--
-- Corre adentro de una transacción de solo lectura que termina en ROLLBACK: aunque alguien
-- lo edite, no puede escribir (Postgres rechaza cualquier escritura), y la zona UTC es solo
-- de esta transacción.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SELECT 'columna' AS que, 'ab_statement.period_from' || CASE WHEN x IS NULL THEN ' (no existe todavía: llega con este deploy)' ELSE '' END AS donde,
       (xpath('/row/con_valor/text()', x))[1]::text::bigint AS con_valor,
       (xpath('/row/hora_sospechosa/text()', x))[1]::text::bigint AS hora_sospechosa,
       (xpath('/row/no_convertibles/text()', x))[1]::text::bigint AS no_convertibles
  FROM (SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                  WHERE table_schema = current_schema() AND table_name = 'ab_statement' AND column_name = 'period_from')
               THEN query_to_xml('SELECT count("period_from") AS con_valor,
       count(*) FILTER (WHERE ("period_from"::timestamp)::time >= time ''21:00'') AS hora_sospechosa,
       0::bigint AS no_convertibles
  FROM "ab_statement"', false, true, '') END AS x) AS parte
UNION ALL
SELECT 'columna' AS que, 'ab_statement.period_to' || CASE WHEN x IS NULL THEN ' (no existe todavía: llega con este deploy)' ELSE '' END AS donde,
       (xpath('/row/con_valor/text()', x))[1]::text::bigint AS con_valor,
       (xpath('/row/hora_sospechosa/text()', x))[1]::text::bigint AS hora_sospechosa,
       (xpath('/row/no_convertibles/text()', x))[1]::text::bigint AS no_convertibles
  FROM (SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                  WHERE table_schema = current_schema() AND table_name = 'ab_statement' AND column_name = 'period_to')
               THEN query_to_xml('SELECT count("period_to") AS con_valor,
       count(*) FILTER (WHERE ("period_to"::timestamp)::time >= time ''21:00'') AS hora_sospechosa,
       0::bigint AS no_convertibles
  FROM "ab_statement"', false, true, '') END AS x) AS parte
ORDER BY 1, 2;
ROLLBACK;
