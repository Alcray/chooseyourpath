import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Կիսվել նշանակում է հոգ տանել",
  description: "Փոքրիկ ինտերակտիվ պատմություն ընկերության, ընտրության և կիսվելու մասին։",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hy">
      <body>{children}</body>
    </html>
  );
}
