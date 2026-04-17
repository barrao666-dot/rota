const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { assertCanAccessEmpresa } = require('../middleware/authz');
const { logAudit, parseIdOr400, isNonEmptyString } = require('../utils/route-helpers');

router.get('/:empresa_id', requireAuth, async (req, res) => {
    try {
        if (!assertCanAccessEmpresa(req, res, req.params.empresa_id)) return;
        const [linhas] = await db.query('SELECT * FROM veiculos WHERE empresa_id = ? ORDER BY modelo ASC', [req.params.empresa_id]);
        res.json(linhas);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao buscar veículos.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { empresa_id, modelo, placa, capacidade_peso } = req.body;
        if (!assertCanAccessEmpresa(req, res, empresa_id)) return;
        if (!Number.isFinite(Number(empresa_id))) return res.status(400).json({ erro: 'Empresa inválida.' });
        if (!isNonEmptyString(modelo)) return res.status(400).json({ erro: 'Modelo obrigatório.' });
        if (!isNonEmptyString(placa)) return res.status(400).json({ erro: 'Placa obrigatória.' });
        if (!Number.isFinite(Number(capacidade_peso)) || Number(capacidade_peso) <= 0) return res.status(400).json({ erro: 'Capacidade inválida.' });

        const [emp] = await db.query('SELECT limite_veiculos FROM empresas WHERE id = ?', [empresa_id]);
        if (emp.length === 0) return res.status(404).json({ erro: 'Empresa não encontrada.' });
        const limite = emp[0].limite_veiculos;

        const [contagem] = await db.query('SELECT COUNT(*) as total FROM veiculos WHERE empresa_id = ?', [empresa_id]);
        const totalAtual = contagem[0].total;

        if (totalAtual >= limite) {
            return res.status(403).json({ erro: `Limite atingido! Seu plano permite no máximo ${limite} veículos.` });
        }

        await db.query(
            'INSERT INTO veiculos (empresa_id, modelo, placa, capacidade_peso) VALUES (?, ?, ?, ?)',
            [empresa_id, modelo, placa, capacidade_peso]
        );
        logAudit(req, 'veiculos', 'create', { empresa_id: Number(empresa_id), modelo, placa });
        res.status(201).json({ mensagem: 'Veículo cadastrado com sucesso!' });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro interno ao cadastrar veículo.' });
    }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM veiculos WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Veículo não encontrado.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        const { modelo, placa, capacidade_peso } = req.body;
        if (!isNonEmptyString(modelo)) return res.status(400).json({ erro: 'Modelo obrigatório.' });
        if (!isNonEmptyString(placa)) return res.status(400).json({ erro: 'Placa obrigatória.' });
        if (!Number.isFinite(Number(capacidade_peso)) || Number(capacidade_peso) <= 0) return res.status(400).json({ erro: 'Capacidade inválida.' });
        await db.query('UPDATE veiculos SET modelo=?, placa=?, capacidade_peso=? WHERE id=?', [modelo, placa, capacidade_peso, id]);
        logAudit(req, 'veiculos', 'update', { id, modelo, placa });
        res.json({ mensagem: 'Veículo atualizado!' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao atualizar veículo.' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM veiculos WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Veículo não encontrado.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        await db.query('DELETE FROM veiculos WHERE id = ?', [id]);
        logAudit(req, 'veiculos', 'delete', { id });
        res.json({ mensagem: 'Veículo excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao excluir veículo.' });
    }
});

module.exports = router;
