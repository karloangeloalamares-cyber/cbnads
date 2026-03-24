export const ACCOUNT_PASSWORD_REQUIREMENTS_MESSAGE =
  "Password must be at least 8 characters long and include letters, numbers, and special characters.";

export function getPasswordStrengthValidationError(password = "") {
  const value = String(password || "");

  if (value.length < 8) {
    return ACCOUNT_PASSWORD_REQUIREMENTS_MESSAGE;
  }

  if (!/[A-Za-z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return ACCOUNT_PASSWORD_REQUIREMENTS_MESSAGE;
  }

  return null;
}

export function normalizePasswordStrengthErrorMessage(message = "") {
  const value = String(message || "").trim();
  if (!value) {
    return null;
  }

  if (
    /invalid password|weak password|password should|password must|password.*(letter|number|special|character|contain|include)|at least \d+ character/i.test(
      value,
    )
  ) {
    return ACCOUNT_PASSWORD_REQUIREMENTS_MESSAGE;
  }

  return null;
}

export function isPasswordStrengthErrorMessage(message = "") {
  return Boolean(normalizePasswordStrengthErrorMessage(message));
}
