import { requirePermission } from "../../../utils/auth-check.js";
import { sendTelegramMessage, sendTelegramToMany } from "../../../utils/send-telegram.js";

export async function POST(request) {
  try {
    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const { chat_id, chat_ids, text } = body;

    if (!text) {
      return Response.json({ error: "text is required" }, { status: 400 });
    }

    // Support single chat_id or array of chat_ids
    if (Array.isArray(chat_ids) && chat_ids.length > 0) {
      const results = await sendTelegramToMany({ chatIds: chat_ids, text });
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

    const result = await sendTelegramMessage({ chatId: chat_id, text });
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
