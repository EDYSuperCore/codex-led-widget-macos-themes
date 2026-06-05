const i18n = {
  zh: {
    brandName: "Codex 额度",
    loading: "读取中",
    failed: "读取失败",
    remaining: "剩余",
    primary: "5小时窗口",
    secondary: "7天窗口",
    plan: "计划",
    ready: "额度已更新",
    reading: "正在读取 Codex 额度...",
    diagnosticHint: "Codex CLI 启动失败，请查看控制台诊断信息",
    noQuotaWindow: "未返回额度窗口",
    theme: "主题",
    reset: "重置",
    used: "已用",
    unknown: "未知",
    pinned: "取消置顶",
    unpinned: "置顶"
  },
  en: {
    brandName: "Codex Quota",
    loading: "Loading",
    failed: "Failed",
    remaining: "Left",
    primary: "5h window",
    secondary: "7d window",
    plan: "Plan",
    ready: "Quota updated",
    reading: "Reading Codex quota...",
    diagnosticHint: "Codex CLI failed to start. Check console diagnostics.",
    noQuotaWindow: "No quota window returned",
    theme: "Theme",
    reset: "Reset",
    used: "Used",
    unknown: "Unknown",
    pinned: "Unpin",
    unpinned: "Pin"
  }
};

let language = "zh";
let isPinned = true;
let latestQuota = null;
let latestError = null;
let currentRemainingPercent = null;
let waveRafId = null;
let wavePhase = Math.random() * Math.PI * 2;
let waveSpeed = 0.018 + Math.random() * 0.01;
let waveTilt = 0;

const $ = (id) => document.getElementById(id);

const elements = {
  brandName: $("brandName"),
  stateText: $("stateText"),
  trafficLight: $("trafficLight"),
  langBtn: $("langBtn"),
  themeBtn: $("themeBtn"),
  pinBtn: $("pinBtn"),
  refreshBtn: $("refreshBtn"),
  minimizeBtn: $("minimizeBtn"),
  closeBtn: $("closeBtn"),
  remaining: $("remaining"),
  remainingLabel: $("remainingLabel"),
  primaryLabel: $("primaryLabel"),
  primaryText: $("primaryText"),
  secondaryLabel: $("secondaryLabel"),
  secondaryText: $("secondaryText"),
  planLabel: $("planLabel"),
  planText: $("planText"),
  statusDot: $("statusDot"),
  statusText: $("statusText"),
  liquidMeter: $("liquidMeter"),
  liquidFill: $("liquidFill")
};

function t(key) {
  return i18n[language][key];
}

function setState(state, bodyState = state) {
  document.body.dataset.state = bodyState;
  elements.trafficLight.className = `traffic-light ${state}`;
  elements.statusDot.className = `status-dot ${state}`;
}

function setUnknownQuota() {
  setState("loading", "unknown");
  currentRemainingPercent = 0;
  elements.stateText.textContent = t("unknown");
  elements.remaining.textContent = "--%";
  elements.primaryText.textContent = "--";
  elements.secondaryText.textContent = "--";
  elements.statusText.textContent = t("noQuotaWindow");
  elements.statusText.title = t("noQuotaWindow");
  elements.liquidFill.style.height = "0%";
}

function setLoading() {
  latestError = null;
  setState("loading");
  elements.stateText.textContent = t("loading");
  elements.statusText.textContent = t("reading");
  elements.statusText.title = t("reading");
  elements.remaining.textContent = "--%";
  elements.liquidFill.style.height = "18%";
}

function quotaState(percent) {
  if (percent >= 10) return "good";
  if (percent > 0) return "warning";
  return "danger";
}

function formatReset(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatWindow(window) {
  if (!window) return "--";
  return `${t("used")} ${window.usedPercent ?? 0}% · ${formatReset(window.resetsAt)}`;
}

function formatPlan(value) {
  if (!value) return t("unknown");
  const plan = String(value);
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;
}

function randomizeWave(remainingPercent) {
  const percent = Number(remainingPercent);
  if (Number.isFinite(percent)) {
    currentRemainingPercent = percent;
  }

  waveSpeed = 0.014 + Math.random() * 0.014;
  waveTilt = (Math.random() - 0.5) * 2.0;
  startLiquidWave();
}

function startLiquidWave() {
  if (waveRafId) return;

  const path = document.getElementById("liquidWavePath");
  if (!path) return;

  const tick = () => {
    updateLiquidWavePath(path);
    waveRafId = requestAnimationFrame(tick);
  };

  waveRafId = requestAnimationFrame(tick);
}

function updateLiquidWavePath(path) {
  const percent = Number.isFinite(currentRemainingPercent) ? currentRemainingPercent : 0;
  const safePercent = Math.max(0, Math.min(100, percent));
  const baseY = 18;
  const amp = safePercent > 85 ? 2.8 : safePercent < 12 ? 3.2 : 4.8;

  wavePhase += waveSpeed;

  const p0 = baseY + Math.sin(wavePhase) * amp + waveTilt;
  const p1 = baseY + Math.sin(wavePhase + 1.4) * amp;
  const p2 = baseY + Math.sin(wavePhase + 2.8) * amp - waveTilt;
  const p3 = baseY + Math.sin(wavePhase + 4.2) * amp;
  const p4 = baseY + Math.sin(wavePhase + 5.6) * amp;
  const d = [
    `M 0 ${p0.toFixed(2)}`,
    `C 35 ${p1.toFixed(2)}, 65 ${p2.toFixed(2)}, 100 ${p3.toFixed(2)}`,
    `S 165 ${p4.toFixed(2)}, 200 ${p0.toFixed(2)}`,
    "L 200 120",
    "L 0 120",
    "Z"
  ].join(" ");

  path.setAttribute("d", d);
}

function renderStaticLabels() {
  elements.brandName.textContent = t("brandName");
  elements.remainingLabel.textContent = t("remaining");
  elements.primaryLabel.textContent = t("primary");
  elements.secondaryLabel.textContent = t("secondary");
  elements.planLabel.textContent = t("plan");
  elements.langBtn.textContent = language === "zh" ? "EN" : "中";
  elements.themeBtn.title = t("theme");
  elements.themeBtn.setAttribute("aria-label", t("theme"));
  elements.pinBtn.title = isPinned ? t("pinned") : t("unpinned");
  elements.pinBtn.setAttribute("aria-label", elements.pinBtn.title);
}

function restoreStatus() {
  if (latestQuota) {
    renderQuota(latestQuota);
  } else if (latestError) {
    renderError(latestError);
  } else {
    setLoading();
  }
}

function showThemeNotice(theme) {
  if (!theme) return;
  const message = `${t("theme")}: ${theme.name}`;
  elements.statusText.textContent = message;
  elements.statusText.title = message;
  clearTimeout(showThemeNotice.timer);
  showThemeNotice.timer = setTimeout(restoreStatus, 2000);
}

function renderQuota(quota) {
  latestQuota = quota;
  latestError = null;

  if (quota.remainingPercent == null) {
    setUnknownQuota();
    elements.planText.textContent = formatPlan(quota.planType);
    return;
  }

  const percent = Number.isFinite(Number(quota.remainingPercent)) ? Math.round(Number(quota.remainingPercent)) : 0;
  const state = quotaState(percent);
  setState(state);

  elements.stateText.textContent = state === "good" ? "OK" : state === "warning" ? "LOW" : "EMPTY";
  elements.remaining.textContent = `${percent}%`;
  elements.primaryText.textContent = formatWindow(quota.primary);
  elements.secondaryText.textContent = formatWindow(quota.secondary);
  elements.planText.textContent = formatPlan(quota.planType);
  const statusMessage = `${t("ready")} · ${new Date(quota.fetchedAt || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
  elements.statusText.textContent = statusMessage;
  elements.statusText.title = statusMessage;
  elements.liquidFill.style.height = `${Math.max(8, Math.min(92, percent))}%`;
  randomizeWave(percent);
}

function renderError(error) {
  latestQuota = null;
  latestError = error;
  setState("danger", "error");
  elements.stateText.textContent = t("failed");
  elements.remaining.textContent = "--%";
  elements.primaryText.textContent = "--";
  elements.secondaryText.textContent = "--";
  elements.planText.textContent = "--";
  const errorMessage = t("diagnosticHint");
  elements.statusText.textContent = errorMessage;
  elements.statusText.title = error?.message || String(error) || t("failed");
  elements.liquidFill.style.height = "10%";
}

async function logQuotaErrorDiagnostics(error) {
  console.error("Codex quota read failed:", error);
  try {
    const diagnostics = await window.codexQuota.getDiagnostics();
    console.log("Codex diagnostics:", diagnostics);
  } catch (diagnosticsError) {
    console.error("Failed to load Codex diagnostics:", diagnosticsError);
  }
}

async function refreshQuota() {
  setLoading();
  try {
    const quota = await window.codexQuota.getQuota();
    renderQuota(quota);
  } catch (error) {
    logQuotaErrorDiagnostics(error);
    renderError(error);
  }
}

async function syncPinState() {
  try {
    isPinned = await window.codexQuota.getAlwaysOnTop();
    elements.pinBtn.classList.toggle("active", isPinned);
    renderStaticLabels();
  } catch {
    isPinned = true;
  }
}

function rerenderLanguage() {
  renderStaticLabels();
  if (latestQuota) {
    renderQuota(latestQuota);
  } else if (latestError) {
    renderError(latestError);
  } else {
    setLoading();
  }
}

function bindEvents() {
  elements.refreshBtn.addEventListener("click", refreshQuota);
  elements.langBtn.addEventListener("click", () => {
    language = language === "zh" ? "en" : "zh";
    rerenderLanguage();
  });
  elements.themeBtn.addEventListener("click", () => {
    const theme = window.codexThemeManager.nextTheme();
    randomizeWave(latestQuota?.remainingPercent);
    showThemeNotice(theme);
  });
  elements.pinBtn.addEventListener("click", async () => {
    isPinned = await window.codexQuota.setAlwaysOnTop(!isPinned);
    elements.pinBtn.classList.toggle("active", isPinned);
    renderStaticLabels();
  });
  elements.minimizeBtn.addEventListener("click", () => window.codexQuota.minimize());
  elements.closeBtn.addEventListener("click", () => window.codexQuota.close());

  window.codexQuota.onRefresh(refreshQuota);
  window.codexQuota.onThemeSet((themeId) => {
    const theme = window.codexThemeManager.applyTheme(themeId);
    randomizeWave(latestQuota?.remainingPercent);
    showThemeNotice(theme);
  });
  window.codexQuota.onAlwaysOnTopChanged((value) => {
    isPinned = Boolean(value);
    elements.pinBtn.classList.toggle("active", isPinned);
    renderStaticLabels();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  window.codexThemeManager.loadSavedTheme();
  startLiquidWave();
  renderStaticLabels();
  bindEvents();
  await syncPinState();
  refreshQuota();
});
