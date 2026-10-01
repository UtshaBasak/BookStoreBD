// Sets the light or dark theme before the page is painted, so a dark page never
// flashes white while the app loads. Kept tiny and in its own file: the
// Content Security Policy allows no inline scripts. See src/utils/theme.ts.
(function () {
  try {
    var choice = localStorage.getItem('theme');
    var dark = choice === 'dark' || (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (dark) document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0f0d18');
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
