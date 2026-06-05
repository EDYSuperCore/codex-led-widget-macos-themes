(function () {
  const STORAGE_KEY = "codex-led-widget.theme";
  const FALLBACK_THEME_ID = "liquid-dark";

  function getThemes() {
    return Array.isArray(window.CODEX_THEMES) ? window.CODEX_THEMES : [];
  }

  function findTheme(themeId) {
    return getThemes().find((theme) => theme.id === themeId) || getThemes().find((theme) => theme.id === FALLBACK_THEME_ID);
  }

  function getCurrentThemeId() {
    return document.body.dataset.theme || FALLBACK_THEME_ID;
  }

  function applyTheme(themeId) {
    const theme = findTheme(themeId) || getThemes()[0];
    if (!theme) return null;

    Object.entries(theme.vars || {}).forEach(([name, value]) => {
      document.documentElement.style.setProperty(name, value);
    });
    document.body.dataset.theme = theme.id;
    localStorage.setItem(STORAGE_KEY, theme.id);
    return theme;
  }

  function nextTheme() {
    const themes = getThemes();
    if (themes.length === 0) return null;

    const currentIndex = themes.findIndex((theme) => theme.id === getCurrentThemeId());
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % themes.length : 0;
    return applyTheme(themes[nextIndex].id);
  }

  function loadSavedTheme() {
    return applyTheme(localStorage.getItem(STORAGE_KEY) || FALLBACK_THEME_ID);
  }

  window.codexThemeManager = {
    getThemes,
    getCurrentThemeId,
    applyTheme,
    nextTheme,
    loadSavedTheme
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSavedTheme, { once: true });
  } else {
    loadSavedTheme();
  }
})();
