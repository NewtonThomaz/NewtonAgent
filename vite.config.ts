import { defineConfig, build, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const r = (...p: string[]) => resolve(root, ...p);

/** Recursively lists files so the content-script sources are watched in `--watch` mode. */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = resolve(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Content scripts can NOT be ES modules (no `import` allowed when declared in the manifest).
 * After the main bundle (side panel + module service worker) is written, this plugin runs a
 * second, isolated Vite build that emits a single self-contained IIFE: `dist/content.js`.
 */
function contentScriptPlugin(mode: string): Plugin {
  return {
    name: 'newtonagent:content-script-iife',
    apply: 'build',
    buildStart() {
      for (const file of [...listFiles(r('src/content')), ...listFiles(r('src/shared'))]) {
        this.addWatchFile(file);
      }
    },
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: 'warn',
        mode,
        publicDir: false,
        define: { 'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production') },
        build: {
          outDir: r('dist'),
          emptyOutDir: false,
          sourcemap: mode === 'development' ? 'inline' : false,
          minify: mode !== 'development',
          target: 'chrome116',
          lib: {
            entry: r('src/content/index.ts'),
            name: 'NewtonAgentContent',
            formats: ['iife'],
            fileName: () => 'content.js',
          },
          rollupOptions: { output: { extend: true } },
        },
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), contentScriptPlugin(mode)],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
    // The service worker must never receive the DOM-based modulepreload polyfill.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: r('sidepanel.html'),
        background: r('src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
