import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/painel/',
    plugins: [
        react({
            include: '**/*.{jsx,tsx,js}',
        }),
    ],
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist-ui',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': { target: 'http://localhost:3000', changeOrigin: true },
        },
    },
});
