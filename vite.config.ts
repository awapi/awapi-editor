import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import electronSimple from 'vite-plugin-electron/simple';
import { startup } from 'vite-plugin-electron';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  plugins: [
    react(),
    electronSimple({
      main: {
        entry: resolve(__dirname, 'src/main/main.ts'),
        // The beta plugin spawns Electron with cwd=server.config.root (src/renderer),
        // which is wrong. Override onstart to use the project root instead.
        onstart() {
          startup(['.', '--no-sandbox'], { cwd: __dirname });
        },
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      preload: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      renderer: {}
    })
  ],
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
});
