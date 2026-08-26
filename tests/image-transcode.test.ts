import { describe, expect, it } from "vitest";
import {
  buildRasterTranscodeScript,
  validateJpegDataUrl
} from "../src/main/image-transcode";

describe("renderer image transcode boundary", () => {
  it("builds a local bounded decode script for approved raster image types", () => {
    const script = buildRasterTranscodeScript(
      Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
      "image/webp",
      640,
      0.78
    );

    expect(script).toContain("createImageBitmap");
    expect(script).toContain('canvas.toDataURL("image/jpeg", 0.78)');
    expect(script).toContain("Math.max(bitmap.width, bitmap.height)");
    expect(script).not.toContain("https://");
    expect(buildRasterTranscodeScript(Uint8Array.of(1), "text/html", 640, 0.78)).toBeNull();
  });

  it("accepts only bounded JPEG data URLs with JPEG markers", () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const valid = `data:image/jpeg;base64,${Buffer.from(jpegBytes).toString("base64")}`;

    expect(validateJpegDataUrl(valid, 16)).toBe(valid);
    expect(validateJpegDataUrl(valid, 3)).toBeNull();
    expect(validateJpegDataUrl("data:image/png;base64,iVBORw0KGgo=", 16)).toBeNull();
    expect(validateJpegDataUrl("data:image/jpeg;base64,ZmFrZQ==", 16)).toBeNull();
  });
});
