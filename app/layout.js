import "./globals.css";

export const metadata = {
  title: "Studio Ledger",
  description: "Production finance, schedule and crew for Madking Studios and Space & Gravity.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Studio Ledger", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#000000" };

export default function RootLayout({ children }) {
  return <html lang="en-IN"><body>{children}</body></html>;
}
