import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "../styles.css";

export const metadata: Metadata = {
  title: { default: "Mian Nawaz Bricks — Kiln Khatta", template: "%s — Mian Nawaz Bricks" },
  description: "Patheer, rehra, nakasi, sales and expense khattas for Mian Nawaz Bricks.",
  icons: { icon: "/favicon.ico" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#5b2c1c" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
