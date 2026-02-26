import sql from "@/app/api/utils/sql";
import { sendEmail } from "@/app/api/utils/send-email";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      advertiser_name,
      contact_name,
      email,
      phone_number,
      ad_name,
      post_type,
      post_date_from,
      post_date_to,
      custom_dates,
      post_time,
      reminder_minutes,
      ad_text,
      media,
      placement,
      notes,
    } = body;

    // Validation
    if (!advertiser_name || !contact_name || !email || !ad_name || !post_type) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Additional validation for One-Time Post
    if (post_type === "One-Time Post" && post_date_from && post_time) {
      // Check availability one more time on the backend
      const availabilityCheck = await sql`
        SELECT COUNT(*) as count
        FROM (
          SELECT id FROM ads 
          WHERE post_date_from = ${post_date_from}
          AND post_type = 'One-Time Post'
          AND post_time = ${post_time}
          UNION ALL
          SELECT id FROM pending_ads 
          WHERE post_date_from = ${post_date_from}
          AND post_type = 'One-Time Post'
          AND post_time = ${post_time}
          AND status = 'pending'
        ) combined
      `;

      if (parseInt(availabilityCheck[0].count) > 0) {
        return Response.json(
          {
            error:
              "This time slot is already booked. Please choose a different time.",
          },
          { status: 400 },
        );
      }
    }

    console.log(
      "[submit-ad] Inserting pending ad with date:",
      post_date_from,
      "time:",
      post_time,
    );

    // Insert pending ad
    const result = await sql`
      INSERT INTO pending_ads (
        advertiser_name,
        contact_name,
        email,
        phone_number,
        ad_name,
        post_type,
        post_date_from,
        post_date_to,
        custom_dates,
        post_time,
        reminder_minutes,
        ad_text,
        media,
        placement,
        notes,
        status
      ) VALUES (
        ${advertiser_name},
        ${contact_name},
        ${email},
        ${phone_number || null},
        ${ad_name},
        ${post_type},
        ${post_date_from || null},
        ${post_date_to || null},
        ${custom_dates ? JSON.stringify(custom_dates) : null},
        ${post_time || null},
        ${reminder_minutes || 15},
        ${ad_text || null},
        ${media ? JSON.stringify(media) : "[]"},
        ${placement || null},
        ${notes || null},
        'pending'
      )
      RETURNING *
    `;

    console.log(
      "[submit-ad] Inserted pending ad, returned date:",
      result[0].post_date_from,
    );

    // Get all admins with email notifications enabled
    const adminPrefs = await sql`
      SELECT anp.email_address, au.email, au.name
      FROM admin_notification_preferences anp
      JOIN auth_users au ON anp.user_id = au.id
      WHERE anp.email_enabled = true
      AND (anp.email_address IS NOT NULL OR au.email IS NOT NULL)
    `;

    const adminEmails = adminPrefs
      .map((admin) => admin.email_address || admin.email)
      .filter(Boolean);

    // Create advertiser confirmation email
    const advertiserEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" alt="Logo" class="logo">
    </div>
    
    <div class="content">
      <h2>Thank You for Your Ad Submission</h2>
      <p>Dear ${contact_name},</p>
      <p>We have successfully received your advertising submission. Here's a summary of what you submitted:</p>
      
      <div class="info-block">
        <div class="info-row"><span class="label">Advertiser Name:</span> ${advertiser_name}</div>
        <div class="info-row"><span class="label">Contact Name:</span> ${contact_name}</div>
        <div class="info-row"><span class="label">Email:</span> ${email}</div>
        ${phone_number ? `<div class="info-row"><span class="label">Phone:</span> ${phone_number}</div>` : ""}
        <div class="info-row"><span class="label">Ad Name:</span> ${ad_name}</div>
        <div class="info-row"><span class="label">Post Type:</span> ${post_type}</div>
        ${placement ? `<div class="info-row"><span class="label">Placement:</span> ${placement}</div>` : ""}
        ${post_date_from ? `<div class="info-row"><span class="label">Start Date:</span> ${post_date_from}</div>` : ""}
        ${post_date_to ? `<div class="info-row"><span class="label">End Date:</span> ${post_date_to}</div>` : ""}
        ${post_time ? `<div class="info-row"><span class="label">Post Time:</span> ${post_time}</div>` : ""}
      </div>
      
      <p><strong>Next Steps:</strong></p>
      <p>Our team will review your submission shortly. You will receive a confirmation email once your ad has been approved and scheduled.</p>
      
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <p>Best regards,<br>The Team</p>
    </div>
    
    <div class="footer">
      <p>This is an automated confirmation email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
`;

    // Create admin notification email
    const adminEmailHTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #0066cc; }
    .logo { max-width: 200px; }
    .content { padding: 30px 0; }
    .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .info-section { margin: 25px 0; }
    .section-title { font-size: 18px; font-weight: bold; color: #0066cc; margin-bottom: 15px; border-bottom: 2px solid #0066cc; padding-bottom: 5px; }
    .info-block { background: #f8f9fa; padding: 20px; margin: 10px 0; border-radius: 5px; }
    .info-row { margin: 8px 0; }
    .label { font-weight: bold; color: #555; min-width: 150px; display: inline-block; }
    .media-item { margin: 10px 0; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 3px; }
    .button { display: inline-block; padding: 12px 24px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px 0; border-top: 1px solid #ddd; color: #777; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://ucarecdn.com/c4576b41-e610-4e61-ad4d-d571bd5e0b04/-/format/auto/" alt="Logo" class="logo">
    </div>
    
    <div class="content">
      <div class="alert">
        <h2 style="margin-top: 0;">🔔 New Ad Submission Received</h2>
      </div>
      
      <div class="info-section">
        <div class="section-title">Advertiser Information</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Advertiser Name:</span> ${advertiser_name}</div>
          <div class="info-row"><span class="label">Contact Name:</span> ${contact_name}</div>
          <div class="info-row"><span class="label">Email:</span> <a href="mailto:${email}">${email}</a></div>
          ${phone_number ? `<div class="info-row"><span class="label">Phone Number:</span> ${phone_number}</div>` : ""}
        </div>
      </div>
      
      <div class="info-section">
        <div class="section-title">Ad Details</div>
        <div class="info-block">
          <div class="info-row"><span class="label">Ad Name:</span> ${ad_name}</div>
          <div class="info-row"><span class="label">Post Type:</span> ${post_type}</div>
          ${placement ? `<div class="info-row"><span class="label">Placement:</span> ${placement}</div>` : ""}
        </div>
      </div>
      
      <div class="info-section">
        <div class="section-title">Scheduling</div>
        <div class="info-block">
          ${post_date_from ? `<div class="info-row"><span class="label">Start Date:</span> ${post_date_from}</div>` : ""}
          ${post_date_to ? `<div class="info-row"><span class="label">End Date:</span> ${post_date_to}</div>` : ""}
          ${post_time ? `<div class="info-row"><span class="label">Post Time:</span> ${post_time}</div>` : ""}
          ${reminder_minutes ? `<div class="info-row"><span class="label">Reminder:</span> ${reminder_minutes} minutes before</div>` : ""}
          ${
            custom_dates && custom_dates.length > 0
              ? `
            <div class="info-row">
              <span class="label">Custom Dates:</span>
              <ul style="margin: 5px 0;">
                ${custom_dates.map((date) => `<li>${date}</li>`).join("")}
              </ul>
            </div>
          `
              : ""
          }
        </div>
      </div>
      
      ${
        ad_text
          ? `
        <div class="info-section">
          <div class="section-title">Ad Content</div>
          <div class="info-block">
            <p style="margin: 0; white-space: pre-wrap;">${ad_text}</p>
          </div>
        </div>
      `
          : ""
      }
      
      ${
        media && media.length > 0
          ? `
        <div class="info-section">
          <div class="section-title">Media Files (${media.length})</div>
          ${media
            .map(
              (url, index) => `
            <div class="media-item">
              <div><strong>File ${index + 1}:</strong></div>
              <div><a href="${url}" target="_blank">${url}</a></div>
            </div>
          `,
            )
            .join("")}
        </div>
      `
          : ""
      }
      
      ${
        notes
          ? `
        <div class="info-section">
          <div class="section-title">Additional Notes</div>
          <div class="info-block">
            <p style="margin: 0; white-space: pre-wrap;">${notes}</p>
          </div>
        </div>
      `
          : ""
      }
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.APP_URL}/pending-submissions" class="button">Review Submission</a>
      </div>
    </div>
    
    <div class="footer">
      <p>Submission received at ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
`;

    // Send confirmation to advertiser
    try {
      await sendEmail({
        to: email,
        subject: `Ad Submission Received - ${ad_name}`,
        html: advertiserEmailHTML,
      });
      console.log("[submit-ad] Confirmation email sent to advertiser");
    } catch (emailError) {
      console.error("[submit-ad] Failed to send advertiser email:", emailError);
      // Don't fail the whole request if email fails
    }

    // Send notification to admins
    if (adminEmails.length > 0) {
      try {
        await sendEmail({
          to: adminEmails,
          subject: `New Ad Submission - ${ad_name} from ${advertiser_name}`,
          html: adminEmailHTML,
        });
        console.log("[submit-ad] Notification sent to admins:", adminEmails);
      } catch (emailError) {
        console.error("[submit-ad] Failed to send admin email:", emailError);
        // Don't fail the whole request if email fails
      }
    } else {
      console.warn("[submit-ad] No admin emails configured for notifications");
    }

    return Response.json({
      success: true,
      pending_ad: result[0],
    });
  } catch (error) {
    console.error("Error creating pending ad:", error);
    return Response.json({ error: "Failed to submit ad" }, { status: 500 });
  }
}
