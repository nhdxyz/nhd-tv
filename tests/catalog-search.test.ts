import { describe, expect, it } from "vitest";
import { normalizeCatalogQuery, parseTvmazeSearchPayload } from "../src/main/catalog-search";

describe("catalog search", () => {
  it("normalizes bounded queries and rejects undersized or non-string input", () => {
    expect(normalizeCatalogQuery("  better   call saul ")).toBe("better call saul");
    expect(normalizeCatalogQuery("x")).toBeNull();
    expect(normalizeCatalogQuery({})).toBeNull();
    expect(normalizeCatalogQuery("x".repeat(200))).toHaveLength(120);
  });

  it("accepts only bounded TVmaze metadata and approved artwork hosts", () => {
    const results = parseTvmazeSearchPayload([
      {
        show: {
          genres: ["Drama", "Crime"],
          id: 169,
          image: { medium: "https://static.tvmaze.com/uploads/images/medium_portrait/example.jpg" },
          name: "Better Call Saul",
          network: { name: "AMC" },
          premiered: "2015-02-08",
          summary: "<p>A <b>lawyer</b> changes course.</p>",
          url: "https://www.tvmaze.com/shows/169/better-call-saul"
        }
      }
    ]);

    expect(results).toEqual([{
      genres: ["Drama", "Crime"],
      id: "tvmaze-169",
      imageUrl: "https://static.tvmaze.com/uploads/images/medium_portrait/example.jpg",
      network: "AMC",
      premiered: "2015-02-08",
      sourceUrl: "https://www.tvmaze.com/shows/169/better-call-saul",
      summary: "A lawyer changes course.",
      title: "Better Call Saul"
    }]);
  });

  it("drops invalid records and strips unapproved URLs", () => {
    expect(parseTvmazeSearchPayload([
      { show: { id: 1, name: "Unsafe", url: "https://example.com/shows/1" } },
      {
        show: {
          id: 2,
          image: { original: "https://images.example.com/poster.jpg" },
          name: "Safe show",
          url: "https://www.tvmaze.com/shows/2/safe-show"
        }
      }
    ])).toEqual([expect.objectContaining({
      id: "tvmaze-2",
      imageUrl: null,
      title: "Safe show"
    })]);
  });
});
