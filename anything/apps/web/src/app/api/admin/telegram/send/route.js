import { requirePermission } from "../../../utils/auth-check.js";
import {
  sendTelegramMediaMessage,
  sendTelegramMediaToMany,
  sendTelegramMessage,
  sendTelegramToMany,
} from "../../../utils/send-telegram.js";

const SUPPORTED_TELEGRAM_MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
]);

const normalizeTelegramMedia = (value) => {
  if (!value) {
    return { media: null, error: null };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { media: null, error: "Media must be an object with type and url." };
  }

  const type = String(value?.type || "").trim().toLowerCase();
  const url = String(value?.url || value?.cdnUrl || "").trim();
  if (!url) {
    return { media: null, error: "Media URL is required when media is provided." };
  }
  if (!SUPPORTED_TELEGRAM_MEDIA_TYPES.has(type)) {
    return { media: null, error: "Media type must be one of: image, video, audio, document." };
  }

  return { media: { type, url }, error: null };
};

export async function POST(request) {
  try {
    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const { chat_id, chat_ids, text, parse_mode } = body;
    const normalizedText = typeof text === "string" ? text : String(text || "");
    const normalizedMedia = normalizeTelegramMedia(body?.media);
    if (normalizedMedia.error) {
      return Response.json({ error: normalizedMedia.error }, { status: 400 });
    }
    const media = normalizedMedia.media;

    if (!normalizedText.trim() && !media) {
      return Response.json({ error: "text or media is required" }, { status: 400 });
    }

    // Support single chat_id or array of chat_ids
    if (Array.isArray(chat_ids) && chat_ids.length > 0) {
      const results = media
        ? await sendTelegramMediaToMany({
            chatIds: chat_ids,
            media,
            caption: normalizedText,
            parseMode: parse_mode,
          })
        : await sendTelegramToMany({
            chatIds: chat_ids,
            text: normalizedText,
            parseMode: parse_mode,
          });
      const failed = results.filter((r) => !r.ok);
      return Response.json({
        success: failed.length === 0,
        results,
        ...(failed.length > 0 && { error: `${failed.length} message(s) failed to send` }),
      });
    }

    if (!chat_id) {
      return Response.json({ error: "chat_id or chat_ids is required" }, { status: 400 });
    }

    const result = media
      ? await sendTelegramMediaMessage({
          chatId: chat_id,
          media,
          caption: normalizedText,
          parseMode: parse_mode,
        })
      : await sendTelegramMessage({
          chatId: chat_id,
          text: normalizedText,
          parseMode: parse_mode,
        });
    return Response.json({ success: true, message_id: result.message_id });
  } catch (error) {
    console.error("[telegram/send] Error:", error);
    const upstreamStatus = Number(error?.telegramStatus || 0);
    const status =
      Number.isFinite(upstreamStatus) && upstreamStatus >= 400 && upstreamStatus <= 599
        ? upstreamStatus
        : 500;
    return Response.json(
      { error: error.message || "Failed to send Telegram message" },
      { status },
    );
  }
}
