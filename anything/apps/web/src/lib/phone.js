export const US_PHONE_DIGIT_COUNT = 10;
export const US_PHONE_INPUT_MAX_LENGTH = 14;
export const FLEX_PHONE_INPUT_MAX_LENGTH = 24;

const INTERNATIONAL_PHONE_MIN_DIGITS = 8;
const INTERNATIONAL_PHONE_MAX_DIGITS = 15;

export const getUSPhoneDigits = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length > US_PHONE_DIGIT_COUNT && digits.startsWith("1")) {
    return digits.slice(1, US_PHONE_DIGIT_COUNT + 1);
  }

  return digits.slice(0, US_PHONE_DIGIT_COUNT);
};

export const formatUSPhoneNumber = (value) => {
  const digits = getUSPhoneDigits(value);

  if (!digits) {
    return "";
  }

  if (digits.length < 4) {
    return `(${digits}`;
  }

  if (digits.length < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

export const normalizeUSPhoneNumber = (value) => formatUSPhoneNumber(value);

const cleanPhoneInputCharacters = (value) =>
  String(value ?? "")
    .replace(/[^\d\s()+-]/g, "")
    .slice(0, FLEX_PHONE_INPUT_MAX_LENGTH);

export const isLikelyInternationalPhoneNumber = (value) => {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!raw || !digits) {
    return false;
  }

  if (raw.startsWith("+")) {
    return true;
  }

  return digits.length > 10 && !(digits.length === 11 && digits.startsWith("1"));
};

export const formatFlexiblePhoneInput = (value) => {
  const raw = cleanPhoneInputCharacters(value);
  if (!raw) {
    return "";
  }

  if (isLikelyInternationalPhoneNumber(raw)) {
    return raw;
  }

  return formatUSPhoneNumber(raw);
};

export const normalizeFlexiblePhoneNumber = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  if (isLikelyInternationalPhoneNumber(raw)) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      return "";
    }
    return `+${digits}`;
  }

  return formatUSPhoneNumber(raw);
};

export const isValidFlexiblePhoneNumber = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return false;
  }

  if (isLikelyInternationalPhoneNumber(raw)) {
    const digits = raw.replace(/\D/g, "");
    return (
      digits.length >= INTERNATIONAL_PHONE_MIN_DIGITS &&
      digits.length <= INTERNATIONAL_PHONE_MAX_DIGITS
    );
  }

  return isCompleteUSPhoneNumber(raw);
};

export const isCompleteUSPhoneNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return (
    digits.length === US_PHONE_DIGIT_COUNT ||
    (digits.length === US_PHONE_DIGIT_COUNT + 1 && digits.startsWith("1"))
  );
};

export const toE164USPhoneNumber = (value) => {
  const digits = getUSPhoneDigits(value);
  return digits.length === US_PHONE_DIGIT_COUNT ? `+1${digits}` : null;
};
