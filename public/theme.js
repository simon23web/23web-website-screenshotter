(() => {
  const key = '23web-theme';
  const device = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const stored = localStorage.getItem(key);
    if (['light', 'dark', 'system'].includes(stored)) preference = stored;
  } catch { /* Device preference still works when storage is unavailable. */ }
  function apply() {
    const theme = preference === 'system' ? (device.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0d0f11' : '#f7f8fa';
  }
  apply();
  device.addEventListener('change', () => { if (preference === 'system') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('theme');
    selector.value = preference;
    selector.addEventListener('change', () => {
      preference = selector.value;
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
    window.addEventListener('storage', event => {
      if (event.key !== key && event.key !== null) return;
      preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : 'system';
      selector.value = preference;
      apply();
    });
  });
})();
