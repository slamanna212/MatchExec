import { Hono } from 'hono';
import { apiNotFound, noStore, onError } from './http';
import { authGate } from './middleware/auth';
import { welcomeFlow } from './middleware/welcome';
import { health } from './routes/health';

export const app = new Hono();

app.onError(onError);
app.notFound(apiNotFound);

app.use('/api/*', noStore);
app.use('*', authGate);
app.use('*', welcomeFlow);

// Domain routers are mounted here as Stage 2 ports them.
app.route('/api/health', health);

// TODO(Stage 3): serveStatic({ root: 'dist/client' }) for hashed assets, /uploads/* from blobs, /dev/* redirect in
// production, and the SPA fallback to index.html (no-cache) for unmatched non-API GETs.

export type AppType = typeof app;
