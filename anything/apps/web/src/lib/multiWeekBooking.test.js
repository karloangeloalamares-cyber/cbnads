import { describe, expect, test } from "vitest";
import { resolveAdvertiserMultiWeekPreview } from "./multiWeekBooking.js";

describe("resolveAdvertiserMultiWeekPreview", () => {
  test("inherits base content by default", () => {
    const preview = resolveAdvertiserMultiWeekPreview(
      {
        ad_name: "Series Base",
        ad_text: "Week 1 base copy",
        media: [{ url: "https://example.com/base.png" }],
        multi_week_weeks: 4,
        series_week_start: "2026-03-15",
        multi_week_overrides: [{}, {}, {}, {}],
      },
      2,
    );

    expect(preview.ad_name).toBe("Series Base (Week 3)");
    expect(preview.ad_text).toBe("Week 1 base copy");
    expect(preview.media).toEqual([{ url: "https://example.com/base.png" }]);
    expect(preview.post_date_from).toBe("2026-03-29");
  });

  test("can disable base fallback for dedicated per-week preview flows", () => {
    const preview = resolveAdvertiserMultiWeekPreview(
      {
        ad_name: "Series Base",
        ad_text: "Week 1 base copy",
        media: [{ url: "https://example.com/base.png" }],
        multi_week_weeks: 4,
        series_week_start: "2026-03-15",
        multi_week_overrides: [
          {
            ad_name: "Week 1",
            ad_text: "Week 1 copy",
          },
          {},
          {},
          {},
        ],
      },
      2,
      { includeBaseFallback: false },
    );

    expect(preview.ad_name).toBe("Week 3");
    expect(preview.ad_text).toBe("");
    expect(preview.media).toEqual([]);
    expect(preview.post_date_from).toBe("2026-03-29");
  });
});
