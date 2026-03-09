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

const toEmailList = (value) =>
  Array.from(
    new Set(
      (Array.isArray(value) ? value : [value])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    ),
  );

const senderEmailAddress = (sender) => {
  const text = String(sender || "").trim();
  if (!text) return "";
  const namedMatch = text.match(/<([^>]+)>/);
  if (namedMatch?.[1]) {
    return String(namedMatch[1]).trim();
  }
  return text;
};

export async function sendEmail({ to, bcc, from, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const sender = resolveEmailSender(from);
  let toRecipients = toEmailList(to);
  let bccRecipients = toEmailList(bcc);

  // Safety default: if a caller passes multiple visible recipients in "to",
  // convert to BCC to prevent recipient disclosure.
  if (bccRecipients.length === 0 && toRecipients.length > 1) {
    bccRecipients = [...toRecipients];
    toRecipients = [];
  }

  if (toRecipients.length === 0 && bccRecipients.length === 0) {
    throw new Error("Email recipient is required");
  }

  // Resend expects a visible "to" recipient. When we broadcast via BCC,
  // use sender mailbox as the visible addressee to avoid exposing recipients.
  if (toRecipients.length === 0 && bccRecipients.length > 0) {
    const fallbackTo = senderEmailAddress(sender) || DEFAULT_FROM_EMAIL;
    toRecipients.push(fallbackTo);
  }

  const toRecipientSet = new Set(toRecipients.map((value) => value.toLowerCase()));
  const filteredBccRecipients = bccRecipients.filter(
    (value) => !toRecipientSet.has(value.toLowerCase()),
  );
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
        to: toRecipients,
        ...(filteredBccRecipients.length > 0 ? { bcc: filteredBccRecipients } : {}),
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
