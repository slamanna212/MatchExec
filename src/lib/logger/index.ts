// Export for Next.js components only
// Server-side processes (Discord bot, scheduler) should import directly from './server'
// to avoid bundling both versions

// For Next.js, we conditionally export based on environment
const isServer = typeof window === 'undefined';

if (isServer) {
  // Next.js server components get the server logger
  const serverExports = require('./server');
  module.exports = serverExports;
} else {
  // Next.js client components get the client logger
  const clientExports = require('./client');
  module.exports = clientExports;
}
