import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {},
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
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
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude server-only modules from client bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        path: false,
        os: false,
        stream: false,
        constants: false,
        assert: false,
        util: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;
