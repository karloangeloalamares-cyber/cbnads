const TELEGRAM_API_BASE = "https://api.telegram.org";

const createTelegramError = (status, data) => {
  const error = new Error(data?.description || "Failed to send Telegram message");
  error.telegramStatus = status;
  error.telegramErrorCode = data?.error_code ?? null;
  return error;
};

const stripHtmlTags = (value) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .trim();

const shouldRetryWithoutHtml = (error) =>
  /can't parse entities/i.test(String(error?.message || ""));

const sendTelegram = async ({ token, chatId, text, parseMode = "HTML" }) => {
  const payload = {
    chat_id: String(chatId).trim(),
    text: String(text || ""),
  };
  if (parseMode) {
    payload.parse_mode = parseMode;
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw createTelegramError(response.status, data);
  }

  return { message_id: data.result?.message_id };
};

export async function sendTelegramMessage({ chatId, text }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  try {
    return await sendTelegram({
      token,
      chatId,
      text,
      parseMode: "HTML",
    });
  } catch (error) {
    if (!shouldRetryWithoutHtml(error)) {
      throw error;
    }

    const plainText = stripHtmlTags(text);
    if (!plainText) {
      throw error;
    }

    return sendTelegram({
      token,
      chatId,
      text: plainText,
      parseMode: null,
    });
  }
}

export async function sendTelegramToMany({ chatIds, text }) {
  if (!chatIds || chatIds.length === 0) return [];
  const results = await Promise.allSettled(
    chatIds.map((chatId) => sendTelegramMessage({ chatId, text })),
  );
  return results.map((result, i) => ({
    chatId: chatIds[i],
    ok: result.status === "fulfilled",
    error: result.status === "rejected" ? result.reason?.message : null,
  }));
}

export function resolveActiveTelegramChatIds(rows) {
  const chatIds = [];
  for (const row of rows || []) {
    const list = Array.isArray(row?.telegram_chat_ids) ? row.telegram_chat_ids : [];
    for (const entry of list) {
      if (entry?.is_active && String(entry?.chat_id || "").trim()) {
        chatIds.push(String(entry.chat_id).trim());
      }
    }
  }
  return Array.from(new Set(chatIds));
}
