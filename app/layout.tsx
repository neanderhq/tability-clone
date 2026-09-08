import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tability Clone",
  description: "OKR management for teams that check in every week.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
