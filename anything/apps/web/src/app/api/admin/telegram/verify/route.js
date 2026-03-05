import { requirePermission } from "../../../utils/auth-check.js";

export async function GET(request) {
  try {
    const auth = await requirePermission("notifications:view", request);
    if (!auth.authorized) {
      return Response.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (!token) {
      return Response.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 503 });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      return Response.json(
        { error: data?.description || "Bot token is invalid" },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      bot: {
        id: data.result?.id,
        username: data.result?.username,
        first_name: data.result?.first_name,
      },
    });
  } catch (error) {
    console.error("[telegram/verify] Error:", error);
    return Response.json(
      { error: error.message || "Failed to verify bot token" },
      { status: 500 },
    );
  }
}
