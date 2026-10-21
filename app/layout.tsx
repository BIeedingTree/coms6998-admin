import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Say It Better · Admin", template: "%s · Say It Better Admin" }, description: "The administration workspace for Say It Better.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
