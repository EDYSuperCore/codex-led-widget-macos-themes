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
    refreshing: "正在刷新额度...",
    refreshingAuto: "后台刷新额度...",
    refreshingReset: "额度窗口已重置，正在更新...",
    refreshFailedStale: "刷新失败，已保留上次结果",
    refreshFailedStaleAuto: "后台刷新失败，已保留上次结果",
    refreshFailedStaleReset: "重置后刷新失败，已保留上次结果",
    diagnosticHint: "Codex CLI 启动失败，请查看控制台诊断信息",
    noQuotaWindow: "未返回额度窗口",
    theme: "主题",
    refresh: "刷新",
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
    refreshing: "Updating quota...",
    refreshingAuto: "Refreshing quota in background...",
    refreshingReset: "Quota window reset, updating...",
    refreshFailedStale: "Refresh failed, keeping last result",
    refreshFailedStaleAuto: "Background refresh failed, keeping last result",
    refreshFailedStaleReset: "Refresh after reset failed, keeping last result",
    diagnosticHint: "Codex CLI failed to start. Check console diagnostics.",
    noQuotaWindow: "No quota window returned",
    theme: "Theme",
    refresh: "Refresh",
    reset: "Reset",
    used: "Used",
    unknown: "Unknown",
    pinned: "Unpin",
    unpinned: "Pin"
  }
};

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RESET_REFRESH_DELAY_MS = 10 * 1000;
const MIN_RESET_REFRESH_DELAY_MS = 15 * 1000;

let language = "zh";
let isPinned = true;
let lastQuota = null;
let latestError = null;
let isRefreshing = false;
let hasLoadedQuota = false;
let autoRefreshTimerId = null;
let resetRefreshTimerId = null;
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

function setStatusText(message) {
  elements.statusText.textContent = message;
  elements.statusText.title = message;
}

function setRefreshButtonLoading(value) {
  elements.refreshBtn.disabled = Boolean(value);
  elements.refreshBtn.classList.toggle("loading", Boolean(value));
  const label = value ? t("refreshing") : t("refresh");
  elements.refreshBtn.title = label;
  elements.refreshBtn.setAttribute("aria-label", label);
}

function loadingMessageForReason(reason) {
  if (reason === "auto") return t("refreshingAuto");
  if (reason === "reset") return t("refreshingReset");
  if (reason === "initial") return t("reading");
  return t("refreshing");
}

function staleErrorMessageForReason(reason) {
  if (reason === "auto") return t("refreshFailedStaleAuto");
  if (reason === "reset") return t("refreshFailedStaleReset");
  return t("refreshFailedStale");
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

function renderEmptyLoadingState() {
  latestError = null;
  setState("loading");
  elements.stateText.textContent = t("loading");
  setStatusText(t("reading"));
  elements.remaining.textContent = "--%";
  elements.liquidFill.style.height = "18%";
}

function renderLoading({ preserveData = false, reason = "manual" } = {}) {
  document.body.dataset.state = "loading";

  if (preserveData && lastQuota) {
    elements.statusDot.className = "status-dot loading";
    setStatusText(loadingMessageForReason(reason));
    setRefreshButtonLoading(true);
    return;
  }

  renderEmptyLoadingState();
  setRefreshButtonLoading(true);
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

function startAutoRefreshTimer() {
  stopAutoRefreshTimer();

  autoRefreshTimerId = window.setInterval(() => {
    refreshQuota({ reason: "auto", preserveData: true });
  }, AUTO_REFRESH_INTERVAL_MS);
  console.debug("Codex quota auto refresh scheduled", { intervalMs: AUTO_REFRESH_INTERVAL_MS });
}

function stopAutoRefreshTimer() {
  if (autoRefreshTimerId) {
    window.clearInterval(autoRefreshTimerId);
    autoRefreshTimerId = null;
  }
}

function clearResetRefreshTimer() {
  if (resetRefreshTimerId) {
    window.clearTimeout(resetRefreshTimerId);
    resetRefreshTimerId = null;
  }
}

function getNextResetAt(quota) {
  const candidates = [quota?.primary?.resetsAt, quota?.secondary?.resetsAt, quota?.resetsAt].filter(Boolean);
  if (candidates.length === 0) return null;

  const now = Date.now();
  const futureTimes = candidates
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time) && time > now)
    .sort((a, b) => a - b);

  if (futureTimes.length === 0) return null;
  return new Date(futureTimes[0]).toISOString();
}

function scheduleResetRefresh(quota) {
  clearResetRefreshTimer();

  const resetsAt = getNextResetAt(quota);
  if (!resetsAt) return;

  const resetTime = new Date(resetsAt).getTime();
  if (!Number.isFinite(resetTime)) return;

  let delay = resetTime - Date.now() + RESET_REFRESH_DELAY_MS;
  if (delay < MIN_RESET_REFRESH_DELAY_MS) {
    delay = MIN_RESET_REFRESH_DELAY_MS;
  }

  resetRefreshTimerId = window.setTimeout(() => {
    resetRefreshTimerId = null;
    refreshQuota({ reason: "reset", preserveData: true });
  }, delay);

  console.debug("Codex quota reset refresh scheduled", { resetsAt, delayMs: delay });
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
  if (!isRefreshing) {
    elements.refreshBtn.title = t("refresh");
    elements.refreshBtn.setAttribute("aria-label", t("refresh"));
  }
  elements.pinBtn.title = isPinned ? t("pinned") : t("unpinned");
  elements.pinBtn.setAttribute("aria-label", elements.pinBtn.title);
}

function restoreStatus() {
  if (lastQuota) {
    renderQuota(lastQuota);
  } else if (latestError) {
    renderQuotaError(latestError);
  } else {
    renderEmptyLoadingState();
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
  lastQuota = quota;
  hasLoadedQuota = true;
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

function getErrorSummary(error) {
  const message = error?.message || String(error) || t("failed");
  return message.split("\n")[0].slice(0, 160);
}

function renderQuotaError(error, { preserveData = false, reason = "manual" } = {}) {
  latestError = error;

  if (preserveData && lastQuota) {
    document.body.dataset.state = "stale-error";
    elements.statusDot.className = "status-dot warning";
    setStatusText(`${staleErrorMessageForReason(reason)}: ${getErrorSummary(error)}`);
    return;
  }

  lastQuota = null;
  setState("danger", "error");
  elements.stateText.textContent = t("failed");
  elements.remaining.textContent = "--%";
  elements.primaryText.textContent = "--";
  elements.secondaryText.textContent = "--";
  elements.planText.textContent = "--";
  const errorMessage = t("diagnosticHint");
  elements.statusText.textContent = errorMessage;
  elements.statusText.title = getErrorSummary(error);
  elements.liquidFill.style.height = "0%";
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

async function refreshQuota(options = {}) {
  const { reason = "manual", preserveData = Boolean(lastQuota) } = options;
  if (isRefreshing) return;

  isRefreshing = true;
  renderLoading({ preserveData, reason });
  console.debug("Codex quota refresh started", { reason, preserveData });

  try {
    const quota = await window.codexQuota.getQuota();
    lastQuota = quota;
    hasLoadedQuota = true;
    renderQuota(quota);
    scheduleResetRefresh(quota);
  } catch (error) {
    logQuotaErrorDiagnostics(error);
    renderQuotaError(error, { preserveData: Boolean(lastQuota), reason });
  } finally {
    isRefreshing = false;
    setRefreshButtonLoading(false);
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
  if (lastQuota) {
    renderQuota(lastQuota);
  } else if (latestError) {
    renderQuotaError(latestError);
  } else {
    renderEmptyLoadingState();
  }
}

function bindEvents() {
  elements.refreshBtn.addEventListener("click", () => refreshQuota({ reason: "manual", preserveData: true }));
  elements.langBtn.addEventListener("click", () => {
    language = language === "zh" ? "en" : "zh";
    rerenderLanguage();
  });
  elements.themeBtn.addEventListener("click", () => {
    const theme = window.codexThemeManager.nextTheme();
    randomizeWave(lastQuota?.remainingPercent);
    showThemeNotice(theme);
  });
  elements.pinBtn.addEventListener("click", async () => {
    isPinned = await window.codexQuota.setAlwaysOnTop(!isPinned);
    elements.pinBtn.classList.toggle("active", isPinned);
    renderStaticLabels();
  });
  elements.minimizeBtn.addEventListener("click", () => window.codexQuota.minimize());
  elements.closeBtn.addEventListener("click", () => window.codexQuota.close());

  window.codexQuota.onRefresh(() => refreshQuota({ reason: "tray", preserveData: true }));
  window.codexQuota.onThemeSet((themeId) => {
    const theme = window.codexThemeManager.applyTheme(themeId);
    randomizeWave(lastQuota?.remainingPercent);
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
  refreshQuota({ reason: "initial", preserveData: false });
  startAutoRefreshTimer();
});

window.addEventListener("beforeunload", () => {
  stopAutoRefreshTimer();
  clearResetRefreshTimer();
});
