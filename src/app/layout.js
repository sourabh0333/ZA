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

const INTRO_SEEN_SCRIPT =
  'try{if(sessionStorage.getItem("za-intro-seen")==="1")document.documentElement.setAttribute("data-intro-seen","")}catch(e){}';

export const viewport = {
  themeColor: "#0b0a09",
};

export default function RootLayout({ children }) {
  return (
    // (the script marks <html> before the page paints, so a later page of the
    // visit never flashes the full opening screen; see gallery/Intro.jsx)
    <html lang="en" className={`${jost.variable} ${cinzel.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SEEN_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
