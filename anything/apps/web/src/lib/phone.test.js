import { describe, expect, it } from "vitest";
import {
  formatFlexiblePhoneInput,
  isCompleteUSPhoneNumber,
  normalizeFlexiblePhoneNumber,
} from "./phone.js";

describe("phone helpers", () => {
  it("keeps international input intact while typing", () => {
    expect(formatFlexiblePhoneInput("639-912-345-6789")).toBe("639-912-345-6789");
  });

  it("normalizes international input to +countrycode format", () => {
    expect(normalizeFlexiblePhoneNumber("639-912-345-6789")).toBe("+6399123456789");
  });

  it("does not treat international numbers as complete US numbers", () => {
    expect(isCompleteUSPhoneNumber("639-912-345-6789")).toBe(false);
  });

  it("still formats US numbers", () => {
    expect(formatFlexiblePhoneInput("2125550100")).toBe("(212) 555-0100");
  });
});
