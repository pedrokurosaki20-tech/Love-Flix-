import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerApiRoutes } from './server/registerApiRoutes.js';
import { filterTmdbMovieLists } from './server/movieVisibilityMiddleware.js';
import { attachExternalBridgeWebSocketServer } from './server/externalBridgeSocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  const httpServer = http.createServer(app);
  attachExternalBridgeWebSocketServer(httpServer);

  app.use(filterTmdbMovieLists);
  registerApiRoutes(app);

  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (!isProduction || !fs.existsSync(distPath)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Love Flix server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
