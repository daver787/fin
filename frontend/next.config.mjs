/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export (SPEC §3): FastAPI serves the built files from a static/ dir.
  // No Node runtime in production — everything is HTML/JS/CSS shipped same-origin.
  output: "export",
  // Static hosts serve /path as /path/index.html; trailing slashes keep routing
  // predictable when FastAPI maps URLs to files.
  trailingSlash: true,
  images: {
    // next/image optimization needs a server; disable it for static export.
    unoptimized: true,
  },
};

export default nextConfig;
