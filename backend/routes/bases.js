const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { assertCanAccessEmpresa } = require('../middleware/authz');
const { logAudit, parseIdOr400, isNonEmptyString } = require('../utils/route-helpers');

router.get('/:empresa_id', requireAuth, async (req, res) => {
    try {
        if (!assertCanAccessEmpresa(req, res, req.params.empresa_id)) return;
        const [linhas] = await db.query('SELECT * FROM bases WHERE empresa_id = ?', [req.params.empresa_id]);
        res.json(linhas);
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao buscar bases.' }); }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const d = req.body;
        if (!assertCanAccessEmpresa(req, res, d.empresa_id)) return;
        if (!Number.isFinite(Number(d.empresa_id))) return res.status(400).json({ erro: 'Empresa inválida.' });
        if (!isNonEmptyString(d.nome)) return res.status(400).json({ erro: 'Nome obrigatório.' });
        if (!isNonEmptyString(d.endereco)) return res.status(400).json({ erro: 'Endereço obrigatório.' });

        await db.query(
            `INSERT INTO bases (empresa_id, nome, endereco, lat, lng, corte_manha, corte_tarde) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [d.empresa_id, d.nome, d.endereco, d.lat, d.lng, d.corte_manha || '09:00', d.corte_tarde || '14:00']
        );
        logAudit(req, 'bases', 'create', { empresa_id: Number(d.empresa_id), nome: d.nome });
        res.status(201).json({ mensagem: 'Criado' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao salvar base.' }); }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM bases WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Base não encontrada.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        const d = req.body;
        if (!isNonEmptyString(d.nome)) return res.status(400).json({ erro: 'Nome obrigatório.' });
        if (!isNonEmptyString(d.endereco)) return res.status(400).json({ erro: 'Endereço obrigatório.' });
        await db.query(
            `UPDATE bases SET nome=?, endereco=?, lat=?, lng=?, corte_manha=?, corte_tarde=? WHERE id=?`,
            [d.nome, d.endereco, d.lat, d.lng, d.corte_manha || '09:00', d.corte_tarde || '14:00', id]
        );
        logAudit(req, 'bases', 'update', { id, nome: d.nome });
        res.json({ mensagem: 'Atualizado' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao atualizar base.' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM bases WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Base não encontrada.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        await db.query('DELETE FROM bases WHERE id = ?', [id]);
        logAudit(req, 'bases', 'delete', { id });
        res.json({ mensagem: 'Excluído.' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao excluir base.' }); }
});

module.exports = router;
