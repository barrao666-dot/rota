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
        const [linhas] = await db.query('SELECT * FROM usuarios WHERE empresa_id = ? ORDER BY id DESC', [req.params.empresa_id]);
        linhas.forEach((u) => { delete u.senha; });
        res.json(linhas);
    } catch (erro) {
        console.error('ERRO SQL - USUÁRIOS:', erro);
        res.status(500).json({ erro: 'Erro ao buscar usuários.' });
    }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const { empresa_id, nome, login, senha, email, perfil, status } = req.body;
        if (!assertCanAccessEmpresa(req, res, empresa_id)) return;
        if (!Number.isFinite(Number(empresa_id))) return res.status(400).json({ erro: 'Empresa inválida.' });
        if (!isNonEmptyString(nome) || !isNonEmptyString(login) || !isNonEmptyString(senha) || !isNonEmptyString(email)) {
            return res.status(400).json({ erro: 'Campos obrigatórios ausentes.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaCriptografada = await bcrypt.hash(senha, salt);

        await db.query(
            'INSERT INTO usuarios (empresa_id, nome, login, senha, email, perfil, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [empresa_id, nome, login, senhaCriptografada, email, perfil, status || 'ativo']
        );
        logAudit(req, 'usuarios', 'create', { empresa_id: Number(empresa_id), login, perfil: perfil || 'operador' });
        res.status(201).json({ mensagem: 'Usuário registrado!' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao cadastrar usuário.' }); }
});

router.put('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM usuarios WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        const { nome, login, senha, email, perfil, status } = req.body;

        let senhaFinal = senha;
        if (senhaFinal && !senhaFinal.startsWith('$2b$')) {
            const salt = await bcrypt.genSalt(10);
            senhaFinal = await bcrypt.hash(senhaFinal, salt);
        }

        await db.query(
            'UPDATE usuarios SET nome=?, login=?, senha=?, email=?, perfil=?, status=? WHERE id=?',
            [nome, login, senhaFinal, email, perfil, status, id]
        );
        logAudit(req, 'usuarios', 'update', { id, login, perfil, status });
        res.json({ mensagem: 'Usuário atualizado!' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao atualizar usuário.' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const [existe] = await db.query('SELECT empresa_id FROM usuarios WHERE id = ?', [id]);
        if (existe.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        if (!assertCanAccessEmpresa(req, res, existe[0].empresa_id)) return;

        await db.query('DELETE FROM usuarios WHERE id = ?', [id]);
        logAudit(req, 'usuarios', 'delete', { id });
        res.json({ mensagem: 'Excluído.' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao excluir usuário.' }); }
});

module.exports = router;
