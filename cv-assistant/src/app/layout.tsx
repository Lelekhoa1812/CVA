import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Navbar from "@/components/Navbar";

const bodyFont = localFont({
  src: "../../public/fonts/Manrope-Variable.ttf",
  variable: "--font-body",
  weight: "200 800",
});

const displayFont = localFont({
  src: "../../public/fonts/Fraunces-Variable.ttf",
  variable: "--font-display",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "CV Assistant | Premium Career Storytelling",
  description: "Craft a stronger profile, refined resume, and high-conviction cover letter in one premium workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

const themeInitScript = `
(() => {
  try {
    const savedTheme = localStorage.getItem("theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme || (systemDark ? "dark" : "light");
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        {/* Root Cause: the theme class was previously applied only after hydration, which can flash the wrong palette.
            Logic: seed the class before React mounts so the dark-first art direction stays visually stable. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ThemeProvider>
          <Navbar />
          <main className="min-h-screen pb-16">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
