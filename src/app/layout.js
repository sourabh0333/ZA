import { Jost } from "next/font/google";
import "./globals.css";

const jost = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "ZA Gallery — Walk through the galleries",
  description:
    "Step inside ZA Gallery: a material library, a textile wall, a vault of treasures and an exhibition hall, all in one continuous walk.",
};

export const viewport = {
  themeColor: "#0b0a09",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={jost.variable}>
      <body>{children}</body>
    </html>
  );
}
