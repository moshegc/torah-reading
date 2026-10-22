import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import driveMediaHandler from './api/drive-media.js';
import driveSyncHandler from './api/drive-sync.js';
import driveDataHandler from './api/drive-data.js';
import r2AuthHandler from './api/r2-auth.js';
import r2DataHandler from './api/r2-data.js';
import r2MediaHandler from './api/r2-media.js';
import r2TransferDriveHandler from './api/r2-transfer-drive.js';

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }

  return {
    plugins: [
      react(),
      {
        name: 'local-vercel-api-middleware',
        configureServer(server) {
          server.middlewares.use('/api/drive-media', adaptVercelHandler(driveMediaHandler));
          server.middlewares.use('/api/drive-sync', adaptVercelHandler(driveSyncHandler));
          server.middlewares.use('/api/drive-data', adaptVercelHandler(driveDataHandler));
          server.middlewares.use('/api/r2-auth', adaptVercelHandler(r2AuthHandler));
          server.middlewares.use('/api/r2-data', adaptVercelHandler(r2DataHandler));
          server.middlewares.use('/api/r2-media', adaptVercelHandler(r2MediaHandler));
          server.middlewares.use(
            '/api/r2-transfer-drive',
            adaptVercelHandler(r2TransferDriveHandler)
          );
        },
      },
    ],
    server: {
      port: 5173,
    },
  };
});
