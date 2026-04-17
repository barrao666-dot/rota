function canAccessEmpresa(req, empresaId) {
    const eid = Number(empresaId);
    if (req.auth.role === 'master') return true;
    if ((req.auth.role === 'empresa' || req.auth.role === 'operador') && Number(req.auth.empresaId) === eid) {
        return true;
    }
    return false;
}

function assertCanAccessEmpresa(req, res, empresaId) {
    if (!canAccessEmpresa(req, empresaId)) {
        res.status(403).json({ erro: 'Acesso negado.' });
        return false;
    }
    return true;
}

module.exports = { canAccessEmpresa, assertCanAccessEmpresa };
