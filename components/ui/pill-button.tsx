import Link from "next/link";

import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-ink text-lab-white hover:opacity-90",
  secondary:
    "border border-ink bg-transparent text-ink hover:bg-ink/5",
  ghost: "bg-transparent text-petrol underline-offset-4 hover:underline",
};

const sizes = {
  default: "px-6 py-3.5 text-base",
  sm: "px-5 py-2.5 text-sm",
};

export function PillButton({
  href,
  onClick,
  variant = "primary",
  size = "default",
  className,
  children,
  type = "button",
  disabled,
}: {
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm";
  className?: string;
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-pill font-medium transition-opacity duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
    >
      {children}
    </button>
  );
}
