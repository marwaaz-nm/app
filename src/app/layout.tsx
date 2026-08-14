import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ModalProvider } from "@/context/ModalContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { ThemeProvider } from "@/context/ThemeContext";
import FaviconUpdater from "@/components/FaviconUpdater";
import OfflineManager from "@/components/OfflineManager";

// Sets data-theme on <html> before React hydrates/paints, so there's no flash of the
// wrong theme on load. Reads the same localStorage key ThemeContext writes to.
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('geosurvey-theme');
    var theme = stored === 'dark' || stored === 'light'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "Marwaazpn App",
  description: "Diiwaangelinta iyo Sahanka Dhulka - Professional land survey management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="so"
      className={`${plusJakartaSans.variable} h-full antialiased`}
      // The theme script below sets data-theme on the client before hydration, which
      // the server render can't know about — React would otherwise flag that as a
      // hydration mismatch every single load.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${plusJakartaSans.className} min-h-full flex flex-col bg-slate-50 text-slate-900 transition-colors duration-200`}>
        <ThemeProvider>
          <SettingsProvider>
            <FaviconUpdater />
            <OfflineManager />
            <AuthProvider>
              <ModalProvider>
                {children}
              </ModalProvider>
            </AuthProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
