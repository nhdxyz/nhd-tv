function buildRemoteTextEntryResolver(
  remoteTextEntrySelectors: readonly string[]
): string {
  return `
    const selectors = ${JSON.stringify(remoteTextEntrySelectors)};
    const sensitiveBoundary = (element) => {
      const form = element.closest('form');
      const boundary = [
        element.getAttribute('autocomplete'),
        element.getAttribute('aria-label'),
        element.getAttribute('name'),
        element.getAttribute('placeholder'),
        element.id,
        form?.getAttribute('action'),
        form?.getAttribute('aria-label'),
        form?.getAttribute('name'),
        form?.id,
        form?.className
      ].filter((value) => typeof value === 'string').join(' ');
      return /login|log-in|signin|sign-in|password|passcode|email|username|payment|checkout|billing/i.test(boundary);
    };
    const matchesDeclaredSelector = (element) => selectors.some((selector) => {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    });
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05 && rect.width >= 8 && rect.height >= 8 &&
        rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
        element.closest('[aria-hidden="true"],[inert]') === null;
    };
    const isEligible = (element) => element instanceof HTMLInputElement &&
      matchesDeclaredSelector(element) &&
      ['search', 'text'].includes(element.type) &&
      !element.disabled &&
      !element.readOnly &&
      !sensitiveBoundary(element) &&
      isVisible(element);
    const declared = [];
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach((element) => declared.push(element));
      } catch {
        // Invalid selectors are rejected when the service adapter is registered.
      }
    }
    const visibleDeclared = [...new Set(declared)].filter(isEligible);
    const preferred = [
      document.activeElement,
      document.querySelector('[data-nhd-tv-text-entry="true"]'),
      document.querySelector('[data-nhd-tv-focus="true"]')
    ].find(isEligible);
    const editable = preferred || (visibleDeclared.length === 1 ? visibleDeclared[0] : null);`;
}

export function buildRemoteTextEntryAvailabilityScript(
  remoteTextEntrySelectors: readonly string[]
): string {
  return `(() => {${buildRemoteTextEntryResolver(remoteTextEntrySelectors)}
    document.querySelectorAll('[data-nhd-tv-text-entry="true"]').forEach((element) => {
      if (element !== editable) element.removeAttribute('data-nhd-tv-text-entry');
    });
    if (!(editable instanceof HTMLInputElement)) return false;
    editable.dataset.nhdTvTextEntry = 'true';
    editable.focus({ preventScroll: true });
    return true;
  })()`;
}

export function buildRemoteTextEntryScript(
  text: string,
  remoteTextEntrySelectors: readonly string[]
): string {
  return `(() => {
    const text = ${JSON.stringify(text)};
    ${buildRemoteTextEntryResolver(remoteTextEntrySelectors)}
    if (!(editable instanceof HTMLInputElement)) return false;
    editable.dataset.nhdTvTextEntry = 'true';
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
