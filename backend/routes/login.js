const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const { signToken, requireAuth, requireMaster } = require('../middleware/auth');

router.post('/empresa', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const masterUser = process.env.MASTER_USER;
        const masterPass = process.env.MASTER_PASS;

        if (masterUser && masterPass && usuario === masterUser && senha === masterPass) {
            const token = signToken({ role: 'master' });
            return res.json({ master: true, mensagem: 'Bem-vindo ao Master SaaS', token });
        }

        const [linhas] = await db.query('SELECT * FROM empresas WHERE documento = ? OR acesso_usuario = ?', [usuario, usuario]);
        if (linhas.length === 0) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

        const empresa = linhas[0];
        if (empresa.status !== 'ativo') return res.status(403).json({ erro: 'Esta conta está bloqueada.' });

        const senhaValida = await bcrypt.compare(senha, empresa.acesso_senha);
        if (!senhaValida) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

        delete empresa.acesso_senha;
        const token = signToken({ role: 'empresa', empresaId: empresa.id });
        res.json({ empresa, token });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno no servidor.' }); }
});

// Login gerencial/operacional — APENAS perfis que não sejam "motorista".
// Operador e admin acessam o painel de rotas/gestão. Motorista NÃO pode
// entrar por aqui; ele tem tela própria em /operacao/login.html.
router.post('/operador', async (req, res) => {
    try {
        const { login, senha } = req.body;
        const [linhas] = await db.query(`SELECT u.*, e.nome as empresa_nome, e.cor1, e.caminho_logo, e.api_mapas, e.status as empresa_status FROM usuarios u INNER JOIN empresas e ON u.empresa_id = e.id WHERE u.login = ?`, [login]);
        if (linhas.length === 0) return res.status(401).json({ erro: 'Login ou senha inválidos.' });

        const operador = linhas[0];
        if (operador.status !== 'ativo' || operador.empresa_status !== 'ativo') return res.status(403).json({ erro: 'Acesso bloqueado.' });

        if (String(operador.perfil || '').toLowerCase() === 'motorista') {
            return res.status(403).json({ erro: 'Este usuário é motorista. Acesse pelo aplicativo do motorista.' });
        }

        const senhaValida = await bcrypt.compare(senha, operador.senha);
        if (!senhaValida) return res.status(401).json({ erro: 'Login ou senha inválidos.' });

        delete operador.senha;
        const token = signToken({ role: 'operador', empresaId: operador.empresa_id, usuarioId: operador.id });
        res.json({ operador, token });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno no servidor.' }); }
});

// Login exclusivo do motorista — aceita só perfil = 'motorista'. Retorna o
// mesmo token de role 'operador' (compatível com as rotas já existentes,
// como POST /coletas/posicao) mas com escopo separado na camada de UI.
router.post('/motorista', async (req, res) => {
    try {
        const { login, senha } = req.body;
        const [linhas] = await db.query(
            `SELECT u.*, e.nome as empresa_nome, e.cor1, e.caminho_logo, e.api_mapas,
                    e.status as empresa_status, e.base_lat, e.base_lng
               FROM usuarios u
         INNER JOIN empresas e ON u.empresa_id = e.id
              WHERE u.login = ?`,
            [login]
        );
        if (linhas.length === 0) return res.status(401).json({ erro: 'Login ou senha inválidos.' });

        const motorista = linhas[0];
        if (motorista.status !== 'ativo' || motorista.empresa_status !== 'ativo') {
            return res.status(403).json({ erro: 'Acesso bloqueado.' });
        }
        if (String(motorista.perfil || '').toLowerCase() !== 'motorista') {
            return res.status(403).json({ erro: 'Este acesso é exclusivo para usuários com perfil Motorista.' });
        }

        const senhaValida = await bcrypt.compare(senha, motorista.senha);
        if (!senhaValida) return res.status(401).json({ erro: 'Login ou senha inválidos.' });

        delete motorista.senha;
        const token = signToken({
            role: 'operador',
            empresaId: motorista.empresa_id,
            usuarioId: motorista.id,
            tipoApp: 'motorista'
        });
        res.json({ motorista, token });
    } catch (erro) {
        console.error('[login/motorista] erro', erro);
        res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
});

router.post('/emitir-token-empresa', requireAuth, requireMaster, async (req, res) => {
    try {
        const empresaId = Number(req.body.empresa_id);
        if (!empresaId) return res.status(400).json({ erro: 'empresa_id inválido.' });

        const [linhas] = await db.query('SELECT * FROM empresas WHERE id = ?', [empresaId]);
        if (linhas.length === 0) return res.status(404).json({ erro: 'Empresa não encontrada.' });

        const empresa = linhas[0];
        delete empresa.acesso_senha;
        const token = signToken({ role: 'empresa', empresaId: empresa.id });
        res.json({ empresa, token });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao emitir acesso.' });
    }
});

router.post('/esqueci-senha', async (req, res) => {
    try {
        const { usuario, tipo } = req.body;
        const senhaTemporaria = Math.random().toString(36).slice(-6).toUpperCase();
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senhaTemporaria, salt);

        if (tipo === 'empresa') {
            const [linhas] = await db.query('SELECT id FROM empresas WHERE documento = ? OR acesso_usuario = ?', [usuario, usuario]);
            if (linhas.length === 0) {
                return res.json({ mensagem: 'Se existir uma conta para este usuário, a senha foi atualizada. Verifique seu e-mail cadastrado.' });
            }
            await db.query('UPDATE empresas SET acesso_senha = ? WHERE id = ?', [senhaHash, linhas[0].id]);
        } else if (tipo === 'operador') {
            const [linhas] = await db.query('SELECT id FROM usuarios WHERE login = ?', [usuario]);
            if (linhas.length === 0) {
                return res.json({ mensagem: 'Se existir uma conta para este usuário, a senha foi atualizada. Verifique seu e-mail cadastrado.' });
            }
            await db.query('UPDATE usuarios SET senha = ? WHERE id = ?', [senhaHash, linhas[0].id]);
        } else {
            return res.status(400).json({ erro: 'Tipo inválido.' });
        }

        res.json({ mensagem: 'Se existir uma conta para este usuário, a senha foi atualizada. Verifique seu e-mail cadastrado.' });
    } catch (erro) { res.status(500).json({ erro: 'Erro ao processar recuperação.' }); }
});

module.exports = router;
