const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

export function ProductSelectionSection({
  products = [],
  selectedProductId = "",
  onSelectProduct,
  loading = false,
  error = "",
  occurrenceCount = 0,
}) {
  const selectedProduct = (Array.isArray(products) ? products : []).find(
    (item) => String(item?.id || "") === String(selectedProductId || ""),
  );
  const unitPrice = Number(selectedProduct?.price || 0) || 0;
  const estimatedTotal = unitPrice * Math.max(occurrenceCount, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Product Option</h3>
          <p className="mt-1 text-xs text-gray-500">
            Choose the product to bill for this request. The selected price is saved with
            your submission and used for admin approval and invoicing.
          </p>
        </div>
        {selectedProduct ? (
          <div className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white">
            {formatCurrency(unitPrice)}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={`product-skeleton-${index}`}
              className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : !Array.isArray(products) || products.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No product options are available right now. Contact the CBN team before
          submitting a new ad request.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((product) => {
            const isSelected = String(product?.id || "") === String(selectedProductId || "");

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelectProduct?.(product)}
                className={`rounded-2xl border bg-white p-4 text-left transition-all ${
                  isSelected
                    ? "border-gray-900 ring-2 ring-gray-900 ring-offset-0 shadow-sm"
                    : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">
                      {product.product_name || "Untitled product"}
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
                      {product.placement || "Standard"}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-gray-900">
                    {formatCurrency(product.price)}
                  </div>
                </div>
                {product.description ? (
                  <p className="mt-3 text-xs leading-relaxed text-gray-500">
                    {product.description}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {selectedProduct ? (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {selectedProduct.product_name}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {formatCurrency(unitPrice)} per scheduled post on{" "}
                <span className="font-medium text-gray-700">
                  {selectedProduct.placement || "Standard"}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Estimated Total
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {occurrenceCount > 0 ? formatCurrency(estimatedTotal) : "TBD"}
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-600">
            {occurrenceCount > 0
              ? `Based on ${occurrenceCount} scheduled ${
                  occurrenceCount === 1 ? "post" : "posts"
                }.`
              : "Finish selecting your schedule to calculate the total automatically."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
