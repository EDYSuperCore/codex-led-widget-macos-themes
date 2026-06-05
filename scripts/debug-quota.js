const { getQuota, getCodexDiagnostics } = require("../src/main/quota-service");

(async () => {
  try {
    console.log("Codex diagnostics:");
    console.log(JSON.stringify(getCodexDiagnostics(), null, 2));
    console.log("Quota:");
    const result = await getQuota();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
})();
