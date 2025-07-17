/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/react-integration-tests',
  server: {
    proxy: {
      '^/lightspeed/.*': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => {
          const rewritten = path.replace(/^\/lightspeed/, '');
          console.log('Proxying:', path, '->', rewritten);
          return rewritten;
        },
      },
    },
    port: 4200,
    host: '127.0.0.1',
  },
  preview: {
    port: 4200,
    host: '127.0.0.1',
  },
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/react-integration-tests',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  define: {
    'import.meta.vitest': undefined,
  },
}));
