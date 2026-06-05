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
    showThemeNotice(window.codexThemeManager.nextTheme());
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
    showThemeNotice(window.codexThemeManager.applyTheme(themeId));
  });
  window.codexQuota.onAlwaysOnTopChanged((value) => {
    isPinned = Boolean(value);
    elements.pinBtn.classList.toggle("active", isPinned);
    renderStaticLabels();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  window.codexThemeManager.loadSavedTheme();
  renderStaticLabels();
  bindEvents();
  await syncPinState();
  refreshQuota();
});
