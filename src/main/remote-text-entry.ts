export function buildRemoteTextEntryScript(
  text: string,
  remoteTextEntrySelectors: readonly string[]
): string {
  return `(() => {
    const text = ${JSON.stringify(text)};
    const selectors = ${JSON.stringify(remoteTextEntrySelectors)};
    const sensitiveBoundary = (element) => {
      const form = element.closest('form');
      if (form === null) return false;
      const boundary = [
        form.getAttribute('action'),
        form.getAttribute('aria-label'),
        form.getAttribute('name'),
        form.id,
        form.className
      ].filter((value) => typeof value === 'string').join(' ');
      return /login|log-in|signin|sign-in|password|payment|checkout|billing/i.test(boundary);
    };
    const matchesDeclaredSelector = (element) => selectors.some((selector) => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
    const marked = document.querySelector('[data-nhd-tv-focus="true"]');
    const active = document.activeElement;
    const editable = active instanceof HTMLInputElement && matchesDeclaredSelector(active)
      ? active
      : marked instanceof HTMLInputElement && matchesDeclaredSelector(marked)
        ? marked
        : null;
    if (
      !(editable instanceof HTMLInputElement) ||
      !['search', 'text'].includes(editable.type) ||
      editable.disabled ||
      editable.readOnly ||
      sensitiveBoundary(editable)
    ) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (typeof setter !== 'function') return false;
    editable.focus();
    setter.call(editable, text);
    editable.setSelectionRange(text.length, text.length);
    editable.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: null,
      inputType: 'insertReplacementText'
    }));
    return true;
  })()`;
}
