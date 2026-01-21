import './lib/env'; // Validates environment on startup
import app from './app';
import { closeDatabase } from './db';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, closing gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, closing gracefully...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });
  await closeDatabase();
  process.exit(0);
});
