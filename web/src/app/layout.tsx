import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { GlobalRealtimeListener } from "@/shared/ui/global-realtime";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GetBackplate",
  description: "Plataforma SaaS multi-tenant para operación interna",
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icons/icon-512x512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GetBackplate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${plusJakartaSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaRegister />
        <GlobalRealtimeListener />
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
