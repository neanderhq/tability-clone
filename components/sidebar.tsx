"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", symbol: "D" },
  { href: "/objectives", label: "Objectives", symbol: "O" },
  { href: "/cycles", label: "Cycles", symbol: "C" },
  { href: "/check-ins", label: "Check-ins", symbol: "I" },
  { href: "/reports", label: "Reports", symbol: "R" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden min-h-screen w-64 shrink-0 border-r border-border bg-white px-4 py-5 lg:block">
        <Link className="flex items-center gap-3 px-2" href="/dashboard">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            T
          </span>
          <span className="text-base font-semibold">Tability Clone</span>
        </Link>

        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-slate-600 hover:bg-muted"
                }`}
                href={item.href}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded text-xs ${
                    isActive
                      ? "bg-white/20"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {item.symbol}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-white lg:hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              className={`grid min-h-16 place-items-center gap-1 px-2 py-2 text-xs font-medium transition ${
                isActive
                  ? "text-primary"
                  : "text-slate-600 hover:bg-muted"
              }`}
              href={item.href}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded text-xs ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {item.symbol}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
