/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit and pg are server-only native-ish deps; keep them external on the server.
  experimental: {
    serverComponentsExternalPackages: ['pdfkit', 'pg', 'bcryptjs'],
  },
};

module.exports = nextConfig;
