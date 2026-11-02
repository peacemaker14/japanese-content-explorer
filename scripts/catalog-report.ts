import "./env";
import { closePool } from "../src/db/client";
import { catalogReport } from "../src/lib/curation";
async function main() {
  console.log(JSON.stringify(await catalogReport(), null, 2));
}
main()
  .catch(() => {
    console.error("Catalog report failed; check database configuration.");
    process.exitCode = 1;
  })
  .finally(closePool);
