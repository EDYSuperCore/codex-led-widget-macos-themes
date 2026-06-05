const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { getCodexExecutableCandidates } = require("./platform");

const DEFAULT_TIMEOUT_MS = 12000;

function resolveCodexPath() {
  const codexCliPath = process.env.CODEX_CLI_PATH;
  if (codexCliPath) {
    if (!path.isAbsolute(codexCliPath)) {
      return codexCliPath;
    }
    if (fs.existsSync(codexCliPath)) {
      return codexCliPath;
    }
  }

  const candidates = getCodexExecutableCandidates();
  let commandFallback = "codex";

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      commandFallback = candidate;
    }
  }

  return commandFallback;
}

async function getQuota(options = {}) {
  const response = await requestRateLimits(options);
  const snapshot =
    response.rateLimitsByLimitId?.codex ||
    response.rateLimits ||
    firstSnapshot(response.rateLimitsByLimitId);

  if (!snapshot) {
    const keys = response && typeof response === "object" ? Object.keys(response) : [];
    throw new Error(`Codex did not return a rate-limit snapshot. Response keys: ${keys.join(", ") || "(none)"}`);
  }

  return normalizeSnapshot(snapshot);
}

function firstSnapshot(map) {
  if (!map || typeof map !== "object") return null;
  const firstKey = Object.keys(map)[0];
  return firstKey ? map[firstKey] : null;
}

function normalizeSnapshot(snapshot) {
  const primary = normalizeWindow(snapshot.primary);
  const secondary = normalizeWindow(snapshot.secondary);
  const activeWindow = primary || secondary;

  return {
    limitId: snapshot.limitId || "codex",
    limitName: snapshot.limitName || "Codex",
    planType: snapshot.planType || "unknown",
    reachedType: snapshot.rateLimitReachedType || null,
    credits: snapshot.credits || null,
    primary,
    secondary,
    remainingPercent: activeWindow ? activeWindow.remainingPercent : null,
    usedPercent: activeWindow ? activeWindow.usedPercent : null,
    resetsAt: activeWindow ? activeWindow.resetsAt : null,
    fetchedAt: new Date().toISOString()
  };
}

function normalizeWindow(window) {
  if (!window) return null;
  const usedPercent = clampPercent(Number(window.usedPercent || 0));
  return {
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowDurationMins: window.windowDurationMins ?? null,
    resetsAt: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null
  };
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function requestRateLimits(options = {}) {
  const debug = Boolean(options.debug);
  const codexPath = resolveCodexPath();
  const child = spawn(codexPath, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: buildCodexChildEnv()
  });

  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map();

  const cleanup = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
    }
    pending.clear();
    if (!child.killed) child.kill();
  };

  const send = (method, params) => {
    const id = nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, DEFAULT_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
    });
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      handleMessage(line, pending);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      cleanup();
      reject(new Error(debug ? formatStartErrorForDebug(error, codexPath) : formatStartErrorForRenderer(error, codexPath)));
    });

    child.once("exit", (code) => {
      if (pending.size > 0) {
        cleanup();
        reject(
          new Error(
            debug
              ? formatAppServerExitErrorForDebug({ codexPath, code, stderr })
              : formatAppServerExitErrorForRenderer({ codexPath, code, stderr })
          )
        );
      }
    });

    (async () => {
      try {
        await send("initialize", {
          clientInfo: {
            name: "codex-led-widget",
            title: "Codex LED Widget",
            version: "0.1.0"
          },
          capabilities: null
        });
        const result = await send("account/rateLimits/read");
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        const message = formatRequestError({ error, codexPath, stderr, debug });
        reject(new Error(message));
      }
    })();
  });
}

function buildCodexChildEnv() {
  const env = { ...process.env };
  if (process.platform === "win32") return env;

  const additions =
    process.platform === "darwin"
      ? ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
      : ["/usr/local/bin", "/usr/bin", "/bin"];
  env.PATH = [...additions, process.env.PATH || ""].filter(Boolean).join(path.delimiter);
  return env;
}

function getCodexCliPathEnvState() {
  const value = process.env.CODEX_CLI_PATH || "";
  if (!value) {
    return {
      hasCodexCliPathEnv: false,
      codexCliPathEnvValid: false,
      ignoredCodexCliPathReason: null
    };
  }

  if (!path.isAbsolute(value)) {
    return {
      hasCodexCliPathEnv: true,
      codexCliPathEnvValid: true,
      ignoredCodexCliPathReason: null
    };
  }

  if (fs.existsSync(value)) {
    return {
      hasCodexCliPathEnv: true,
      codexCliPathEnvValid: true,
      ignoredCodexCliPathReason: null
    };
  }

  return {
    hasCodexCliPathEnv: true,
    codexCliPathEnvValid: false,
    ignoredCodexCliPathReason: "CODEX_CLI_PATH points to an absolute path that does not exist."
  };
}

function getEffectivePath() {
  const env = buildCodexChildEnv();
  return env.PATH || env.Path || "";
}

function getCodexDiagnostics(options = {}) {
  const full = Boolean(options.full);
  const effectivePath = getEffectivePath();
  const codexCliPathState = getCodexCliPathEnvState();
  const diagnostics = {
    platform: process.platform,
    arch: process.arch,
    codexPath: full ? resolveCodexPath() : sanitizeCandidatePath(resolveCodexPath()),
    candidates: getCodexExecutableCandidates().map((candidate) => ({
      path: full ? candidate : sanitizeCandidatePath(candidate),
      exists: path.isAbsolute(candidate) ? fs.existsSync(candidate) : null
    })),
    hasHomebrewPath: effectivePath.split(path.delimiter).includes("/opt/homebrew/bin"),
    hasUsrLocalPath: effectivePath.split(path.delimiter).includes("/usr/local/bin"),
    ...codexCliPathState
  };

  if (full) {
    diagnostics.envPath = process.env.PATH || "";
    diagnostics.effectivePath = effectivePath;
    diagnostics.codexCliPathEnv = process.env.CODEX_CLI_PATH || "";
  }

  return diagnostics;
}

function sanitizeCandidatePath(candidate) {
  if (!candidate || !path.isAbsolute(candidate)) return candidate;
  const allowedPaths = new Set(["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/usr/bin/codex"]);
  if (allowedPaths.has(candidate)) return candidate;

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const normalizedCandidate = path.normalize(candidate).toLowerCase();
    const normalizedWindowsCodex = path
      .join(localAppData, "OpenAI", "Codex", "bin", "codex.exe")
      .toLowerCase();
    if (normalizedCandidate === normalizedWindowsCodex) {
      return "%LOCALAPPDATA%/OpenAI/Codex/bin/codex.exe";
    }
  }

  const homeDir = process.env.HOME;
  if (homeDir && candidate.startsWith(`${homeDir}${path.sep}`)) {
    return `~/${candidate.slice(homeDir.length + 1)}`;
  }

  return `/.../${path.basename(candidate)}`;
}

function getFullCodexDiagnostics() {
  return getCodexDiagnostics({ full: true });
}

function getRendererCodexDiagnostics() {
  return {
    ...getCodexDiagnostics({ full: false })
  };
}

function formatStartErrorForRenderer(error, codexPath) {
  return [
    "Failed to start Codex CLI.",
    `platform: ${process.platform}`,
    `errorCode: ${error.code || "unknown"}`,
    `message: ${sanitizeDiagnosticForRenderer(error.message)}`,
    `codexPath: ${sanitizeCandidatePath(codexPath)}`,
    "Please make sure Codex CLI is installed and `codex --version` works, or set CODEX_CLI_PATH."
  ].join("\n");
}

function formatStartErrorForDebug(error, codexPath) {
  return [
    "Failed to start Codex CLI.",
    `platform: ${process.platform}`,
    `arch: ${process.arch}`,
    `codexPath: ${codexPath}`,
    `PATH: ${process.env.PATH || ""}`,
    `effectivePATH: ${getEffectivePath()}`,
    `errorCode: ${error.code || "unknown"}`,
    `message: ${error.message}`,
    "candidates:",
    JSON.stringify(getCodexDiagnostics({ full: true }).candidates, null, 2)
  ].join("\n");
}

function formatAppServerExitErrorForRenderer({ codexPath, code, stderr }) {
  return [
    "Codex app-server exited before returning quota.",
    `Codex path: ${sanitizeCandidatePath(codexPath)}`,
    `Exit code: ${code ?? "unknown"}`,
    `Stderr: ${safeStderrSummary(stderr)}`
  ].join("\n");
}

function formatAppServerExitErrorForDebug({ codexPath, code, stderr }) {
  return [
    "Codex app-server exited before returning quota data.",
    `Codex path: ${codexPath}`,
    `Exit code: ${code ?? "unknown"}`,
    `Stderr: ${sanitizeDiagnostic(stderr.trim()) || "(empty)"}`
  ].join("\n");
}

function formatRequestError({ error, codexPath, stderr, debug }) {
  if (debug) {
    return stderr
      ? `${error.message}\nCodex path: ${codexPath}\nCodex stderr:\n${sanitizeDiagnostic(stderr.trim())}`
      : error.message;
  }

  return stderr
    ? `${sanitizeDiagnosticForRenderer(error.message)}\nCodex path: ${sanitizeCandidatePath(codexPath)}\nCodex stderr:\n${safeStderrSummary(stderr)}`
    : sanitizeDiagnosticForRenderer(error.message);
}

function sanitizeDiagnostic(value) {
  return String(value)
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
    .replace(/(token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]");
}

function sanitizeDiagnosticForRenderer(value) {
  let sanitized = sanitizeDiagnostic(value);
  const homeDir = process.env.HOME;
  if (homeDir) {
    sanitized = sanitized.split(homeDir).join("~");
  }

  const userProfile = process.env.USERPROFILE;
  if (userProfile) {
    sanitized = sanitized.split(userProfile).join("%USERPROFILE%");
  }

  sanitized = sanitized.replace(/[A-Za-z]:\\[^\s:;,()"'`]+(?:\\[^\s:;,()"'`]+)+/g, (match) => {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData && match.startsWith(localAppData)) {
      return match.split(localAppData).join("%LOCALAPPDATA%");
    }
    return `...\\${path.win32.basename(match)}`;
  });

  const allowedPaths = new Set(["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/usr/bin/codex"]);
  sanitized = sanitized.replace(/\/[^\s:;,()"'`]+(?:\/[^\s:;,()"'`]+)+/g, (match) => {
    if (allowedPaths.has(match)) return match;
    return `/.../${path.basename(match)}`;
  });

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    sanitized = sanitized.split(localAppData).join("%LOCALAPPDATA%");
  }

  return sanitized;
}

function safeStderrSummary(stderr) {
  const sanitized = sanitizeDiagnosticForRenderer(String(stderr || "").trim());
  if (!sanitized) return "(empty)";
  return sanitized.length > 500 ? `${sanitized.slice(0, 500)}...` : sanitized;
}

function handleMessage(line, pending) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(message, "id")) return;
  const request = pending.get(message.id);
  if (!request) return;

  clearTimeout(request.timer);
  pending.delete(message.id);

  if (message.error) {
    request.reject(new Error(message.error.message || JSON.stringify(message.error)));
  } else {
    request.resolve(message.result);
  }
}

module.exports = {
  getQuota,
  getCodexDiagnostics,
  getFullCodexDiagnostics,
  getRendererCodexDiagnostics,
  normalizeSnapshot,
  buildCodexChildEnv,
  _sanitizeCandidatePath: sanitizeCandidatePath,
  _sanitizeDiagnosticForRenderer: sanitizeDiagnosticForRenderer
};
