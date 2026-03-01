export const US_PHONE_DIGIT_COUNT = 10;
export const US_PHONE_INPUT_MAX_LENGTH = 14;

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

export const isCompleteUSPhoneNumber = (value) =>
  getUSPhoneDigits(value).length === US_PHONE_DIGIT_COUNT;

export const toE164USPhoneNumber = (value) => {
  const digits = getUSPhoneDigits(value);
  return digits.length === US_PHONE_DIGIT_COUNT ? `+1${digits}` : null;
};
