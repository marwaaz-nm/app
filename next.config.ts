import type { NextConfig } from "next";

const desktopAppDownloadUrl =
  "https://github.com/marwaaz-nm/app/releases/download/desktop-v0.1.0/Marwaazpn-App-Setup.exe";

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
};

export default nextConfig;
