export const EMAIL_MAX_LENGTH = 254;
export const PERSON_NAME_MAX_LENGTH = 120;
export const ADVERTISER_NAME_MAX_LENGTH = 120;
export const PLACEMENT_MAX_LENGTH = 120;
export const AD_NAME_MAX_LENGTH = 120;
export const AD_TEXT_MAX_LENGTH = 1500;
export const NOTES_MAX_LENGTH = 2000;
export const MEDIA_ITEM_MAX_COUNT = 10;
export const CUSTOM_DATE_MAX_COUNT = 31;
export const MULTI_WEEK_MAX_COUNT = 12;
export const TELEGRAM_CHAT_ID_MAX_COUNT = 10;
export const TELEGRAM_CHAT_ID_MAX_LENGTH = 64;
export const TELEGRAM_LABEL_MAX_LENGTH = 80;
export const WHATSAPP_RECIPIENT_MAX_COUNT = 10;
export const WHATSAPP_LABEL_MAX_LENGTH = 80;
export const WHATSAPP_TEMPLATE_NAME_MAX_LENGTH = 128;
export const WHATSAPP_TEMPLATE_LANGUAGE_MAX_LENGTH = 20;
export const CREDIT_REASON_MAX_LENGTH = 500;
export const PAYMENT_REFERENCE_MAX_LENGTH = 120;
export const PAYMENT_NOTE_MAX_LENGTH = 500;
export const FILE_NAME_MAX_LENGTH = 120;

export const MEDIA_UPLOAD_MAX_BYTES = {
  image: 20 * 1024 * 1024,
  video: 250 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  file: 20 * 1024 * 1024,
};

export const mediaUploadLimitLabel = (kind) => {
  const bytes = MEDIA_UPLOAD_MAX_BYTES[kind] || MEDIA_UPLOAD_MAX_BYTES.file;
  const mb = bytes / (1024 * 1024);
  return `${mb} MB`;
};
