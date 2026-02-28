import { AlertCircle, BellRing, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

const VARIANT_STYLES = {
  info: {
    icon: BellRing,
    iconWrapperClass: "bg-slate-100 text-slate-700",
  },
  success: {
    icon: CheckCircle2,
    iconWrapperClass: "bg-emerald-100 text-emerald-700",
  },
  error: {
    icon: AlertCircle,
    iconWrapperClass: "bg-red-100 text-red-700",
  },
  warning: {
    icon: TriangleAlert,
    iconWrapperClass: "bg-amber-100 text-amber-700",
  },
  neutral: {
    icon: Info,
    iconWrapperClass: "bg-slate-100 text-slate-700",
  },
};

function ToastCard({ id, title, description, action, variant = "neutral" }) {
  const config = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const Icon = config.icon;

  return (
    <div className="pointer-events-auto flex min-w-[320px] max-w-[380px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.iconWrapperClass}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>

      {action?.label ? (
        <button
          type="button"
          onClick={() => {
            action.onClick?.();
            toast.dismiss(id);
          }}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

function showToast({
  title,
  description = "",
  variant = "neutral",
  action,
  duration = 3600,
  id,
}) {
  return toast.custom(
    (toastId) => (
      <ToastCard
        id={toastId}
        title={title}
        description={description}
        action={action}
        variant={variant}
      />
    ),
    {
      id,
      duration,
    },
  );
}

export const appToast = {
  show: showToast,
  info: (options) => showToast({ ...options, variant: "info" }),
  success: (options) => showToast({ ...options, variant: "success" }),
  error: (options) => showToast({ ...options, variant: "error" }),
  warning: (options) => showToast({ ...options, variant: "warning" }),
  submissionReceived: ({ count = 1, onView } = {}) =>
    showToast({
      id: "new-submission-toast",
      variant: "info",
      title:
        Number(count) > 1 ? `${count} new ad submissions received` : "New ad submission received",
      description: "Click to view pending submissions",
      action: onView ? { label: "View", onClick: onView } : undefined,
      duration: 5000,
    }),
};
