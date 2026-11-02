import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Native Node.js / tsx ESM .ts import for local server runtime
import { registerApiRoutes } from './api/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

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
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Love Flix server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
