import { Cinzel, Jost } from "next/font/google";
import "./globals.css";

const jost = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
});

// the gallery's name, in Roman capitals like its logo's
const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata = {
  title: "Zigguratss — Walk through the galleries",
  description:
    "Step inside Zigguratss: a reception, a textile wall, a vault of treasures, an exhibition hall and a rooftop hall, all in one continuous walk.",
};

export const viewport = {
  themeColor: "#0b0a09",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${jost.variable} ${cinzel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
