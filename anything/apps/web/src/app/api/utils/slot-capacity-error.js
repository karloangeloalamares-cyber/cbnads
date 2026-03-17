const DAY_FULL_PATTERN = /slot_day_full(?::([0-9]{4}-[0-9]{2}-[0-9]{2}))?/i;
const TIME_BLOCKED_PATTERN =
  /slot_time_blocked(?::([0-9]{4}-[0-9]{2}-[0-9]{2})(?:[ t]([0-9]{2}:[0-9]{2}(?::[0-9]{2})?))?)?/i;

const defaultDayFullMessage =
  "Ad limit reached for this date. Please choose the next available day.";
const defaultTimeBlockedMessage = "This time slot is already booked. Please choose a different time.";

export const getSlotCapacityErrorPayload = (
  error,
  {
    dayFullMessage = defaultDayFullMessage,
    timeBlockedMessage = defaultTimeBlockedMessage,
  } = {},
) => {
  const message = String(error?.message || "");

  const dayMatch = message.match(DAY_FULL_PATTERN);
  if (dayMatch) {
    const blockedDate = dayMatch[1] || null;
    return {
      status: 400,
      body: {
        error: dayFullMessage,
        ...(blockedDate ? { fully_booked_dates: [blockedDate] } : {}),
      },
    };
  }

  const timeMatch = message.match(TIME_BLOCKED_PATTERN);
  if (timeMatch) {
    const blockedDate = timeMatch[1] || null;
    const blockedTime = timeMatch[2] || null;
    return {
      status: 400,
      body: {
        error: timeBlockedMessage,
        ...(blockedDate ? { blocked_date: blockedDate } : {}),
        ...(blockedTime ? { blocked_time: blockedTime } : {}),
      },
    };
  }

  return null;
};
