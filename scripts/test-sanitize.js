const assert = require("node:assert/strict");
const {
  getQuota,
  getRendererCodexDiagnostics,
  _sanitizeCandidatePath,
  _sanitizeDiagnosticForRenderer
} = require("../src/main/quota-service");

async function withEnv(updates, fn) {
  const previous = {};
  for (const key of Object.keys(updates)) {
    previous[key] = process.env[key];
    if (updates[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = updates[key];
    }
  }

  try {
    return await fn();
  } finally {
    for (const key of Object.keys(updates)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

function assertNotIncludes(value, needle, label) {
  if (!needle) return;
  assert.equal(String(value).includes(needle), false, label);
}

async function testRendererDiagnosticsAreSanitized() {
  await withEnv({ CODEX_CLI_PATH: "/private/company/tools/not-exist-codex" }, async () => {
    const diagnostics = getRendererCodexDiagnostics();
    const text = JSON.stringify(diagnostics);
    assertNotIncludes(text, "/private/company/tools/not-exist-codex", "renderer diagnostics leaked custom absolute path");
    assertNotIncludes(text, process.env.PATH, "renderer diagnostics leaked PATH");
    assert.ok(text.includes("/.../not-exist-codex"), "renderer diagnostics should include sanitized basename");
  });
}

async function testQuotaStartErrorIsSafe() {
  await withEnv({ CODEX_CLI_PATH: "codex-led-widget-missing-command-for-sanitize-test" }, async () => {
    try {
      await getQuota();
      throw new Error("getQuota unexpectedly succeeded");
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      assert.ok(message.includes("Failed to start Codex CLI."), "safe start error should be recognizable");
      assertNotIncludes(message, process.env.PATH, "safe start error leaked PATH");
      assertNotIncludes(message, process.env.HOME, "safe start error leaked HOME");
    }
  });
}

async function testDiagnosticStringSanitization() {
  const userProfile = "C:\\Users\\Alice";
  const localAppData = `${userProfile}\\AppData\\Local`;
  const text = await withEnv({ USERPROFILE: userProfile, LOCALAPPDATA: localAppData }, () =>
    _sanitizeDiagnosticForRenderer(
      [
        "Bearer abc.def.ghi",
        "token=secret-token",
        "api_key=secret-key",
        "/private/company/tools/not-exist-codex",
        `${userProfile}\\secret\\codex.exe`,
        "D:\\company\\tools\\codex.exe",
        `${localAppData}\\OpenAI\\Codex\\bin\\codex.exe`
      ].join("\n")
    )
  );

  assertNotIncludes(text, "abc.def.ghi", "Bearer token leaked");
  assertNotIncludes(text, "secret-token", "token query leaked");
  assertNotIncludes(text, "secret-key", "api key leaked");
  assertNotIncludes(text, "/private/company/tools/not-exist-codex", "POSIX custom absolute path leaked");
  assertNotIncludes(text, userProfile, "USERPROFILE path leaked");
  assertNotIncludes(text, "D:\\company\\tools\\codex.exe", "Windows custom absolute path leaked");
  assert.ok(text.includes("/.../not-exist-codex"), "POSIX custom path should keep sanitized basename");
  assert.ok(text.includes("...\\codex.exe") || text.includes("%USERPROFILE%"), "Windows path should be sanitized");
}

function testCandidatePathSanitization() {
  assert.equal(_sanitizeCandidatePath("/opt/homebrew/bin/codex"), "/opt/homebrew/bin/codex");
  assert.equal(_sanitizeCandidatePath("/private/company/tools/codex"), "/.../codex");
  assert.equal(_sanitizeCandidatePath("codex"), "codex");
}

(async () => {
  testCandidatePathSanitization();
  await testDiagnosticStringSanitization();
  await testRendererDiagnosticsAreSanitized();
  await testQuotaStartErrorIsSafe();
  console.log("sanitize tests passed");
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
