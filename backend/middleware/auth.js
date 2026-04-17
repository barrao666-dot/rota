const jwt = require('jsonwebtoken');

function getSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET é obrigatório em produção.');
        }
        return 'dev-jwt-secret-altere-em-producao';
    }
    return s;
}

function assertJwtConfigured() {
    getSecret();
}

function signToken(payload) {
    return jwt.sign(payload, getSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

function requireAuth(req, res, next) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) {
        return res.status(401).json({ erro: 'Não autenticado.' });
    }
    try {
        req.auth = jwt.verify(h.slice(7), getSecret());
        next();
    } catch {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }
}

function requireMaster(req, res, next) {
    if (!req.auth || req.auth.role !== 'master') {
        return res.status(403).json({ erro: 'Acesso restrito ao painel master.' });
    }
    next();
}

module.exports = { getSecret, signToken, requireAuth, requireMaster, assertJwtConfigured };
