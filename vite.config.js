import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.join(__dirname, 'ui');

export default defineConfig({
    root: uiRoot,
    base: '/painel/',
    plugins: [
        react({
            include: '**/*.{jsx,tsx,js}',
        }),
    ],
    publicDir: path.join(uiRoot, 'public'),
    build: {
        outDir: path.join(__dirname, 'dist-ui'),
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:3000', changeOrigin: true },
        },
    },
});
