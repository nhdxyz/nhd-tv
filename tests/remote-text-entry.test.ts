import { describe, expect, it } from "vitest";
import { buildRemoteTextEntryScript } from "../src/main/remote-text-entry";

describe("provider remote text entry", () => {
  it("writes only to an active or precision-marked declared search input", () => {
    const script = buildRemoteTextEntryScript("Breaking Bad", [
      'input[data-uia="search-box-input"]'
    ]);

    expect(script).toContain('const text = "Breaking Bad"');
    expect(script).toContain("document.activeElement");
    expect(script).toContain('[data-nhd-tv-focus="true"]');
    expect(script).toContain("matchesDeclaredSelector(active)");
    expect(script).toContain("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')");
    expect(script).toContain("new InputEvent('input'");
    expect(script).not.toContain("fetch(");
    expect(script).not.toContain("ipcRenderer");
    expect(() => new Function(`return ${script}`)).not.toThrow();
  });

  it("rejects credentials, checkout forms, non-text inputs, and readonly fields", () => {
    const script = buildRemoteTextEntryScript("query", ['input[type="search"]']);

    expect(script).toContain("password|payment|checkout|billing");
    expect(script).toContain("!['search', 'text'].includes(editable.type)");
    expect(script).toContain("editable.disabled");
    expect(script).toContain("editable.readOnly");
    expect(script).toContain("sensitiveBoundary(editable)");
  });
});
