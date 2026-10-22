export default function manifest() {
  return {
    name: "Studio Ledger", short_name: "Ledger", start_url: "/", display: "standalone",
    background_color: "#000000", theme_color: "#000000",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }, { src: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  };
}
