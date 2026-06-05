const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { getCodexExecutableCandidates } = require("./platform");

const DEFAULT_TIMEOUT_MS = 12000;

function resolveCodexPath() {
  if (process.env.CODEX_CLI_PATH && fs.existsSync(process.env.CODEX_CLI_PATH)) {
    return process.env.CODEX_CLI_PATH;
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

async function getQuota() {
  const response = await requestRateLimits();
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

function requestRateLimits() {
  const codexPath = resolveCodexPath();
  const childEnv = {
    ...process.env,
    PATH: [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      process.env.PATH || ""
    ].join(":")
  };
  const child = spawn(codexPath, ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: childEnv
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
      reject(new Error(formatStartError({ codexPath, error })));
    });

    child.once("exit", (code) => {
      if (pending.size > 0) {
        cleanup();
        reject(new Error(formatAppServerExitError({ codexPath, code, stderr })));
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
        const message = stderr
          ? `${error.message}\nCodex path: ${codexPath}\nCodex stderr:\n${sanitizeDiagnostic(stderr.trim())}`
          : error.message;
        reject(new Error(message));
      }
    })();
  });
}

function getCodexDiagnostics() {
  return {
    platform: process.platform,
    arch: process.arch,
    envPath: process.env.PATH || "",
    codexPath: resolveCodexPath(),
    candidates: getCodexExecutableCandidates().map((candidate) => ({
      path: candidate,
      exists: path.isAbsolute(candidate) ? fs.existsSync(candidate) : null
    }))
  };
}

function formatStartError({ codexPath, error }) {
  return [
    "Failed to start Codex CLI.",
    `codexPath: ${codexPath}`,
    `platform: ${process.platform}`,
    `PATH: ${process.env.PATH || ""}`,
    `errorCode: ${error.code || "unknown"}`,
    `message: ${error.message}`
  ].join("\n");
}

function formatAppServerExitError({ codexPath, code, stderr }) {
  return [
    "Codex app-server exited before returning quota data.",
    `Codex path: ${codexPath}`,
    `Exit code: ${code ?? "unknown"}`,
    `Stderr: ${sanitizeDiagnostic(stderr.trim()) || "(empty)"}`
  ].join("\n");
}

function sanitizeDiagnostic(value) {
  return String(value)
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer [redacted]")
    .replace(/(token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[redacted]");
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

module.exports = { getQuota, getCodexDiagnostics, normalizeSnapshot };
