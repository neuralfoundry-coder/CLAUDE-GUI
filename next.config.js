/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: [
      'node-pty',
      '@parcel/watcher',
      '@anthropic-ai/claude-agent-sdk',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'node-pty': 'commonjs node-pty',
        '@parcel/watcher': 'commonjs @parcel/watcher',
      });
    }
    return config;
  },
};

module.exports = nextConfig;
