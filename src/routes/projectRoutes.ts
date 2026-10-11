// Las rutas HTTP propias de este proyecto.
//
// El asiento se emite en cada corrida, vacío. Lo que el proyecto agregue acá
// SOBREVIVE: si toca este archivo, la próxima regeneración conflictúa y el
// conflicto es el aviso de que el contrato de arriba cambió. Editar `server.ts`
// para montar una ruta parece más directo y no lo es — ese archivo es del
// generador y el conflicto cae en medio de código que no es del proyecto.
//
// Se monta bajo /api, DESPUÉS del limitador general y de las rutas del
// framework. Dos consecuencias que conviene tener presentes:
//
//   - El rate limit general ya se aplicó: una ruta que necesite otro techo tiene
//     que montar el suyo.
//   - Una ruta con el mismo path que una del framework no la reemplaza: la del
//     framework contesta primero. Los prefijos propios evitan la sorpresa.
//
// Lo que NO va acá: nada que necesite correr antes de la autenticación o de los
// limitadores. Eso pide un punto de extensión más temprano, y todavía no existe.

import { Router } from "express";

const router = Router();

export default router;
