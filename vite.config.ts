import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Includes a built-in proxy for Google Drive public file streaming so Web Audio API
// pitch-shifting can decode audio buffers without browser CORS blocks.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/drive-stream': {
        target: 'https://drive.google.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/drive-stream/, ''),
      },
      '/googleapis-drive': {
        target: 'https://www.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/googleapis-drive/, ''),
      }
    }
  }
});
