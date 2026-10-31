import { Hono } from 'hono';
import { apiNotFound, noStore, onError } from './http';
import { authGate } from './middleware/auth';
import { welcomeFlow } from './middleware/welcome';
import { auth } from './routes/auth';
import { channels } from './routes/channels';
import { games } from './routes/games';
import { health } from './routes/health';
import { settings } from './routes/settings';
import { dbStatus, metrics, version } from './routes/system';
import { welcomeFlow as welcomeFlowRoutes } from './routes/welcome-flow';

export const app = new Hono();

app.onError(onError);
app.notFound(apiNotFound);

app.use('/api/*', noStore);
app.use('*', authGate);
app.use('*', welcomeFlow);

// Domain routers are mounted here as Stage 2 ports them.
app.route('/api/health', health);
app.route('/api/db-status', dbStatus);
app.route('/api/metrics', metrics);
app.route('/api/version', version);
app.route('/api/settings', settings);
app.route('/api/welcome-flow', welcomeFlowRoutes);
app.route('/api/auth', auth);
app.route('/api/games', games);
app.route('/api/channels', channels);

// TODO(Stage 3): serveStatic({ root: 'dist/client' }) for hashed assets, /uploads/* from blobs, /dev/* redirect in
// production, and the SPA fallback to index.html (no-cache) for unmatched non-API GETs.

export type AppType = typeof app;
