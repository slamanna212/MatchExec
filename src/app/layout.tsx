import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import { Providers } from "./providers";
import { ColorSchemeScript } from '@mantine/core';
import { ConditionalNavigation } from '@/components/ConditionalNavigation';
import { DatabaseStatusWrapper } from '@/components/DatabaseStatusWrapper';
import { KeyboardShortcutsProvider } from '@/components/keyboard-shortcuts/KeyboardShortcutsProvider';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "MatchExec",
  description: "Discord tournament management bot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-title" content="MatchExec" />
        <meta name="theme-color" content="#241459" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} antialiased`}
      >
        <Providers>
          <DatabaseStatusWrapper>
            <KeyboardShortcutsProvider>
              <ConditionalNavigation>
                {children}
              </ConditionalNavigation>
            </KeyboardShortcutsProvider>
          </DatabaseStatusWrapper>
        </Providers>
      </body>
    </html>
  );
}
