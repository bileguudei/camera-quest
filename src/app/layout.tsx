import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/manrope";
import "@fontsource-variable/nunito";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camera Quest — Хай. Харуул. Оноо ав.",
  description:
    "Камераа ашиглан даалгаврыг хамгийн хурдан биелүүлээрэй. 1–6 тоглогчийн камерын тоглоом.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Camera Quest" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#070a16",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="mn" className="h-full antialiased">
      <body className="min-h-full bg-bg text-ink">{children}</body>
    </html>
  );
}
