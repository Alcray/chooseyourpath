import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "KindPath — Branching story studio for parents";
const description = "Turn one lesson into a consistent four-clip story where your child makes the choice.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "sharing-is-caring-hy.alcray.chatgpt.site";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0];
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const previewUrl = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title,
    description,
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: previewUrl, width: 1672, height: 941, alt: "KindPath moral-choice story studio" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [previewUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
