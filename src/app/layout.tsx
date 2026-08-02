import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ModalProvider } from "@/context/ModalContext";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "GeoSurvey Pro",
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
    >
      <body className={`${plusJakartaSans.className} min-h-full flex flex-col bg-slate-50 text-slate-900`}>
        <AuthProvider>
          <ModalProvider>
            {children}
          </ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
