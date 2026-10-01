/**
 * Copies text, and says whether it worked.
 *
 * The Clipboard API first. It needs a secure context and, in some browsers,
 * permission; where it is missing or refused, a selected off-screen textarea
 * and the old copy command still work almost everywhere.
 */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused: try the old way below.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(area);
    area.select();
    // Deprecated, but the only fallback there is for an old or locked-down browser.
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
};
