import { dateOnly, db, normalizePostType, table } from "@/app/api/utils/supabase-db";
import { requireAdmin } from "@/app/api/utils/auth-check";

const adPrimaryDate = (ad) => dateOnly(ad?.schedule || ad?.post_date_from || ad?.post_date);

export async function GET(request) {
  try {
    const admin = await requireAdmin();
    if (!admin.authorized) {
      return Response.json({ error: admin.error }, { status: 401 });
    }

    const supabase = db();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const placement = searchParams.get("placement");
    const postType = searchParams.get("postType");
    const search = searchParams.get("search");
    const advertiser = searchParams.get("advertiser");
    const payment = searchParams.get("payment");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const showArchived = searchParams.get("showArchived") === "true";

    const { data, error } = await supabase
      .from(table("ads"))
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const today = dateOnly(new Date());

    let ads = (data || []).filter((ad) => showArchived || !ad.archived);

    // status view filters
    if (status === "Upcoming Ads") {
      ads = ads.filter(
        (ad) =>
          String(ad.status || "").toLowerCase() === "scheduled" &&
          adPrimaryDate(ad) >= today,
      );
    } else if (status === "Past Ads") {
      ads = ads.filter((ad) => {
        const date = adPrimaryDate(ad);
        return date && date < today;
      });
    } else if (status === "Needs Payment") {
      ads = ads.filter((ad) => String(ad.payment || "").toLowerCase() !== "paid");
    } else if (status === "Ready to Publish") {
      ads = ads.filter(
        (ad) =>
          String(ad.status || "").toLowerCase() === "draft" &&
          String(ad.payment || "").toLowerCase() === "paid",
      );
    } else if (status === "Today") {
      ads = ads.filter((ad) => adPrimaryDate(ad) === today);
    } else if (status === "This Week") {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndDate = dateOnly(weekEnd);
      ads = ads.filter((ad) => {
        const date = adPrimaryDate(ad);
        return date && date >= today && date <= weekEndDate;
      });
    } else if (status && status !== "All Ads") {
      ads = ads.filter((ad) => String(ad.status || "") === status);
    }

    if (placement && placement !== "All Placement") {
      ads = ads.filter((ad) => String(ad.placement || "") === placement);
    }

    if (postType && postType !== "All post types") {
      const targetType = normalizePostType(postType);
      ads = ads.filter((ad) => normalizePostType(ad.post_type) === targetType);
    }

    if (advertiser && advertiser !== "All Advertisers") {
      ads = ads.filter((ad) => String(ad.advertiser || "") === advertiser);
    }

    if (payment && payment !== "All Payment Status") {
      ads = ads.filter((ad) => String(ad.payment || "") === payment);
    }

    if (dateFrom) {
      const from = dateOnly(dateFrom);
      ads = ads.filter((ad) => {
        const date = adPrimaryDate(ad);
        return date && date >= from;
      });
    }

    if (dateTo) {
      const to = dateOnly(dateTo);
      ads = ads.filter((ad) => {
        const date = adPrimaryDate(ad);
        return date && date <= to;
      });
    }

    if (search) {
      const needle = String(search).toLowerCase();
      ads = ads.filter((ad) => {
        const adName = String(ad.ad_name || "").toLowerCase();
        const adAdvertiser = String(ad.advertiser || "").toLowerCase();
        return adName.includes(needle) || adAdvertiser.includes(needle);
      });
    }

    ads.sort((a, b) => {
      const left = `${adPrimaryDate(a) || ""} ${a.post_time || ""}`;
      const right = `${adPrimaryDate(b) || ""} ${b.post_time || ""}`;
      return right.localeCompare(left);
    });

    return Response.json({ ads });
  } catch (error) {
    console.error("Error fetching ads:", error);
    return Response.json({ error: "Failed to fetch ads" }, { status: 500 });
  }
}
