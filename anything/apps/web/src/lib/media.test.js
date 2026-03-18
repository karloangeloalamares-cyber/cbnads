import { describe, expect, it } from "vitest";
import {
  getFileExtension,
  getMediaItemName,
  getMediaItemUrl,
  resolveMediaType,
} from "./media";

describe("media helpers", () => {
  it("resolves image types from mime type", () => {
    expect(resolveMediaType({ mimeType: "image/png" })).toBe("image");
  });

  it("resolves video types from extension", () => {
    expect(resolveMediaType({ url: "https://example.com/sample.mp4" })).toBe("video");
  });

  it("resolves document types from pdf metadata", () => {
    expect(
      resolveMediaType({ name: "deck.pdf", mimeType: "application/pdf" }),
    ).toBe("document");
  });

  it("returns fallback url, name, and file extension values", () => {
    expect(getMediaItemUrl({ cdnUrl: "https://example.com/file.pdf" })).toBe(
      "https://example.com/file.pdf",
    );
    expect(getMediaItemName({}, "Fallback")).toBe("Fallback");
    expect(getFileExtension("creative.final.mov")).toBe(".mov");
  });
});
