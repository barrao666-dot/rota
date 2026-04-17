const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const bcrypt = require('bcrypt');
const { requireAuth, requireMaster } = require('../middleware/auth');

const pastaUploads = path.join(__dirname, '../uploads/logos');
if (!fs.existsSync(pastaUploads)) { fs.mkdirSync(pastaUploads, { recursive: true }); }

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, pastaUploads); },
    filename: function (req, file, cb) {
        const sufixoUnico = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, sufixoUnico + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Monta um endereço legível a partir dos campos cadastrais da empresa.
// Aceita campos vazios — o que tiver, entra. Útil para criar a base default
// sem exigir campos extras no formulário de cadastro de empresa.
function montarEnderecoEmpresa(d) {
    const partes = [];
    if (d.rua) partes.push(String(d.rua).trim());
    if (d.numero) partes[partes.length - 1] += `, ${String(d.numero).trim()}`;
    if (d.bairro) partes.push(String(d.bairro).trim());
    const cidadeUf = [d.cidade, d.uf].filter(Boolean).map((v) => String(v).trim()).join(' - ');
    if (cidadeUf) partes.push(cidadeUf);
    if (d.cep) partes.push(`CEP ${String(d.cep).trim()}`);
    return partes.filter((p) => p && p.trim() !== '').join(' - ');
}

// Garante que a empresa tenha pelo menos uma base. Se não houver, cria uma
// "Sede" usando os dados de endereço informados no cadastro. Lat/lng ficam
// null — o operador é instruído pela tela de rotas a confirmar/geocodificar
// no painel da empresa. O importante é não cair no LOJA_COORDS default,
// que aponta para a região de outro cliente.
async function garantirBaseDefaultEmpresa(empresaId, dadosEmpresa) {
    if (!Number.isFinite(Number(empresaId))) return;
    const [existentes] = await db.query('SELECT id FROM bases WHERE empresa_id = ? LIMIT 1', [empresaId]);
    if (existentes.length > 0) return;
    const endereco = montarEnderecoEmpresa(dadosEmpresa) || 'Endereço a confirmar (configure no painel)';
    await db.query(
        `INSERT INTO bases (empresa_id, nome, endereco, lat, lng, corte_manha, corte_tarde) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [Number(empresaId), 'Sede', endereco, null, null, '09:00', '14:00']
    );
}

router.get('/dashboard', requireAuth, requireMaster, async (req, res) => {
    try {
        const [emp] = await db.query("SELECT COUNT(*) as total, SUM(CASE WHEN status='ativo' THEN 1 ELSE 0 END) as ativas, SUM(valor_plano) as receita FROM empresas");
        const [mot] = await db.query("SELECT COUNT(*) as total FROM motoristas");
        const [vei] = await db.query("SELECT COUNT(*) as total FROM veiculos");
        res.json({ clientes_total: emp[0].total || 0, clientes_ativos: emp[0].ativas || 0, receita: emp[0].receita || 0, motoristas_ativos: mot[0].total || 0, veiculos_ativos: vei[0].total || 0 });
    } catch (erro) { res.status(500).json({ erro: "Erro interno ao carregar métricas." }); }
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        if (!req.auth || !['empresa', 'operador'].includes(req.auth.role)) {
            return res.status(403).json({ erro: 'Acesso disponível apenas para empresa/operador.' });
        }
        const empresaId = Number(req.auth.empresaId);
        if (!Number.isFinite(empresaId)) return res.status(400).json({ erro: 'Empresa inválida.' });
        const [linhas] = await db.query('SELECT * FROM empresas WHERE id = ?', [empresaId]);
        if (!linhas.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
        const empresa = linhas[0];
        delete empresa.acesso_senha;
        res.json({ empresa });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao buscar empresa da sessão.' });
    }
});

router.get('/', requireAuth, requireMaster, async (req, res) => {
    try {
        const [linhas] = await db.query('SELECT * FROM empresas ORDER BY id DESC');
        linhas.forEach((e) => { delete e.acesso_senha; });
        res.json({ empresas: linhas });
    } catch (erro) { res.status(500).json({ erro: "Erro interno ao buscar empresas." }); }
});

router.post('/', requireAuth, requireMaster, upload.single('logo'), async (req, res) => {
    try {
        const d = req.body;
        let caminhoLogo = null;
        if (req.file) caminhoLogo = `/uploads/logos/${req.file.filename}`;

        let senhaCriptografada = d.acesso_senha;
        if (senhaCriptografada && String(senhaCriptografada).trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            senhaCriptografada = await bcrypt.hash(String(senhaCriptografada), salt);
        } else {
            senhaCriptografada = null;
        }

        let dataVenPost = d.data_vencimento;
        if (dataVenPost === undefined || dataVenPost === null || dataVenPost === '' || dataVenPost === 'null' || String(dataVenPost).trim() === '') {
            dataVenPost = null;
        }
        const valorPlanoPost = d.valor_plano === '' || d.valor_plano === undefined ? 0 : parseFloat(d.valor_plano);
        const vPlanoPost = Number.isNaN(valorPlanoPost) ? 0 : valorPlanoPost;

        const sql = `
            INSERT INTO empresas 
            (nome, documento, cep, rua, numero, complemento, bairro, cidade, uf, cor1, cor2, 
            acesso_usuario, acesso_email, acesso_senha, status, programa_parceiros, auditoria_cargas, db_tipo, db_string, caminho_logo,
            limite_usuarios, limite_motoristas, limite_veiculos, limite_bases, valor_plano, data_vencimento, api_mapas) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const valores = [
            d.nome, d.documento, d.cep, d.rua, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.cor1, d.cor2,
            d.acesso_usuario, d.acesso_email, senhaCriptografada, d.status, d.programa_parceiros, d.exigir_peso, d.db_tipo, d.db_string, caminhoLogo,
            d.limite_usuarios || 3, d.limite_motoristas || 5, d.limite_veiculos || 5, d.limite_bases || 1, vPlanoPost, dataVenPost, d.api_mapas || ''
        ];
        const [resultado] = await db.query(sql, valores);
        const novoEmpresaId = resultado.insertId;

        // Garante uma BASE default para a empresa recém-criada usando o
        // endereço informado no cadastro. Sem isso, /api/bases/{novoId}
        // devolveria [] e a tela de rotas cairia no LOJA_COORDS default —
        // que é a região onde já existe outra empresa, dando a falsa
        // sensação de "rota partindo da base do primeiro cliente".
        try {
            await garantirBaseDefaultEmpresa(novoEmpresaId, d);
        } catch (e) {
            console.warn('[empresas POST] falha ao criar base default', { id: novoEmpresaId, msg: e && e.message });
        }

        res.status(201).json({ mensagem: "Conta registrada!", id_inserido: novoEmpresaId });
    } catch (erro) {
        console.error('[empresas POST]', erro);
        res.status(500).json({ erro: erro.message || 'Erro interno ao salvar a conta.' });
    }
});

router.put('/:id', requireAuth, requireMaster, upload.single('logo'), async (req, res) => {
    try {
        const d = req.body;
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });

        let senhaFinal = d.acesso_senha;
        const senhaInformada = senhaFinal != null && String(senhaFinal).trim() !== '';
        if (senhaInformada) {
            if (!String(senhaFinal).startsWith('$2b$')) {
                const salt = await bcrypt.genSalt(10);
                senhaFinal = await bcrypt.hash(String(senhaFinal), salt);
            }
        } else {
            const [cur] = await db.query('SELECT acesso_senha FROM empresas WHERE id = ?', [id]);
            if (!cur.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
            senhaFinal = cur[0].acesso_senha;
        }

        let dataVen = d.data_vencimento;
        if (dataVen === undefined || dataVen === null || dataVen === '' || dataVen === 'null' || String(dataVen).trim() === '') {
            dataVen = null;
        }

        const valorPlano = d.valor_plano === '' || d.valor_plano === undefined ? 0 : parseFloat(d.valor_plano);
        const vPlano = Number.isNaN(valorPlano) ? 0 : valorPlano;

        let sql = `
            UPDATE empresas SET 
            nome=?, cep=?, rua=?, numero=?, complemento=?, bairro=?, cidade=?, uf=?, cor1=?, cor2=?, acesso_usuario=?, acesso_email=?, acesso_senha=?, status=?,
            programa_parceiros=?, auditoria_cargas=?, db_tipo=?, db_string=?,
            limite_usuarios=?, limite_motoristas=?, limite_veiculos=?, limite_bases=?, valor_plano=?, data_vencimento=?, api_mapas=?
        `;
        let valores = [
            d.nome, d.cep, d.rua, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.cor1, d.cor2, d.acesso_usuario, d.acesso_email, senhaFinal, d.status,
            d.programa_parceiros, d.exigir_peso, d.db_tipo, d.db_string,
            d.limite_usuarios || 3, d.limite_motoristas || 5, d.limite_veiculos || 5, d.limite_bases || 1, vPlano, dataVen, d.api_mapas || ''
        ];
        
        if (req.file) { sql += `, caminho_logo=?`; valores.push(`/uploads/logos/${req.file.filename}`); }
        sql += ` WHERE id=?`; valores.push(id);
        
        await db.query(sql, valores);

        // Backfill defensivo: empresas antigas que nunca tiveram base ganham
        // uma "Sede" agora. Sem isso, o cliente reclama que a tela de rotas
        // continua usando coordenadas erradas (default global).
        try {
            await garantirBaseDefaultEmpresa(id, d);
        } catch (e) {
            console.warn('[empresas PUT] falha ao garantir base default', { id, msg: e && e.message });
        }

        res.json({ mensagem: "Conta atualizada!" });
    } catch (erro) {
        console.error('[empresas PUT]', erro);
        res.status(500).json({ erro: erro.message || 'Erro interno ao atualizar a conta.' });
    }
});

router.put('/:id/status', requireAuth, requireMaster, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ erro: 'ID inválido.' });
        await db.query('UPDATE empresas SET status = ? WHERE id = ?', [req.body.status, id]);
        res.json({ mensagem: "Status atualizado!" });
    } catch (erro) {
        res.status(500).json({ erro: "Erro interno ao atualizar status da empresa." });
    }
});

module.exports = router;