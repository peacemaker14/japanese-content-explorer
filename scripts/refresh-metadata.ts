import "./env";
import { closePool } from "../src/db/client";
import { refreshMetadata } from "../src/lib/metadata-maintenance";
refreshMetadata()
  .then((result) => {
    console.log(JSON.stringify(result));
    if (!result.skipped && result.status === "partial") process.exitCode = 1;
  })
  .catch(() => {
    console.error(
      "Database maintenance failed; check configuration and connectivity.",
    );
    process.exitCode = 1;
  })
  .finally(closePool);
