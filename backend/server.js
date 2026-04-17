const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { assertJwtConfigured } = require('./middleware/auth');
const { aplicarMigracoes } = require('./scripts/migrate-schema');

assertJwtConfigured();
// Migrações idempotentes; falhas são logadas mas não bloqueiam o boot.
aplicarMigracoes().catch((e) => console.warn('[Rota++] migração falhou:', e.message));

const app = express();
// Atrás de reverse proxy (TurboCloud/NGINX). Permite que `req.protocol` e
// `req.ip` sejam os reais do cliente, além de fazer os cookies "secure"
// funcionarem sob HTTPS terminado no proxy.
app.set('trust proxy', 1);

// Em produção, FRONTEND_ORIGIN deve listar explicitamente o domínio público
// (ex: https://rotaplus.meusite.com). Em dev, caímos pra localhost/vite.
const defaultOrigins = 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173';
const allowedOrigins = (process.env.FRONTEND_ORIGIN || defaultOrigins)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
app.use(
    cors({
        origin(origin, cb) {
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(null, false);
        }
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const frontendPath = path.resolve(__dirname, '..', 'frontend');

const loginRotas = require('./routes/login');
const empresasRotas = require('./routes/empresas');
const motoristasRotas = require('./routes/motoristas');
const veiculosRotas = require('./routes/veiculos');
const basesRotas = require('./routes/bases');
const coletasRotas = require('./routes/coletas');
const regrasRotas = require('./routes/regras');
const usuariosRotas = require('./routes/usuarios');
const orsRotas = require('./routes/ors');

// API primeiro: nunca compete com arquivos estáticos do /frontend
app.use('/api/login', loginRotas);
app.use('/api/empresas', empresasRotas);
app.use('/api/motoristas', motoristasRotas);
app.use('/api/veiculos', veiculosRotas);
app.use('/api/bases', basesRotas);
app.use('/api/coletas', coletasRotas);
app.use('/api/regras', regrasRotas);
app.use('/api/usuarios', usuariosRotas);
app.use('/api/ors', orsRotas);

// Assets do painel operacional que NÃO devem ser cacheados pelo navegador:
// o painel de rotas é atualizado com frequência e precisa puxar a versão
// corrente ao recarregar a tela (evita cards/regras presos em JS antigo).
const ASSETS_SEM_CACHE = new Set([
    '/operacao/rotas.html',
    '/js/rotas.js',
    '/service-worker.js',
    // Manifest sem cache: permite que mudanças na identidade PWA
    // (ícones, shortcuts, theme_color) apareçam no próximo load
    // sem obrigar o usuário a reinstalar o app.
    '/manifest.json',
    '/motorista.manifest.json',
    '/js/pwa-bootstrap.js',
    '/js/motorista.js',
    '/operacao/motorista.html',
    '/operacao/login.html'
]);
app.use(express.static(frontendPath, {
    // Desliga o Cache-Control default do send() para que o setHeaders abaixo
    // possa definir no-store sem ser sobrescrito pela maxAge padrão.
    cacheControl: false,
    setHeaders: (res, filePath) => {
        const rel = '/' + path.relative(frontendPath, filePath).split(path.sep).join('/');
        if (ASSETS_SEM_CACHE.has(rel)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=0');
        }
    }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Compatibilidade de rotas antigas (evita cair no fallback errado).
app.get('/master', (req, res) => {
    res.redirect(302, '/master/index.html');
});
app.get('/master/dashboard', (req, res) => {
    res.redirect(302, '/master/dashboard.html');
});

const distUiPath = path.resolve(__dirname, '..', 'dist-ui');
if (fs.existsSync(path.join(distUiPath, 'index.html'))) {
    app.use('/painel', express.static(distUiPath));
    app.use('/painel', (req, res) => {
        res.sendFile(path.join(distUiPath, 'index.html'));
    });
} else {
    console.warn('[Rota++] Pasta dist-ui não encontrada — rode npm run build:ui para habilitar /painel (React). Redirecionando /painel para o dashboard Master legado.');
    app.get(/^\/painel\/?.*$/, (req, res) => {
        res.redirect(302, '/master/dashboard.html');
    });
}

app.use((req, res) => {
    if (req.url.includes('.') && !req.url.endsWith('.html')) {
        return res.status(404).send('Arquivo não encontrado');
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Host/porta vêm do ambiente. TurboCloud injeta `PORT` no container e espera
// que a app escute em todas as interfaces (0.0.0.0). Em dev, deixamos como
// 3000 e localhost pra manter o fluxo atual.
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
app.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor Rota++ rodando em ${publicUrl} (bind ${HOST}:${PORT})`);
});
