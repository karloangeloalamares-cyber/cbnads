import { table } from "./supabase-db.js";

const getFirstRow = (value) => (Array.isArray(value) ? value[0] || null : value || null);

export const isPendingSubmissionAlreadyProcessedError = (error) => {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  return (
    code === "23505" &&
    /source_pending_ad_id|cbnads_web_ads_source_pending_ad_id_uniq/i.test(
      `${message} ${details} ${hint}`,
    )
  );
};

export const isPendingNotFoundError = (error) =>
  String(error?.message || "").toLowerCase().includes("pending_not_found");

export const convertPendingToAdAtomic = async ({
  supabase,
  pendingAdId,
  adPayload = {},
  deletePending = true,
} = {}) => {
  const normalizedPendingAdId = String(pendingAdId || "").trim();
  if (!normalizedPendingAdId) {
    throw new Error("pendingAdId is required");
  }

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "cbnads_web_convert_pending_to_ad_atomic",
    {
      p_pending_ad_id: normalizedPendingAdId,
      p_ad: adPayload || {},
      p_delete_pending: deletePending !== false,
    },
  );
  if (rpcError) {
    throw rpcError;
  }

  const rpcResult = getFirstRow(rpcRows);
  const adId = String(rpcResult?.ad_id || "").trim();
  if (!adId) {
    throw new Error("Pending conversion RPC returned no ad id.");
  }

  const { data: ad, error: adError } = await supabase
    .from(table("ads"))
    .select("*")
    .eq("id", adId)
    .maybeSingle();
  if (adError) {
    throw adError;
  }
  if (!ad) {
    throw new Error("Converted ad row was not found.");
  }

  return {
    ad,
    created: rpcResult?.created === true,
    reason: String(rpcResult?.reason || "").trim() || null,
  };
};
