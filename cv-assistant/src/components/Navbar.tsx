"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { buildApiUrl } from "@/lib/api";

const links = [
  { href: "/profile", label: "Your Profile", short: "Profile" },
  { href: "/resume", label: "Resume Lab", short: "Resume" },
  { href: "/generate", label: "Cover Letter", short: "Cv" },
  { href: "/search", label: "Job Search", short: "Search" },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function logout() {
    await fetch(buildApiUrl("/api/auth/logout"), { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-border/80 bg-[linear-gradient(180deg,hsl(var(--surface-1)/0.9),hsl(var(--surface-2)/0.76))] px-4 py-3 shadow-elevated backdrop-blur-2xl">
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-border/80 bg-[hsl(var(--surface-2)/0.78)]">
            <div className="absolute inset-1 rounded-xl bg-[linear-gradient(135deg,hsl(var(--accent)/0.92),hsl(var(--primary)/0.62),hsl(var(--warm)/0.74))] blur-sm" />
            <div className="bg-foreground text-background relative flex h-8 w-8 items-center justify-center rounded-xl">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m1 5H8a2 2 0 01-2-2V5a2 2 0 012-2h5.17a2 2 0 011.41.58l3.83 3.83A2 2 0 0119 8.83V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="text-foreground font-display text-xl">CV Assistant</div>
            <div className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
              Career Storytelling Suite
            </div>
          </div>
        </Link>

        <div className="hidden items-center gap-2 lg:flex">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center rounded-full px-4 py-2 text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="active-nav-pill"
                    className="absolute inset-0 rounded-full border border-primary/25 bg-[linear-gradient(180deg,hsl(var(--surface-2)/0.94),hsl(var(--surface-3)/0.78))]"
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  />
                ) : null}
                <span className="relative z-10">{link.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden rounded-full border border-border/80 bg-[hsl(var(--surface-2)/0.7)] px-3 py-2 md:flex md:items-center md:gap-2">
            <span className="status-dot" />
            <span className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
              {theme === "dark" ? "Orbit Mode" : "Sunny Mode"}
            </span>
          </div>

          {/* Root Cause: the moon path sits close to the SVG bounds, so the stroke edge clipped inside the circular button.
              Logic: allow the icon to overflow its box slightly and keep the button styling theme-aware so the control remains intact in both modes. */}
          <button
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-[linear-gradient(180deg,hsl(var(--surface-2)/0.88),hsl(var(--surface-3)/0.66))] hover:border-primary/35"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <svg className="h-5 w-5 overflow-visible" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 3v1.5M12 19.5V21M4.5 12H3m18 0h-1.5m-12.2 5.3l-1 1m10.4-10.4l1-1m-10.4 0l-1-1m10.4 10.4l1 1M15.5 12a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5 overflow-visible" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.5 9.5 0 1012 21a9 9 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>

          <button
            onClick={logout}
            className="hidden rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-600 hover:border-rose-300/40 hover:bg-rose-400/14 dark:text-rose-200 md:inline-flex"
          >
            Logout
          </button>

          <button
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="text-muted-foreground hover:text-foreground inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-[linear-gradient(180deg,hsl(var(--surface-2)/0.88),hsl(var(--surface-3)/0.66))] lg:hidden"
            aria-label="Toggle navigation"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </nav>

      {mobileMenuOpen ? (
        <div className="mx-auto mt-3 max-w-7xl lg:hidden">
          <div className="glass-panel overflow-hidden rounded-[1.5rem] p-3">
            {links.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium",
                    active
                      ? "bg-[hsl(var(--surface-2)/0.92)] text-foreground"
                      : "text-muted-foreground hover:bg-[hsl(var(--surface-2)/0.88)] hover:text-foreground",
                  )}
                >
                  <span>{link.short}</span>
                  {active ? <span className="status-dot" /> : null}
                </Link>
              );
            })}
            <button
              onClick={logout}
              className="mt-2 flex w-full items-center justify-between rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-100"
            >
              <span>Logout</span>
              <span className="status-dot" />
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
