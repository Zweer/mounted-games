import type { ReactNode } from "react";

export function TopBar(): ReactNode {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-screen-sm items-center px-4">
        <span className="font-heading text-lg font-semibold tracking-tight">
          Mounted Games
        </span>
      </div>
    </header>
  );
}
