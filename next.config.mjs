/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The old site had a blog, newsletter, and admin studio. Send any old links
  // to the homepage instead of a 404.
  async redirects() {
    return ['/blog', '/blog/:path*', '/newsletter/:path*', '/admin/:path*', '/index.html'].map((source) => ({
      source,
      destination: '/',
      permanent: false,
    }));
  },
};

export default nextConfig;
