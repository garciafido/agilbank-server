/**
 * La escala de certeza, la misma de `src/common/verdict` de la plataforma y de agilpost-motor.
 *
 * Es una unión de cinco literales: el mismo espacio de valores cruza la frontera sin conversión. Si
 * la plataforma agrega un sexto veredicto, este tipo produce un error de compilación en la frontera,
 * que es donde alguien tiene que decidir qué hace el motor con él.
 */
export type Verdict = "verified" | "grounded" | "weak" | "abstained" | "unavailable";
