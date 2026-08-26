import { describe, expect, it } from "vitest";
import {
  buildRemoteTextEntryAvailabilityScript,
  buildRemoteTextEntryScript
} from "../src/main/remote-text-entry";

describe("provider remote text entry", () => {
  it("writes only to an active, marked, or unambiguous visible declared search input", () => {
    const script = buildRemoteTextEntryScript("Breaking Bad", [
      'input[data-uia="search-box-input"]'
    ]);

    expect(script).toContain('const text = "Breaking Bad"');
    expect(script).toContain("document.activeElement");
    expect(script).toContain('[data-nhd-tv-focus="true"]');
    expect(script).toContain('[data-nhd-tv-text-entry="true"]');
    expect(script).toContain("visibleDeclared.length === 1");
    expect(script).toContain("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')");
    expect(script).toContain("new InputEvent('input'");
    expect(script).not.toContain("fetch(");
    expect(script).not.toContain("ipcRenderer");
    expect(() => new Function(`return ${script}`)).not.toThrow();
  });

  it("rejects credentials, checkout forms, non-text inputs, and readonly fields", () => {
    const script = buildRemoteTextEntryScript("query", ['input[type="search"]']);

    expect(script).toContain("password|passcode|email|username|payment|checkout|billing");
    expect(script).toContain("['search', 'text'].includes(element.type)");
    expect(script).toContain("!element.disabled");
    expect(script).toContain("!element.readOnly");
    expect(script).toContain("!sensitiveBoundary(element)");
  });

  it("binds the provider field that appears after a search launcher tap", () => {
    const script = buildRemoteTextEntryAvailabilityScript([
      'input[data-uia="search-box-input"]'
    ]);

    expect(script).toContain("document.querySelectorAll(selector)");
    expect(script).toContain("visibleDeclared.length === 1");
    expect(script).toContain("editable.dataset.nhdTvTextEntry = 'true'");
    expect(script).toContain("editable.focus({ preventScroll: true })");
    expect(script).toContain("password|passcode|email|username|payment");
    expect(script).not.toContain("fetch(");
    expect(script).not.toContain("ipcRenderer");
    expect(() => new Function(`return ${script}`)).not.toThrow();
  });
});
