import type { Metadata } from "next";
import { Cormorant_Garamond, Poppins } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-cormorant'
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins'
});

export const metadata: Metadata = {
  title: {
    template: "%s | Thug Supply ERP",
    default: "Thug Supply ERP",
  },
  description: "Sistem manajemen bisnis terintegrasi untuk Thug Supply — Purchase, Inventory, Sales, Manufacturing & Accounting.",
  keywords: ["ERP", "Thug Supply", "inventory", "sales", "manufacturing", "accounting"],
};

import Providers from "@/components/providers/Providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`dark ${cormorant.variable} ${poppins.variable}`}>
      <head>
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
