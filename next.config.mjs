import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The gallery's files go out as they are. Its images are already compressed,
  // and gzipping the 3D models on every request (Next's default) saved 15% of
  // their size but cost the server half a second per visit for the 4.7 MB
  // model, and many seconds when its machine was busy, holding the opening.
  async headers() {
    return [
      {
        source: "/gallery/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, no-transform" }],
      },
    ];
  },
};

export default nextConfig;
