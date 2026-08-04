import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tata — signal becomes structure",
  description: "A city built from your notes. Every page you write becomes a structure; the archive grows into a skyline.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
