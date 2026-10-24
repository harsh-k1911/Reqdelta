import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    react(),
    {
      name: 'reqdelta-content-security-policy',
      transformIndexHtml() {
        // React's development refresh needs inline scripts; built app scripts do not.
        const scripts = command === 'serve' ? "'self' 'unsafe-inline'" : "'self'";
        const connections = command === 'serve' ? "'self' ws://127.0.0.1:5173" : "'none'";
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: `default-src 'self'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; connect-src ${connections}; object-src 'none'; base-uri 'none'; form-action 'none'`,
          },
          injectTo: 'head-prepend',
        }];
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.mjs'] },
}));
