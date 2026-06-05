const { getQuota, getFullCodexDiagnostics } = require("../src/main/quota-service");

(async () => {
  try {
    console.log("Codex diagnostics:");
    console.log(JSON.stringify(getFullCodexDiagnostics(), null, 2));
    console.log("Quota:");
    const result = await getQuota({ debug: true });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
})();
