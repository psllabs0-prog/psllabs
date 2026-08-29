import { DiscordIcon } from "@/components/icons/discord-icon";
import { cn } from "@/lib/utils";

type DiscordContactLinkProps = {
  href: string;
  className?: string;
};

/** Icon-only Discord invite — matches contact panel icon sizing. */
export function DiscordContactLink({ href, className }: DiscordContactLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join PSL Labs on Discord"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-paper text-ash",
        "transition-colors duration-200 ease-out",
        "hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10 hover:text-[#5865F2]",
        "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className
      )}
    >
      <DiscordIcon className="size-[1.125rem]" />
    </a>
  );
}
