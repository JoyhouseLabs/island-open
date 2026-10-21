import { describe, expect, it } from "vitest";
import {
  bilibiliId,
  books,
  findChapter,
  videoSource,
  youtubeId,
} from "./books.js";

describe("videoSource", () => {
  it("routes bilibili links to the player iframe", () => {
    expect(videoSource("https://www.bilibili.com/video/BV1sK4y1a7JJ")).toEqual({
      kind: "bilibili",
      bvid: "BV1sK4y1a7JJ",
    });
    expect(videoSource("https://www.bilibili.com/video/av170001")).toEqual({
      kind: "bilibili",
      aid: "170001",
    });
  });
  it("routes youtube links to the youtube iframe", () => {
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(videoSource("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      id: "dQw4w9WgXcQ",
    });
  });
  it("plays direct media files natively", () => {
    expect(videoSource("https://example.com/a/flower.mp4")).toEqual({
      kind: "file",
      url: "https://example.com/a/flower.mp4",
    });
    expect(videoSource("https://example.com/x.webm?t=1")).toEqual({
      kind: "file",
      url: "https://example.com/x.webm?t=1",
    });
  });
  it("falls back to an external link for short links and pages", () => {
    expect(videoSource("https://b23.tv/abc123")).toEqual({
      kind: "link",
      url: "https://b23.tv/abc123",
    });
  });
});

describe("id helpers", () => {
  it("extracts youtube ids from common shapes", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=abcdef1234")).toBe(
      "abcdef1234",
    );
    expect(youtubeId("https://www.youtube-nocookie.com/embed/abcdef1234")).toBe(
      "abcdef1234",
    );
    expect(youtubeId("https://example.com/nope")).toBeNull();
  });
  it("extracts bilibili ids", () => {
    expect(bilibiliId("https://www.bilibili.com/video/BV1DX4BzyE54/")).toBe(
      "BV1DX4BzyE54",
    );
    expect(bilibiliId("https://example.com/")).toBeNull();
  });
});

describe("books content", () => {
  it("has globally unique chapter ids", () => {
    const ids = books.flatMap((b) => b.chapters.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("finds chapters by book and chapter id", () => {
    const hit = findChapter("qianziwen", "qian-p1");
    expect(hit?.book.title).toBe("千字文");
    expect(hit?.chapter.lines[0]).toContain("天地玄黄");
    expect(findChapter("qianziwen", "nope")).toBeNull();
    expect(findChapter("nope", "qian-p1")).toBeNull();
  });
  it("only references https or same-origin media", () => {
    for (const b of books)
      for (const c of b.chapters)
        for (const m of c.media ?? [])
          expect(m.url.startsWith("/") || m.url.startsWith("https://")).toBe(
            true,
          );
  });
});
