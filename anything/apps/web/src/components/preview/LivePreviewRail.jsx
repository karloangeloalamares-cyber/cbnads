export function LivePreviewRail({ title, description, controls = null, children }) {
  return (
    <div className="hidden lg:flex sticky top-8 min-h-[720px] rounded-[32px] border border-gray-200 bg-white p-5 shadow-sm xl:p-6">
      <div className="flex w-full flex-col rounded-[26px] bg-[#F7F4EE] px-5 py-5">
        <div className="mb-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
            Live Preview
          </div>
          {title ? <div className="mt-2 text-sm font-semibold text-gray-900">{title}</div> : null}
          {description ? <p className="mt-1 text-xs leading-5 text-gray-600">{description}</p> : null}
        </div>
        {controls ? <div className="mb-5">{controls}</div> : null}
        <div className="flex-1 rounded-[28px] bg-white px-3 py-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
          {children}
        </div>
      </div>
    </div>
  );
}
