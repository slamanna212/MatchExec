// Default (server-side) logger entry
// Server-side processes (Discord bot, scheduler) should import directly from './server'
// to avoid bundling both versions

export * from './server';
