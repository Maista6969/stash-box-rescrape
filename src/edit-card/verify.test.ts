import { describe, it, expect } from "vitest";
import { decideFieldRowPresentation, decideImageComparison } from "./verify";

describe("decideFieldRowPresentation", () => {
  it("returns match when the status is a match, regardless of content/comment", () => {
    expect(decideFieldRowPresentation("match", true, "some comment")).toEqual({
      kind: "match",
    });
    expect(decideFieldRowPresentation("match", false, null)).toEqual({
      kind: "match",
    });
  });

  it("shows outright when there's no existing content to toggle against", () => {
    expect(
      decideFieldRowPresentation("diff", false, "Title should be X"),
    ).toEqual({
      kind: "outright",
      status: "diff",
      commentText: "Title should be X",
    });
  });

  it("uses a toggle when there's existing content to compare against", () => {
    expect(
      decideFieldRowPresentation("diff", true, "Title should be X"),
    ).toEqual({
      kind: "toggle",
      status: "diff",
      commentText: "Title should be X",
    });
  });

  it("passes through a null comment when the field has no commentTemplate", () => {
    expect(decideFieldRowPresentation("missing", true, null)).toEqual({
      kind: "toggle",
      status: "missing",
      commentText: null,
    });
  });
});

describe("decideImageComparison", () => {
  it("derives aspect ratio and dimensions text from a hosted image", () => {
    const result = decideImageComparison({
      src: "https://example.com/cover.jpg",
      width: 1920,
      height: 1080,
    });
    expect(result).toEqual({
      aspectRatio: "1920 / 1080",
      dimsText: "1920 x 1080",
      commentText:
        "Image should be [official scene cover image](https://example.com/cover.jpg)",
    });
  });

  it("falls back to a plain-text comment for a data-URI image with no linkable URL", () => {
    const result = decideImageComparison({
      src: "data:image/jpeg;base64,abc123",
      width: 800,
      height: 600,
    });
    expect(result.commentText).toBe("Image doesn't match the official source");
  });
});
