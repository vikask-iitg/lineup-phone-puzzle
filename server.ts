// Vercel detects this root entry point as the Node.js server. The HTTP server
// is exported for Vercel to manage; local runs start their own listener.
import server from './server.js';

export default server;
