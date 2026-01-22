import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email Sender API",
  description: "Send emails via Feishu API with Excel upload support",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
