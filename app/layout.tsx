import type { Metadata } from "next";
import "./global.css";

export const metadata: Metadata = {
  title: "YREL — Your city, your ride",
  description: "Book a cab or a professional driver with YREL.",
  applicationName: "YREL",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }]
  }
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
