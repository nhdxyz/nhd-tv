export function isTrustedShellUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "app:" && url.hostname === "shell";
  } catch {
    return false;
  }
}
