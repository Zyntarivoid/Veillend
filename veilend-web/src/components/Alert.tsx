import React from "react";

type AlertVariant = "default" | "success" | "warning" | "error" | "info";

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "default",
  title,
  children,
  className = "",
}) => {
  const variantStyles: Record<AlertVariant, { bg: string; border: string; text: string; icon: string }> = {
    default: {
      bg: "bg-card",
      border: "border-border",
      text: "text-text",
      icon: "📢",
    },
    success: {
      bg: "bg-success/10",
      border: "border-success/30",
      text: "text-success",
      icon: "✅",
    },
    warning: {
      bg: "bg-warning/10",
      border: "border-warning/30",
      text: "text-warning",
      icon: "⚠️",
    },
    error: {
      bg: "bg-error/10",
      border: "border-error/30",
      text: "text-error",
      icon: "❌",
    },
    info: {
      bg: "bg-secondary/10",
      border: "border-secondary/30",
      text: "text-secondary",
      icon: "ℹ️",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${styles.bg} ${styles.border} ${className}`}
    >
      <span className="text-lg flex-shrink-0">{styles.icon}</span>
      <div>
        {title && (
          <h4 className={`font-semibold mb-1 ${styles.text}`}>{title}</h4>
        )}
        <p className="text-text-secondary">{children}</p>
      </div>
    </div>
  );
};
