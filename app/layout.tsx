import type { Metadata } from "next";
import "./global.css";
export const metadata: Metadata = {
  title: "YREL — Your city, your ride",
  description: "Book a cab or a professional driver with YREL."
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
