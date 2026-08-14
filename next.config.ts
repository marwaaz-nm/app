import type { NextConfig } from "next";

const desktopAppDownloadUrl =
  "https://github.com/marwaaz-nm/app/releases/download/desktop-v0.1.0/Marwaazpn-App-Setup.exe";
const desktopReleaseStorageUrl =
  "https://wcywhsepnhiersupaxyq.supabase.co/storage/v1/object/public/desktop-releases";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      {
        source: "/downloads/Marwaazpn-App-Setup.exe",
        destination: desktopAppDownloadUrl,
        permanent: false,
      },
      {
        source: "/downloads/GeoSurveyPro-Setup.exe",
        destination: desktopAppDownloadUrl,
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/downloads/desktop-parts/:part",
        destination: `${desktopReleaseStorageUrl}/Marwaazpn-App-Setup-v2.exe.part:part`,
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
