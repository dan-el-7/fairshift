import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'PORT');
  const port = process.env.PORT ?? env.PORT ?? '8080';
  return {
    root: 'src/web',
    plugins: [preact()],
    build: { outDir: '../../dist/web', emptyOutDir: true, target: 'es2020' },
    server: { proxy: { '/api/': `http://localhost:${port}` } },
  };
});
