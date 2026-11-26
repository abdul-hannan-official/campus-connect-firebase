import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyFirebaseToken,
  type AuthenticatedRequest,
} from './middleware/verifyFirebaseToken.ts';
import departmentRouter from './routes/department.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PROD = process.env.NODE_ENV === 'production';
// On Vercel the CDN serves dist/ statically, so the function only handles /api/*.
const IS_VERCEL = process.env.VERCEL === '1';

/** Builds the Express app shared by the standalone server (server.ts) and the Vercel function (api/index.ts). */
export async function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Baseline security headers compatible with iframe preview environments
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'campus-connect-api',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/auth/session', verifyFirebaseToken, (req: AuthenticatedRequest, res) => {
    res.json({
      verified: true,
      user: req.authUser,
    });
  });

  app.use('/api/department', departmentRouter);

  // Unknown API route fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!IS_VERCEL) {
    const distDir = path.resolve(__dirname, '../../dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(503).send('Application build not found.');
      }
    });
  }

  return app;
}
