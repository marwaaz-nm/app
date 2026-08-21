import type { NextConfig } from "next";

const desktopReleaseStorageUrl =
  "https://wcywhsepnhiersupaxyq.supabase.co/storage/v1/object/public/desktop-releases";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/downloads/desktop-parts/:part",
        destination: `${desktopReleaseStorageUrl}/Marwaazpn-App-Setup-v3.exe.part:part`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;


