export async function sendTelegramMessage({ chatId, text }) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId).trim(),
        text,
        parse_mode: "HTML",
      }),
    },
  );

  const data = await response.json();
  if (!response.ok || !data.ok) {
    const error = new Error(data?.description || "Failed to send Telegram message");
    error.telegramStatus = response.status;
    error.telegramErrorCode = data?.error_code ?? null;
    throw error;
  }
  return { message_id: data.result?.message_id };
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
