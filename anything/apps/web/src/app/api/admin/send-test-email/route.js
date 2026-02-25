import sql from "../../utils/sql";

export async function POST(request) {
  try {
    const { userId, email } = await request.json();

    if (!email) {
      return Response.json(
        { error: "Email address is required" },
        { status: 400 },
      );
    }

    // Get user info for personalization
    const [user] = await sql`
      SELECT name, email as user_email
      FROM auth_users
      WHERE id = ${userId}
    `;

    const userName = user?.name || "Admin";

    // Send a test email via Zapier webhook
    const webhookResponse = await fetch(process.env.ZAPIER_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipientType: "admin",
        to: email,
        from: "Ad Manager <advertise@cbnads.com>",
        subject: "Test Email - Your Ad Reminder System is Working! 🎉",
        greeting: "Hello",
        firstName: userName.split(" ")[0],
        advertiserName: "John Smith", // Advertiser contact name for personalization
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

    await webhookResponse.json();

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
