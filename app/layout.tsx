import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mbition Farewell Raffle ∿",
  description:
    "Draft beers, sandwiches, and a wheel that decides your fate. Friday the 14th, 18:00. Everything else is classified.",
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
