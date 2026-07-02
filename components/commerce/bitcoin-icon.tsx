import { cn } from "@/lib/utils";

type BitcoinIconProps = {
  className?: string;
};

export function BitcoinIcon({ className }: BitcoinIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
    >
      <path d="M17.3 10.2c.2-1.4-.9-2.2-2.4-2.7l.5-2-1.2-.3-.5 1.9c-.3-.1-.7-.2-1-.3l.5-2-1.2-.3-.5 2c-.2 0-.5-.1-.7-.1l-1.7-.4-.3 1.3s.9.2.9.2c.5.1.6.4.6.7l-.6 2.4c0 .1.1.1.2.1h-.2l-.9 3.4c-.1.2-.3.5-.7.4 0 0-.9-.2-.9-.2l-.6 1.4 1.6.4c.3.1.6.2.9.3l-.5 2 1.2.3.5-2c.3.1.7.2 1 .3l-.5 2 1.2.3.5-2c3.2.6 5.6.4 6.6-2.5.8-2.3 0-3.6-1.7-4.5 1.2-.3 2.1-1.1 2.3-2.8zm-4.1 5.7c-.6 2.3-4.4 1-5.7.7l1-3.9c1.3.3 5.5.9 4.7 3.2zm.6-5.8c-.5 2.1-3.7 1-4.7.7l.9-3.5c1 .3 4.3.8 3.8 2.8z" />
    </svg>
  );
}
