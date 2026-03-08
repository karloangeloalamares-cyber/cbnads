const DEFAULT_FROM_NAME = "CBN Team";
const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";
const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAMED_SENDER_PATTERN = /<[^>]+>/;

const formatSender = (value) => {
  const sender = String(value || "").trim();
  if (!sender || NAMED_SENDER_PATTERN.test(sender) || !SIMPLE_EMAIL_PATTERN.test(sender)) {
    return sender;
  }

  const senderName = String(process.env.RESEND_FROM_NAME || DEFAULT_FROM_NAME).trim();
  return senderName ? `${senderName} <${sender}>` : sender;
};

export function getDefaultEmailSender() {
  const configuredSender =
    String(process.env.RESEND_FROM_EMAIL || "").trim() || DEFAULT_FROM_EMAIL;
  return formatSender(configuredSender);
}

export function resolveEmailSender(from) {
  return formatSender(from) || getDefaultEmailSender();
}

export async function sendEmail({ to, from, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const sender = resolveEmailSender(from);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Failed to send email");
    }
    return { id: data.id };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Timed out while sending email");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
