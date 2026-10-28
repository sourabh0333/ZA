import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
