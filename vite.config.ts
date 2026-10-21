import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import driveMediaHandler from './api/drive-media.js';
import driveSyncHandler from './api/drive-sync.js';
import driveDataHandler from './api/drive-data.js';

function adaptVercelHandler(handler: any) {
  return async (req: any, res: any) => {
    const urlObj = new URL(req.url || '/', 'http://localhost');
    req.query = Object.fromEntries(urlObj.searchParams.entries());
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj: any) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(obj));
      return res;
    };
    res.send = (body: any) => {
      res.end(body);
      return res;
    };
    await handler(req, res);
  };
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-vercel-api-middleware',
      configureServer(server) {
        server.middlewares.use('/api/drive-media', adaptVercelHandler(driveMediaHandler));
        server.middlewares.use('/api/drive-sync', adaptVercelHandler(driveSyncHandler));
        server.middlewares.use('/api/drive-data', adaptVercelHandler(driveDataHandler));
      },
    },
  ],
  server: {
    port: 5173,
  },
});
