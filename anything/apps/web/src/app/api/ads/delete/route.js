import sql from "@/app/api/utils/sql";
import { updateAdvertiserNextAdDate } from "@/app/api/utils/update-advertiser-next-ad";

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Ad ID is required" }, { status: 400 });
    }

    const result = await sql(
      "DELETE FROM ads WHERE id = $1 RETURNING *, post_time::TEXT as post_time",
      [id],
    );

    if (result.length === 0) {
      return Response.json({ error: "Ad not found" }, { status: 404 });
    }

    // Update the advertiser's next_ad_date after deletion
    const advertiser = result[0].advertiser;
    if (advertiser) {
      await updateAdvertiserNextAdDate(advertiser);
    }

    return Response.json({ success: true, ad: result[0] });
  } catch (error) {
    console.error("Error deleting ad:", error);
    return Response.json({ error: "Failed to delete ad" }, { status: 500 });
  }
}
