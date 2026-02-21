import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EliteEcon MVP",
  description: "AQA-aligned Economics feedback prototype"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
