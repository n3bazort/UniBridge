import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "PPP System",
  description: "Sistema de Prácticas Preprofesionales ULEAM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.className} antialiased min-h-screen`} style={{ backgroundColor: 'var(--color-brand-app)', color: 'var(--color-brand-text)' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
