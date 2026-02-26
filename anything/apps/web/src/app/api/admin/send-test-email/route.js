import { getSessionUser, requireAdmin } from "@/app/api/utils/auth-check";

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

    if (!process.env.ZAPIER_WEBHOOK_URL) {
      return Response.json(
        { error: "Zapier webhook is not configured" },
        { status: 500 },
      );
    }

    const user = await getSessionUser();
    const userName = user?.name || "Admin";

    const webhookResponse = await fetch(process.env.ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientType: "admin",
        to: email,
        from: "Ad Manager <advertise@cbnads.com>",
        subject: "Test Email - Your Ad Reminder System is Working!",
        greeting: "Hello",
        firstName: userName.split(" ")[0],
        advertiserName: "John Smith",
        adName: "Summer Sale Promotion (Test)",
        advertiser: "Acme Corporation (Test)",
        advertiserEmail: "advertiser@acmecorp.com",
        advertiserPhone: "+1-555-123-4567",
        placement: "Instagram Story",
        formattedTime: "2:00 PM ET",
        formattedDate: "Tomorrow",
        timeUntilText: "in 1 day",
        adText:
          "This is a test ad. Your actual ad reminders will include the real ad copy here.",
        imageCount: 0,
        videoCount: 0,
        isTest: true,
      }),
    });

    if (!webhookResponse.ok) {
      throw new Error(
        `Zapier webhook returned status ${webhookResponse.status}`,
      );
    }

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

