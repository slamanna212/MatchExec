// Keep the Docker probe independent of curl and bound its network lifetime.
const http = require('node:http');
const request = http.get({ hostname: '127.0.0.1', port: process.env.PORT || 3000, path: '/api/health' }, (response) => {
  response.resume();
  process.exit(response.statusCode >= 200 && response.statusCode < 400 ? 0 : 1);
});
request.on('error', () => process.exit(1));
setTimeout(() => { request.destroy(); process.exit(1); }, 9000).unref();
