import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/layouts/bottom-nav";
import { TopBar } from "@/components/layouts/top-bar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mounted Games",
  description:
    "Live scoring, results archive and statistics for the Mounted Games equestrian discipline — Italian and European level.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TopBar />
          <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 pt-4 pb-20">
            {children}
          </main>
          <BottomNav />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
