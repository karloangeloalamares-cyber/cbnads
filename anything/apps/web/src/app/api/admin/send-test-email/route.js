import { getSessionUser, requireAdmin } from "../../utils/auth-check.js";
import { getDefaultEmailSender, sendEmail } from "../../utils/send-email.js";

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const { email } = await request.json();
    if (!email) {
      return Response.json(
        { error: "Email address is required" },
        { status: 400 },
      );
    }

    const user = await getSessionUser();
    const userName = user?.name || "Admin";
    const defaultSender = getDefaultEmailSender();
    const firstName = userName.split(" ")[0];

    await sendEmail({
      to: email,
      from: defaultSender,
      subject: "Test Email - Your Ad Reminder System is Working!",
      text: `Hello ${firstName}, this is a test email from CBN Ads. If you received this, your Resend setup is working.`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <p>Hello ${firstName},</p>
          <p>This is a test email from <strong>CBN Ads</strong>.</p>
          <p>If you received this, your Resend setup is working.</p>
        </div>
      `,
    });

    return Response.json({
      success: true,
      message: `Test email sent to ${email}`,
    });
  } catch (err) {
    console.error("POST /api/admin/send-test-email error", err);
    return Response.json(
      {
        error: err.message || "Failed to send test email",
      },
      { status: 500 },
    );
  }
}
