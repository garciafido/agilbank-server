"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const readline = require('readline');
function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question + ' (yes/no): ', answer => {
            rl.close();
            const normalized = answer.toLowerCase().trim();
            resolve(normalized === 'yes');
        });
    });
}
// Si se ejecuta en modo no interactivo (como podría ser en algunos entornos CI o Docker)
// podemos detectarlo y proporcionar una salida automática
function isInteractiveEnvironment() {
    return process.stdout.isTTY && process.env.DOCKER_AUTO_CONFIRM !== 'true';
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const question = process.argv[2];
        let confirmed = false;
        if (!isInteractiveEnvironment()) {
            // En entorno no interactivo, podemos aceptar automáticamente
            console.log(`${question} (Auto-confirmed in non-interactive environment)`);
            confirmed = true;
        }
        else {
            confirmed = yield ask(question);
        }
        if (confirmed) {
            process.exit(0); // Éxito
        }
        else {
            console.log('Operation cancelled');
            process.exit(1); // Cancelado
        }
    });
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=confirm.js.map