// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseReminderMinutes } from "./reminder-minutes.js";

describe("parseReminderMinutes", () => {
  it("parses reminder preset labels", () => {
    expect(parseReminderMinutes("15-min")).toBe(15);
    expect(parseReminderMinutes("30-min")).toBe(30);
    expect(parseReminderMinutes("1-hour")).toBe(60);
    expect(parseReminderMinutes("1-day")).toBe(1440);
  });

  it("preserves numeric and textual minute/hour values", () => {
    expect(parseReminderMinutes(45)).toBe(45);
    expect(parseReminderMinutes("90")).toBe(90);
    expect(parseReminderMinutes("2 hours")).toBe(120);
    expect(parseReminderMinutes("3 days")).toBe(4320);
  });

  it("falls back safely for unsupported values", () => {
    expect(parseReminderMinutes("custom", 30)).toBe(30);
    expect(parseReminderMinutes("", 60)).toBe(60);
    expect(parseReminderMinutes(null, 15)).toBe(15);
  });
});
