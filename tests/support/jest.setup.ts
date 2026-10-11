// Corre ANTES de cargar los módulos bajo prueba.
//
// Cualquier test que importe código de dominio arrastra `common/errors`, que
// usa tsyringe y exige este polyfill aunque el test no resuelva ninguna
// dependencia. Sin él, el import falla con un error que habla de metadatos y no
// de lo que el test estaba probando.
import "reflect-metadata";
