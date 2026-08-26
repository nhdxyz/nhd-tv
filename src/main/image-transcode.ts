const SUPPORTED_INPUT_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export function buildRasterTranscodeScript(
  bytes: Uint8Array,
  contentType: string,
  maxDimension: number,
  quality: number
): string | null {
  const normalizedType = contentType.toLocaleLowerCase().split(";", 1)[0]?.trim() ?? "";
  if (
    bytes.byteLength === 0 ||
    !SUPPORTED_INPUT_TYPES.has(normalizedType) ||
    !Number.isInteger(maxDimension) ||
    maxDimension < 1 ||
    maxDimension > 2_048 ||
    !Number.isFinite(quality) ||
    quality < 0.1 ||
    quality > 1
  ) {
    return null;
  }

  const base64 = Buffer.from(bytes).toString("base64");
  return `(async () => {
    const binary = atob(${JSON.stringify(base64)});
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], {
      type: ${JSON.stringify(normalizedType)}
    }));
    try {
      if (bitmap.width < 1 || bitmap.height < 1) return null;
      const scale = Math.min(1, ${maxDimension} / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (context === null) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", ${quality});
    } finally {
      bitmap.close();
    }
  })()`;
}

export function validateJpegDataUrl(value: unknown, maxBytes: number): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("data:image/jpeg;base64,") ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 1
  ) {
    return null;
  }

  const payload = value.slice("data:image/jpeg;base64,".length);
  if (payload.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    return null;
  }

  const bytes = Buffer.from(payload, "base64");
  if (
    bytes.length < 4 ||
    bytes.length > maxBytes ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    return null;
  }

  return value;
}
