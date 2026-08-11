import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farewell Raffle",
  description: "Register, spin the wheel, win a prize — one last time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
