const path = require("node:path");

function getCodexExecutableCandidates() {
  const candidates = [];

  if (process.env.CODEX_CLI_PATH) {
    candidates.push(process.env.CODEX_CLI_PATH);
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    if (localAppData) {
      candidates.push(path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"));
    }
    candidates.push("codex");
  } else if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/usr/bin/codex", "codex");
  } else {
    candidates.push("/usr/local/bin/codex", "/usr/bin/codex", "codex");
  }

  return candidates.filter(Boolean);
}

async function openCodexAppOrExecutable(shell) {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    if (localAppData) {
      const codexExe = path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe");
      const result = await shell.openPath(codexExe);
      if (!result) return;
    }
    await shell.openExternal("https://chatgpt.com/codex");
    return;
  }

  await shell.openExternal("https://chatgpt.com/codex");
}

module.exports = { getCodexExecutableCandidates, openCodexAppOrExecutable };
