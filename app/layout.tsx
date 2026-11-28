import type { Metadata, Viewport } from "next";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aveeswa.in"),
  title: {
    default: "YREL — Your Ride, Your Fun",
    template: "%s | YREL"
  },
  description: "Book city rides, outstation journeys, professional drivers and cab rentals with YREL.",
  applicationName: "YREL",
  appleWebApp: {
    capable: true,
    title: "YREL",
    statusBarStyle: "default"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }]
  },
  openGraph: {
    title: "YREL — Your Ride, Your Fun",
    description: "Every journey, thoughtfully connected.",
    url: "https://aveeswa.in",
    siteName: "YREL",
    type: "website"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FFF9F2"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
