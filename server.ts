import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyFirebaseToken,
  type AuthenticatedRequest,
} from './src/server/middleware/verifyFirebaseToken.ts';
import departmentRouter from './src/server/routes/department.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000); // Render injects PORT; default 3000 locally
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
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
  } else {
    const distDir = path.resolve(__dirname, 'dist');
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Campus Connect server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Campus Connect server:', err);
  process.exit(1);
});
