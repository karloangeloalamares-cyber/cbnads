import sql from "@/app/api/utils/sql";

// Eastern Time (New York) timezone helper
function getNowInET() {
  const now = new Date();
  const etTimeStr = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  return new Date(etTimeStr);
}

function getETDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // returns "YYYY-MM-DD"
}

// Helper: parse a date string + time string as Eastern local time
// dateStr: "2026-02-23", timeStr: "07:15:00"
function parseETTime(dateStr, timeStr) {
  const parts = dateStr.split("-");
  const timeParts = timeStr.split(":");
  return new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
    parseInt(timeParts[2] || "0"),
  );
}

// Convert admin reminder_time_value + reminder_time_unit to minutes
function adminReminderToMinutes(value, unit) {
  const v = parseInt(value) || 1;
  switch (unit) {
    case "minutes":
      return v;
    case "hours":
      return v * 60;
    case "days":
      return v * 1440;
    default:
      return v * 60;
  }
}

// Check if an ad should trigger a reminder given a reminder window in minutes
function shouldNotifyForAd(ad, nowET, todayET, reminderMinutes) {
  let scheduledTimeET = null;
  let shouldNotify = false;

  if (ad.post_type === "One-Time Post" && ad.schedule && ad.post_time) {
    const dateStr = new Date(ad.schedule).toISOString().split("T")[0];
    scheduledTimeET = parseETTime(dateStr, ad.post_time);

    const timeDiffMs = scheduledTimeET.getTime() - nowET.getTime();
    const timeDiffMinutes = timeDiffMs / (1000 * 60);

    shouldNotify = timeDiffMinutes > -5 && timeDiffMinutes <= reminderMinutes;
  } else if (
    ad.post_type === "Daily Run" &&
    ad.post_date_from &&
    ad.post_date_to &&
    ad.post_time
  ) {
    const startDate = new Date(ad.post_date_from).toISOString().split("T")[0];
    const endDate = new Date(ad.post_date_to).toISOString().split("T")[0];

    if (todayET >= startDate && todayET <= endDate) {
      scheduledTimeET = parseETTime(todayET, ad.post_time);
      const timeDiffMs = scheduledTimeET.getTime() - nowET.getTime();
      const timeDiffMinutes = timeDiffMs / (1000 * 60);

      shouldNotify = timeDiffMinutes > -5 && timeDiffMinutes <= reminderMinutes;
    }
  } else if (ad.post_type === "Custom Schedule" && ad.custom_dates) {
    const customDates = Array.isArray(ad.custom_dates) ? ad.custom_dates : [];
    for (const dateObj of customDates) {
      if (dateObj.date && dateObj.time) {
        scheduledTimeET = parseETTime(dateObj.date, dateObj.time);
        const timeDiffMs = scheduledTimeET.getTime() - nowET.getTime();
        const timeDiffMinutes = timeDiffMs / (1000 * 60);
        if (timeDiffMinutes > -5 && timeDiffMinutes <= reminderMinutes) {
          shouldNotify = true;
          break;
        }
      }
    }
  }

  return { shouldNotify, scheduledTimeET };
}

// Build common time/date display info
function buildTimeInfo(scheduledTimeET, nowET) {
  const dayOfWeek = scheduledTimeET.toLocaleDateString("en-US", {
    weekday: "long",
  });
  const formattedDate = scheduledTimeET.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = scheduledTimeET.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const minutesUntil = Math.round(
    (scheduledTimeET.getTime() - nowET.getTime()) / (1000 * 60),
  );
  let timeUntilText = "";
  if (minutesUntil < 0) {
    timeUntilText = "now";
  } else if (minutesUntil < 60) {
    timeUntilText = `in ${minutesUntil} minute${minutesUntil !== 1 ? "s" : ""}`;
  } else if (minutesUntil < 1440) {
    const hours = Math.round(minutesUntil / 60);
    timeUntilText = `in ${hours} hour${hours !== 1 ? "s" : ""}`;
  } else {
    const days = Math.round(minutesUntil / 1440);
    timeUntilText = `in ${days} day${days !== 1 ? "s" : ""}`;
  }

  const etHour = nowET.getHours();
  let greeting = "Good Morning";
  if (etHour >= 12 && etHour < 17) greeting = "Good Afternoon";
  if (etHour >= 17) greeting = "Good Evening";

  return { dayOfWeek, formattedDate, formattedTime, timeUntilText, greeting };
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const debugMode = url.searchParams.get("debug") === "true";

    const nowUTC = new Date();
    const nowET = getNowInET();
    const todayET = getETDateParts(nowUTC);

    console.log("🔔 REMINDER CHECK STARTED:", nowUTC.toISOString());
    console.log("🕐 Server UTC time:", nowUTC.toISOString());
    console.log("🕐 Eastern time:", nowET.toLocaleString());
    console.log("📅 Today in ET:", todayET);

    // Get all admin users with notification preferences
    const adminPrefs = await sql`
      SELECT 
        au.id as user_id,
        au.name as user_name,
        au.email as user_email,
        anp.email_enabled,
        anp.sms_enabled,
        anp.reminder_time_value,
        anp.reminder_time_unit,
        anp.email_address,
        anp.phone_number
      FROM auth_users au
      LEFT JOIN admin_notification_preferences anp ON au.id = anp.user_id
      WHERE au.role = 'admin'
    `;

    console.log(`📋 Found ${adminPrefs.length} admin(s) to check`);

    // Get all scheduled ads
    const upcomingAds = await sql`
      SELECT 
        id,
        ad_name,
        advertiser,
        post_type,
        placement,
        post_date_from,
        post_date_to,
        custom_dates,
        schedule,
        post_time::TEXT as post_time,
        media,
        ad_text,
        reminder_minutes
      FROM ads
      WHERE status = 'Scheduled'
    `;

    console.log(`📢 Found ${upcomingAds.length} scheduled ad(s)`);

    // Get all advertisers for matching
    const allAdvertisers = await sql`
      SELECT id, advertiser_name, contact_name, email, phone_number
      FROM advertisers
    `;

    const results = [];
    const debugInfo = [];

    // ═══════════════════════════════════════════════════════
    // 1) ADMIN REMINDERS — uses admin's reminder_time settings
    // ═══════════════════════════════════════════════════════
    for (const pref of adminPrefs) {
      console.log(
        `\n👤 Checking admin: ${pref.user_name} (email_enabled: ${pref.email_enabled})`,
      );

      if (!pref.email_enabled && !pref.sms_enabled) {
        console.log("   ⏭️  Skipping - notifications disabled");
        continue;
      }

      // Use admin's own reminder timing from settings
      const adminReminderMinutes = adminReminderToMinutes(
        pref.reminder_time_value || 1,
        pref.reminder_time_unit || "hours",
      );

      console.log(
        `   ⏰ Admin reminder window: ${adminReminderMinutes} minutes (${pref.reminder_time_value} ${pref.reminder_time_unit})`,
      );

      for (const ad of upcomingAds) {
        const { shouldNotify, scheduledTimeET } = shouldNotifyForAd(
          ad,
          nowET,
          todayET,
          adminReminderMinutes,
        );

        if (debugMode) {
          debugInfo.push({
            type: "admin",
            admin: pref.user_name,
            ad_id: ad.id,
            ad_name: ad.ad_name,
            reminderWindow: adminReminderMinutes,
            shouldNotify,
          });
        }

        if (!shouldNotify || !scheduledTimeET) continue;

        // Check duplicate — only for admin reminders
        const existingReminder = await sql`
          SELECT id FROM sent_reminders
          WHERE ad_id = ${ad.id}
          AND recipient_type = 'admin'
          AND sent_at > NOW() - INTERVAL '24 hours'
          LIMIT 1
        `;

        if (existingReminder.length > 0) {
          console.log(
            `   ⏭️  Skipping admin reminder for "${ad.ad_name}" - already sent within 24 hours`,
          );
          results.push({
            type: "admin_email",
            ad_id: ad.id,
            ad_name: ad.ad_name,
            status: "already_sent",
            message: "Admin reminder already sent within last 24 hours",
          });
          continue;
        }

        const {
          dayOfWeek,
          formattedDate,
          formattedTime,
          timeUntilText,
          greeting,
        } = buildTimeInfo(scheduledTimeET, nowET);

        const media = Array.isArray(ad.media) ? ad.media : [];
        const images = media.filter((m) => m.type === "image");
        const videos = media.filter((m) => m.type === "video");

        // Send admin email
        if (pref.email_enabled && (pref.email_address || pref.user_email)) {
          const recipientEmail = pref.email_address || pref.user_email;
          try {
            console.log(
              `   📧 Sending ADMIN email to ${recipientEmail} for ad "${ad.ad_name}"`,
            );

            const userName = pref.user_name || "Admin";
            const firstName = userName.split(" ")[0];

            const mediaFields = {};
            images.forEach((img, i) => {
              mediaFields[`image${i + 1}Url`] = img.url || img.cdnUrl || "";
            });
            videos.forEach((vid, i) => {
              mediaFields[`video${i + 1}Url`] = vid.url || vid.cdnUrl || "";
            });

            // Find advertiser info for this ad
            const advertiserInfo = allAdvertisers.find(
              (adv) =>
                adv.advertiser_name.toLowerCase() ===
                ad.advertiser.toLowerCase(),
            );

            const webhookResponse = await fetch(
              process.env.ZAPIER_WEBHOOK_URL,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipientType: "admin",
                  to: recipientEmail,
                  from: "Ad Manager <advertise@cbnads.com>",
                  subject: `Ad Reminder | ${ad.advertiser} | ${dayOfWeek}, ${formattedTime} ET`,
                  greeting: greeting,
                  firstName: firstName,
                  adName: ad.ad_name,
                  advertiser: ad.advertiser,
                  advertiserEmail: advertiserInfo?.email || "",
                  advertiserPhone: advertiserInfo?.phone_number || "",
                  placement: ad.placement,
                  formattedTime: formattedTime + " ET",
                  formattedDate: formattedDate,
                  timeUntilText: timeUntilText,
                  adText: ad.ad_text || "",
                  imageCount: images.length,
                  videoCount: videos.length,
                  ...mediaFields,
                }),
              },
            );

            if (!webhookResponse.ok) {
              const errText = await webhookResponse.text();
              throw new Error(
                `Zapier webhook returned status ${webhookResponse.status}: ${errText}`,
              );
            }

            console.log(`   ✅ Admin webhook sent successfully!`);

            results.push({
              type: "admin_email",
              to: recipientEmail,
              ad_name: ad.ad_name,
              status: "sent",
            });

            await sql`
              INSERT INTO sent_reminders (ad_id, reminder_type, recipient_type)
              VALUES (${ad.id}, 'email', 'admin')
            `;
          } catch (err) {
            console.error(`   ❌ Failed to send admin email:`, err);
            results.push({
              type: "admin_email",
              to: recipientEmail,
              ad_name: ad.ad_name,
              status: "failed",
              error: err.message,
            });
          }
        }

        // Send admin SMS
        if (pref.sms_enabled && pref.phone_number) {
          try {
            const message = `Reminder: Ad "${ad.ad_name}" for ${ad.advertiser} is scheduled to be posted ${timeUntilText}. Placement: ${ad.placement}`;
            console.log(`   📱 Admin SMS to ${pref.phone_number}: ${message}`);
            results.push({
              type: "admin_sms",
              to: pref.phone_number,
              ad_name: ad.ad_name,
              status: "logged",
            });

            await sql`
              INSERT INTO sent_reminders (ad_id, reminder_type, recipient_type)
              VALUES (${ad.id}, 'sms', 'admin')
            `;
          } catch (err) {
            console.error("   ❌ Failed to send admin SMS:", err);
            results.push({
              type: "admin_sms",
              to: pref.phone_number,
              ad_name: ad.ad_name,
              status: "failed",
              error: err.message,
            });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // 2) ADVERTISER REMINDERS — uses the ad's reminder_minutes
    // ═══════════════════════════════════════════════════════
    for (const ad of upcomingAds) {
      const adReminderMinutes = ad.reminder_minutes || 15;

      const { shouldNotify, scheduledTimeET } = shouldNotifyForAd(
        ad,
        nowET,
        todayET,
        adReminderMinutes,
      );

      if (debugMode) {
        debugInfo.push({
          type: "advertiser",
          ad_id: ad.id,
          ad_name: ad.ad_name,
          advertiser: ad.advertiser,
          reminderWindow: adReminderMinutes,
          shouldNotify,
        });
      }

      if (!shouldNotify || !scheduledTimeET) continue;

      // Find the advertiser's info
      const advertiserMatch = allAdvertisers.find(
        (adv) =>
          adv.advertiser_name.toLowerCase() === ad.advertiser.toLowerCase(),
      );

      if (!advertiserMatch || !advertiserMatch.email) {
        console.log(
          `   ⏭️  Skipping advertiser reminder for "${ad.ad_name}" - no matching advertiser or no email on file`,
        );
        results.push({
          type: "advertiser_email",
          ad_id: ad.id,
          ad_name: ad.ad_name,
          status: "skipped",
          message: "No advertiser email found",
        });
        continue;
      }

      // Check duplicate — only for advertiser reminders
      const existingReminder = await sql`
        SELECT id FROM sent_reminders
        WHERE ad_id = ${ad.id}
        AND recipient_type = 'advertiser'
        AND sent_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
      `;

      if (existingReminder.length > 0) {
        console.log(
          `   ⏭️  Skipping advertiser reminder for "${ad.ad_name}" - already sent within 24 hours`,
        );
        results.push({
          type: "advertiser_email",
          ad_id: ad.id,
          ad_name: ad.ad_name,
          status: "already_sent",
          message: "Advertiser reminder already sent within last 24 hours",
        });
        continue;
      }

      const {
        dayOfWeek,
        formattedDate,
        formattedTime,
        timeUntilText,
        greeting,
      } = buildTimeInfo(scheduledTimeET, nowET);

      const advertiserName =
        advertiserMatch.contact_name || advertiserMatch.advertiser_name;
      const advertiserFirstName = advertiserName.split(" ")[0];

      const media = Array.isArray(ad.media) ? ad.media : [];
      const images = media.filter((m) => m.type === "image");
      const videos = media.filter((m) => m.type === "video");

      try {
        console.log(
          `   📧 Sending ADVERTISER email to ${advertiserMatch.email} for ad "${ad.ad_name}"`,
        );

        const mediaFields = {};
        images.forEach((img, i) => {
          mediaFields[`image${i + 1}Url`] = img.url || img.cdnUrl || "";
        });
        videos.forEach((vid, i) => {
          mediaFields[`video${i + 1}Url`] = vid.url || vid.cdnUrl || "";
        });

        const webhookResponse = await fetch(process.env.ZAPIER_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientType: "advertiser",
            to: advertiserMatch.email,
            advertiserEmail: advertiserMatch.email,
            advertiserPhone: advertiserMatch.phone_number || "",
            from: "Ad Manager <advertise@cbnads.com>",
            subject: `Upcoming Ad Reminder | ${ad.ad_name} | ${dayOfWeek}, ${formattedTime} ET`,
            greeting: `Hello ${advertiserFirstName}`,
            firstName: advertiserFirstName,
            advertiserName: advertiserName,
            adName: ad.ad_name,
            advertiser: ad.advertiser,
            placement: ad.placement,
            formattedTime: formattedTime + " ET",
            formattedDate: formattedDate,
            timeUntilText: timeUntilText,
            adText: ad.ad_text || "",
            imageCount: images.length,
            videoCount: videos.length,
            ...mediaFields,
          }),
        });

        if (!webhookResponse.ok) {
          const errText = await webhookResponse.text();
          throw new Error(
            `Zapier webhook returned status ${webhookResponse.status}: ${errText}`,
          );
        }

        console.log(`   ✅ Advertiser webhook sent successfully!`);

        results.push({
          type: "advertiser_email",
          to: advertiserMatch.email,
          ad_name: ad.ad_name,
          advertiser: advertiserName,
          status: "sent",
        });

        await sql`
          INSERT INTO sent_reminders (ad_id, reminder_type, recipient_type)
          VALUES (${ad.id}, 'email', 'advertiser')
        `;
      } catch (err) {
        console.error(`   ❌ Failed to send advertiser email:`, err);
        results.push({
          type: "advertiser_email",
          to: advertiserMatch.email,
          ad_name: ad.ad_name,
          status: "failed",
          error: err.message,
        });
      }
    }

    console.log(`\n✅ REMINDER CHECK COMPLETE:`, {
      totalResults: results.length,
      resultsSummary: results.map((r) => `${r.type}:${r.status}`),
    });

    const response = {
      success: true,
      totalResults: results.length,
      results,
    };

    if (debugMode) {
      response.debug = {
        serverTimeUTC: nowUTC.toISOString(),
        easternTime: nowET.toLocaleString(),
        todayET,
        adminCount: adminPrefs.length,
        adCount: upcomingAds.length,
        advertiserCount: allAdvertisers.length,
        checks: debugInfo,
      };
    }

    return Response.json(response);
  } catch (err) {
    console.error("❌ POST /api/admin/send-reminders error", err);
    return Response.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return POST(request);
}
