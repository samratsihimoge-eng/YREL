import type { Metadata } from "next";
import "./global.css";
import "./customer-premium-theme.css";
const yrelBrandIcon = "https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png?v=20261125";

export const metadata: Metadata = {
  title: "YREL — Your city, your ride",
  description: "Book a cab or a professional driver with YREL.",
  icons: {
    icon: [{ url: yrelBrandIcon, type: "image/png" }],
    shortcut: [yrelBrandIcon],
    apple: [{ url: yrelBrandIcon }]
  }
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
