import { buildSeriesWeekStarts, resolveWeeklyCreative } from "./series-helpers.js";

describe("series-helpers", () => {
  test("buildSeriesWeekStarts generates +7d week anchors", () => {
    const items = buildSeriesWeekStarts({ seriesWeekStart: "2026-03-15", weeks: 4 });
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.series_week_start)).toEqual([
      "2026-03-15",
      "2026-03-22",
      "2026-03-29",
      "2026-04-05",
    ]);
    expect(items.map((i) => i.series_index)).toEqual([1, 2, 3, 4]);
    expect(items.every((i) => i.series_total === 4)).toBe(true);
  });

  test("buildSeriesWeekStarts supports a single week series", () => {
    const items = buildSeriesWeekStarts({ seriesWeekStart: "2026-03-15", weeks: 1 });
    expect(items).toHaveLength(1);
    expect(items[0].series_index).toBe(1);
    expect(items[0].series_total).toBe(1);
    expect(items[0].series_week_start).toBe("2026-03-15");
  });

  test("resolveWeeklyCreative inherits base and suffixes name by default", () => {
    const resolved = resolveWeeklyCreative({
      base: { ad_name: "Spring Promo", ad_text: "Base copy", media: [{ url: "https://example.com/a.png" }] },
      override: {},
      index: 2,
    });
    expect(resolved.ad_name).toBe("Spring Promo (Week 2)");
    expect(resolved.ad_text).toBe("Base copy");
    expect(resolved.media).toHaveLength(1);
  });

  test("resolveWeeklyCreative uses override fields when provided", () => {
    const resolved = resolveWeeklyCreative({
      base: { ad_name: "Base", ad_text: "Base copy", media: [{ url: "https://example.com/base.png" }] },
      override: {
        ad_name: "Week 1 Creative",
        ad_text: "Override copy",
        use_base_media: false,
        media: [{ url: "https://example.com/override.png" }],
      },
      index: 1,
    });
    expect(resolved.ad_name).toBe("Week 1 Creative");
    expect(resolved.ad_text).toBe("Override copy");
    expect(resolved.media[0].url).toBe("https://example.com/override.png");
  });
});
