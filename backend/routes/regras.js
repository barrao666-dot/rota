const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { assertCanAccessEmpresa } = require('../middleware/authz');
const { logAudit, parseIdOr400, isNonEmptyString } = require('../utils/route-helpers');

router.get('/:empresa_id', requireAuth, async (req, res) => {
    try {
        if (!assertCanAccessEmpresa(req, res, req.params.empresa_id)) return;
        const [linhas] = await db.query('SELECT * FROM regras WHERE empresa_id = ?', [req.params.empresa_id]);
        res.json(linhas);
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao buscar regras.' }); }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const d = req.body;
        if (!assertCanAccessEmpresa(req, res, d.empresa_id)) return;
        if (!Number.isFinite(Number(d.empresa_id))) return res.status(400).json({ erro: 'Empresa inválida.' });
        if (!isNonEmptyString(d.nome_categoria)) return res.status(400).json({ erro: 'Categoria obrigatória.' });
        if (!Number.isFinite(Number(d.tempo_sla)) || Number(d.tempo_sla) < 0) return res.status(400).json({ erro: 'SLA inválido.' });

        await db.query(
            `INSERT INTO regras (empresa_id, nome_categoria, tempo_sla, prioridade, peso, altura, largura, comprimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.empresa_id, d.nome_categoria, d.tempo_sla, d.prioridade, d.peso || 0, d.altura || 0, d.largura || 0, d.comprimento || 0]
        );
        logAudit(req, 'regras', 'create', { empresa_id: Number(d.empresa_id), nome_categoria: d.nome_categoria });
        res.status(201).json({ mensagem: 'Criado' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao salvar regra.' }); }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM regras WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Regra não encontrada.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        const d = req.body;
        if (!isNonEmptyString(d.nome_categoria)) return res.status(400).json({ erro: 'Categoria obrigatória.' });
        if (!Number.isFinite(Number(d.tempo_sla)) || Number(d.tempo_sla) < 0) return res.status(400).json({ erro: 'SLA inválido.' });
        await db.query(
            `UPDATE regras SET nome_categoria=?, tempo_sla=?, prioridade=?, peso=?, altura=?, largura=?, comprimento=? WHERE id=?`,
            [d.nome_categoria, d.tempo_sla, d.prioridade, d.peso || 0, d.altura || 0, d.largura || 0, d.comprimento || 0, id]
        );
        logAudit(req, 'regras', 'update', { id, nome_categoria: d.nome_categoria });
        res.json({ mensagem: 'Atualizado' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao atualizar regra.' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM regras WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Regra não encontrada.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        await db.query('DELETE FROM regras WHERE id = ?', [id]);
        logAudit(req, 'regras', 'delete', { id });
        res.json({ mensagem: 'Excluído.' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao excluir regra.' }); }
});

module.exports = router;
