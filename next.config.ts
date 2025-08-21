import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(process.env.NODE_ENV === 'production' && {
    async redirects() {
      return [
        {
          source: '/dev/:path*',
          destination: '/',
          permanent: false,
        },
      ];
    },
  }),
};

export default nextConfig;
