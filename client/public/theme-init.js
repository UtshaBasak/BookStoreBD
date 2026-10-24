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

// The page's language too, before the first paint, so a Bangla reader's
// screen reader and fonts are right from the start. See src/utils/language.ts.
(function () {
  try {
    var chosen = localStorage.getItem('language');
    var lang = chosen === 'bn' || chosen === 'en' ? chosen : 'en';
    if (chosen !== 'bn' && chosen !== 'en') {
      var listed = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
      for (var i = 0; i < listed.length; i += 1) {
        var base = String(listed[i]).toLowerCase().split('-')[0];
        if (base === 'bn' || base === 'en') {
          lang = base;
          break;
        }
      }
    }
    document.documentElement.lang = lang;
  } catch (e) {
    /* stays as the HTML says */
  }
})();
