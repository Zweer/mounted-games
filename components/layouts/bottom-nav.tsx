import { ListOrdered, Radio, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const items = [
  { href: "/", label: "Live", icon: Radio },
  { href: "/archive", label: "Archive", icon: ListOrdered },
  { href: "/stats", label: "Stats", icon: Trophy },
  { href: "/contribute", label: "Contribute", icon: Users },
] as const;

export function BottomNav(): ReactNode {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
      <ul className="mx-auto flex w-full max-w-screen-sm items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              className="flex flex-col items-center gap-1 py-2 text-muted-foreground text-xs transition-colors hover:text-foreground"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
