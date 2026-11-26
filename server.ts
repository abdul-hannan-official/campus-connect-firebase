import 'dotenv/config';
import { createApp } from './src/server/app.ts';

const PORT = Number(process.env.PORT || 3000); // Render injects PORT; default 3000 locally

async function startServer() {
  const app = await createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Campus Connect server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Campus Connect server:', err);
  process.exit(1);
});
