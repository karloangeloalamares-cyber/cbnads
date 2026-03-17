// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getSlotCapacityErrorPayload } from "./slot-capacity-error.js";

describe("getSlotCapacityErrorPayload", () => {
  it("maps slot day-full errors to a 400 payload with blocked date", () => {
    const payload = getSlotCapacityErrorPayload({
      message: "slot_day_full:2026-03-20",
    });

    expect(payload).toEqual({
      status: 400,
      body: {
        error: "Ad limit reached for this date. Please choose the next available day.",
        fully_booked_dates: ["2026-03-20"],
      },
    });
  });

  it("maps slot time-blocked errors to a 400 payload", () => {
    const payload = getSlotCapacityErrorPayload(
      {
        message: "slot_time_blocked:2026-03-20 09:00:00",
      },
      {
        timeBlockedMessage: "This time slot is already taken. Please choose a different time.",
      },
    );

    expect(payload).toEqual({
      status: 400,
      body: {
        error: "This time slot is already taken. Please choose a different time.",
        blocked_date: "2026-03-20",
        blocked_time: "09:00:00",
      },
    });
  });

  it("returns null for non-slot-capacity errors", () => {
    const payload = getSlotCapacityErrorPayload({
      message: "random_database_error",
    });

    expect(payload).toBeNull();
  });
});
