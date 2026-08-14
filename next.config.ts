import type { NextConfig } from "next";

const desktopAppDownloadUrl =
  "https://media.githubusercontent.com/media/marwaaz-nm/app/main/public/downloads/Marwaazpn-App-Setup.exe";

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
