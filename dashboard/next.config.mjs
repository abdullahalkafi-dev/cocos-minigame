/** @type {import('next').NextConfig} */
const API = process.env.API_ORIGIN || 'http://localhost:3000';

export default {
  // The dashboard is a static build served by the API server (one container, no second Node process).
  output: 'export',
  distDir: 'out',
  images: { unoptimized: true },
  // `next dev` has no API of its own: forward these to the running server.
  ...(process.env.NODE_ENV === 'development' ? {
    async rewrites() {
      return ['api', 'g', 'uploads', 'sdk', 'docs', 'defaults'].map(p => ({ source: `/${p}/:path*`, destination: `${API}/${p}/:path*` }));
    },
  } : {}),
};
