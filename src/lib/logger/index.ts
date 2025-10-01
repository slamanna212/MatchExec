// Export for Next.js components only
// Server-side processes (Discord bot, scheduler) should import directly from './server'
// to avoid bundling both versions

// For Next.js, we conditionally export based on environment
export * from './server';
