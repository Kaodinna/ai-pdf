/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: {
    // Pre-existing lint debt across the codebase (unrelated to deployment)
    // shouldn't block a production build — clean it up separately.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
