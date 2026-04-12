const path = require('path');

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
    // pdfjs-dist v5's pdf.mjs contains its own webpack runtime
    // (__webpack_require__ / __webpack_exports__) that collides with Next.js's
    // webpack variable names, causing "Object.defineProperty called on
    // non-object" at runtime. The .min.mjs build is a clean ESM bundle without
    // the internal webpack runtime. Use exact-match alias (trailing $) so
    // subpath imports like 'pdfjs-dist/build/pdf.worker.min.mjs' still work.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pdfjs-dist$': path.resolve(
          __dirname,
          'node_modules/pdfjs-dist/build/pdf.min.mjs',
        ),
      };
    }
    return config;
  },
};

module.exports = nextConfig;
