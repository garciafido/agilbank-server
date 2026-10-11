import "reflect-metadata";
import { runSeedManager } from "./seedManager";

runSeedManager()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
