const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { requireAuth } = require('../middleware/auth');
const { assertCanAccessEmpresa } = require('../middleware/authz');
const { logAudit, parseIdOr400, isNonEmptyString } = require('../utils/route-helpers');

router.get('/:empresa_id', requireAuth, async (req, res) => {
    try {
        if (!assertCanAccessEmpresa(req, res, req.params.empresa_id)) return;
        const [linhas] = await db.query('SELECT * FROM motoristas WHERE empresa_id = ? ORDER BY id DESC', [req.params.empresa_id]);
        linhas.forEach((m) => { delete m.senha; });
        res.json(linhas);
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao buscar motoristas.' }); }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { empresa_id, nome, login, senha, email } = req.body;
        if (!assertCanAccessEmpresa(req, res, empresa_id)) return;
        if (!Number.isFinite(Number(empresa_id))) return res.status(400).json({ erro: 'Empresa inválida.' });
        if (!isNonEmptyString(nome) || !isNonEmptyString(login) || !isNonEmptyString(senha) || !isNonEmptyString(email)) {
            return res.status(400).json({ erro: 'Campos obrigatórios ausentes.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaCriptografada = await bcrypt.hash(senha, salt);

        await db.query(
            'INSERT INTO motoristas (empresa_id, nome, login, senha, email) VALUES (?, ?, ?, ?, ?)',
            [empresa_id, nome, login, senhaCriptografada, email]
        );
        logAudit(req, 'motoristas', 'create', { empresa_id: Number(empresa_id), login });
        res.status(201).json({ mensagem: 'Motorista registrado!' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao cadastrar motorista.' }); }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM motoristas WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Motorista não encontrado.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        const { nome, login, senha, email } = req.body;

        let senhaFinal = senha;
        if (senhaFinal && !senhaFinal.startsWith('$2b$')) {
            const salt = await bcrypt.genSalt(10);
            senhaFinal = await bcrypt.hash(senhaFinal, salt);
        }

        await db.query(
            'UPDATE motoristas SET nome=?, login=?, senha=?, email=? WHERE id=?',
            [nome, login, senhaFinal, email, id]
        );
        logAudit(req, 'motoristas', 'update', { id, login });
        res.json({ mensagem: 'Motorista atualizado!' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao atualizar motorista.' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM motoristas WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Motorista não encontrado.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        await db.query('DELETE FROM motoristas WHERE id = ?', [id]);
        logAudit(req, 'motoristas', 'delete', { id });
        res.json({ mensagem: 'Excluído.' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao excluir motorista.' }); }
});

module.exports = router;
