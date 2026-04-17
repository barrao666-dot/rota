function getAuditActor(req) {
    return req.auth?.login || req.auth?.sub || `auth:${req.auth?.id || 'desconhecido'}`;
}

function getAuditEmpresa(req) {
    return req.auth?.empresaId || 'all';
}

function logAudit(req, modulo, tipo, payload = {}) {
    const usuario = getAuditActor(req);
    const empresa = getAuditEmpresa(req);
    console.info(`[AUDIT][${modulo}:${tipo}] usuario=${usuario} empresa=${empresa} payload=${JSON.stringify(payload)}`);
}

function parseIdOr400(req, res, value = req.params.id) {
    const id = Number(value);
    if (!Number.isFinite(id)) {
        res.status(400).json({ erro: 'ID inválido.' });
        return null;
    }
    return id;
}

function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

module.exports = {
    logAudit,
    parseIdOr400,
    isNonEmptyString
};
