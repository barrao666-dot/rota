const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const bcrypt = require('bcrypt');
const { requireAuth, requireMaster } = require('../middleware/auth');
const { somenteDigitos, validarDocumento } = require('../utils/documento-validator');

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

// Geocodifica um endereço usando Nominatim (OpenStreetMap). Roda no backend
// para resolver lat/lng JÁ no momento de criar/atualizar a empresa, sem
// depender de o navegador conseguir falar com a Nominatim depois (CORS,
// rate-limit por IP do cliente, geocodificação assíncrona perdendo corrida
// com o clique em "Criar Rota"). Retorna {lat, lng} ou null.
async function geocodificarEnderecoNominatim(d) {
    try {
        const cepDigits = (d.cep || '').replace(/\D/g, '');
        const partes = [
            (d.rua || '').trim(),
            (d.numero || '').toString().trim(),
            (d.bairro || '').trim(),
            (d.cidade || '').trim(),
            (d.uf || '').trim()
        ].filter((p) => p && p !== '');
        if (partes.length < 2) return null;
        const texto = partes.join(', ');
        const tentativas = [];
        // 1ª tentativa: estruturada (mais precisa quando temos CEP/cidade/UF).
        if (cepDigits || (d.cidade && d.uf)) {
            const params = new URLSearchParams({
                format: 'json', limit: '1', addressdetails: '1', countrycodes: 'br'
            });
            if (cepDigits) params.set('postalcode', cepDigits);
            if (d.cidade) params.set('city', String(d.cidade).trim());
            if (d.uf) params.set('state', String(d.uf).trim());
            if (d.rua) params.set('street', `${(d.numero || '').toString().trim()} ${String(d.rua).trim()}`.trim());
            tentativas.push(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
        }
        // 2ª tentativa: free-text com País e CEP.
        const q = encodeURIComponent(`${texto}${cepDigits ? `, ${cepDigits}` : ''}, Brasil`);
        tentativas.push(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=br&q=${q}`);

        for (const url of tentativas) {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 6000);
            try {
                const resp = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        // Nominatim exige User-Agent identificável — sem isso devolve 403.
                        'User-Agent': 'Rota++/1.0 (suporte@rota.app)',
                        'Accept-Language': 'pt-BR'
                    }
                });
                clearTimeout(t);
                if (!resp.ok) continue;
                const arr = await resp.json();
                if (Array.isArray(arr) && arr.length > 0 && arr[0].lat && arr[0].lon) {
                    const lat = parseFloat(arr[0].lat);
                    const lng = parseFloat(arr[0].lon);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
                }
            } catch (e) {
                clearTimeout(t);
                console.warn('[geocode nominatim] tentativa falhou', { url, msg: e && e.message });
            }
        }
    } catch (e) {
        console.warn('[geocode nominatim] erro inesperado', { msg: e && e.message });
    }
    return null;
}

// Garante que a empresa tenha pelo menos uma base. Se não houver, cria uma
// "Sede" usando os dados de endereço informados no cadastro e tenta
// geocodificar no Nominatim já aqui, gravando lat/lng. Sem isso o frontend
// recairia no LOJA_COORDS default (região de outro cliente) ou ficaria
// dependendo de uma geocodificação no navegador que costuma falhar
// silenciosamente (CORS / rate-limit). Idempotente: se a base já existe,
// faz backfill SOMENTE se ela ainda estiver sem coords.
async function garantirBaseDefaultEmpresa(empresaId, dadosEmpresa) {
    if (!Number.isFinite(Number(empresaId))) return;
    const endereco = montarEnderecoEmpresa(dadosEmpresa) || 'Endereço a confirmar (configure no painel)';

    const [existentes] = await db.query(
        'SELECT id, lat, lng FROM bases WHERE empresa_id = ? ORDER BY id ASC LIMIT 1',
        [empresaId]
    );

    if (existentes.length === 0) {
        const coords = await geocodificarEnderecoNominatim(dadosEmpresa);
        await db.query(
            `INSERT INTO bases (empresa_id, nome, endereco, lat, lng, corte_manha, corte_tarde) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [Number(empresaId), 'Sede', endereco, coords ? coords.lat : null, coords ? coords.lng : null, '09:00', '14:00']
        );
        return;
    }

    // Backfill: base já existe mas sem coords → tenta resolver agora.
    const baseAtual = existentes[0];
    const semCoords = baseAtual.lat == null || baseAtual.lng == null
        || !Number.isFinite(parseFloat(baseAtual.lat)) || !Number.isFinite(parseFloat(baseAtual.lng));
    if (!semCoords) return;
    const coords = await geocodificarEnderecoNominatim(dadosEmpresa);
    if (!coords) return;
    await db.query(
        'UPDATE bases SET endereco = ?, lat = ?, lng = ? WHERE id = ?',
        [endereco, coords.lat, coords.lng, baseAtual.id]
    );
}

router.get('/dashboard', requireAuth, requireMaster, async (req, res) => {
    try {
        const [emp] = await db.query(
            "SELECT COUNT(*) as total, " +
            "SUM(CASE WHEN status='ativo' THEN 1 ELSE 0 END) as ativas, " +
            "SUM(CASE WHEN status='bloqueado' THEN 1 ELSE 0 END) as bloqueadas, " +
            "SUM(CASE WHEN status='ativo' THEN valor_plano ELSE 0 END) as receita_ativa, " +
            "SUM(valor_plano) as receita_bruta " +
            "FROM empresas"
        );
        const [mot] = await db.query("SELECT COUNT(*) as total FROM motoristas");
        const [vei] = await db.query("SELECT COUNT(*) as total FROM veiculos");

        // Distribuição por UF (top 8). Útil pro mapa lateral.
        const [porUf] = await db.query(
            "SELECT UPPER(COALESCE(NULLIF(uf, ''), 'N/D')) AS uf, COUNT(*) AS qtd " +
            "FROM empresas WHERE status='ativo' GROUP BY UPPER(COALESCE(NULLIF(uf, ''), 'N/D')) ORDER BY qtd DESC LIMIT 8"
        );

        // Vencimentos próximos (30 dias) — gauge de risco financeiro.
        const [venc30] = await db.query(
            "SELECT COUNT(*) AS qtd FROM empresas " +
            "WHERE status='ativo' AND data_vencimento IS NOT NULL " +
            "AND data_vencimento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)"
        );

        res.json({
            clientes_total: emp[0].total || 0,
            clientes_ativos: emp[0].ativas || 0,
            clientes_bloqueados: emp[0].bloqueadas || 0,
            receita: emp[0].receita_ativa || 0,
            receita_bruta: emp[0].receita_bruta || 0,
            motoristas_ativos: mot[0].total || 0,
            veiculos_ativos: vei[0].total || 0,
            por_uf: porUf || [],
            vencimentos_30d: venc30[0].qtd || 0
        });
    } catch (erro) {
        console.error('[empresas dashboard]', erro);
        res.status(500).json({ erro: "Erro interno ao carregar métricas." });
    }
});

// Pinos das bases das empresas ATIVAS (com lat/lng resolvidos). Usado pelo
// mapa do painel master pra dar visão geográfica da operação. Filtramos
// bases sem coords pra não jogar pinos no centro do oceano (lat=0,lng=0).
router.get('/dashboard/bases-ativas', requireAuth, requireMaster, async (req, res) => {
    try {
        // Traz TODAS as bases de empresas ativas (com e sem coords) + as empresas
        // ativas que nem base têm. O frontend filtra o que plotar no mapa, mas
        // exibe um aviso com as pendências e um botão pra resolver tudo de uma vez.
        const [linhas] = await db.query(
            "SELECT b.id AS base_id, b.nome AS base_nome, b.endereco, " +
            "       CAST(b.lat AS DECIMAL(10,7)) AS lat, " +
            "       CAST(b.lng AS DECIMAL(10,7)) AS lng, " +
            "       e.id AS empresa_id, e.nome AS empresa_nome, " +
            "       COALESCE(NULLIF(e.cor1, ''), '#3b82f6') AS cor, " +
            "       UPPER(COALESCE(NULLIF(e.uf, ''), '')) AS uf, " +
            "       COALESCE(e.cidade, '') AS cidade " +
            "FROM bases b " +
            "INNER JOIN empresas e ON e.id = b.empresa_id " +
            "WHERE e.status = 'ativo' " +
            "ORDER BY e.nome ASC, b.id ASC"
        );
        const bases = linhas.map((l) => ({
            base_id: l.base_id,
            base_nome: l.base_nome,
            endereco: l.endereco,
            lat: Number(l.lat),
            lng: Number(l.lng),
            empresa_id: l.empresa_id,
            empresa_nome: l.empresa_nome,
            cor: l.cor,
            uf: l.uf,
            cidade: l.cidade,
            tem_coords: Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))
        }));
        const comCoords = bases.filter((b) => b.tem_coords);
        const semCoords = bases.filter((b) => !b.tem_coords);

        // Empresas ativas sem NENHUMA base cadastrada (raríssimo depois do
        // garantirBaseDefaultEmpresa, mas pode acontecer em bases antigas).
        const [semBase] = await db.query(
            "SELECT e.id AS empresa_id, e.nome AS empresa_nome, " +
            "       COALESCE(e.cidade, '') AS cidade, " +
            "       UPPER(COALESCE(NULLIF(e.uf, ''), '')) AS uf " +
            "FROM empresas e " +
            "LEFT JOIN bases b ON b.empresa_id = e.id " +
            "WHERE e.status = 'ativo' AND b.id IS NULL"
        );

        res.json({
            bases: comCoords,
            total: comCoords.length,
            pendentes_coords: semCoords,
            empresas_sem_base: semBase,
            total_pendentes: semCoords.length + semBase.length
        });
    } catch (erro) {
        console.error('[empresas bases-ativas]', erro);
        res.status(500).json({ erro: "Erro interno ao carregar bases ativas." });
    }
});

// Varredura idempotente: cria base default pra empresas ativas sem base
// e geocodifica bases que estão sem lat/lng. Protegido por requireMaster.
// Respeita o rate-limit do Nominatim (~1 req/s) serializando as chamadas.
router.post('/dashboard/geocodificar-bases', requireAuth, requireMaster, async (req, res) => {
    const resumo = {
        empresas_sem_base: 0,
        bases_geocodificadas: 0,
        bases_ainda_pendentes: 0,
        detalhes: []
    };
    try {
        const [semBase] = await db.query(
            "SELECT id, nome, rua, numero, bairro, cidade, uf, cep " +
            "FROM empresas WHERE status = 'ativo' " +
            "AND id NOT IN (SELECT empresa_id FROM bases WHERE empresa_id IS NOT NULL)"
        );
        for (const emp of semBase) {
            await garantirBaseDefaultEmpresa(emp.id, emp);
            resumo.empresas_sem_base += 1;
            resumo.detalhes.push({ empresa_id: emp.id, nome: emp.nome, acao: 'base_default_criada' });
            // Pausa curta entre geocodificações pra não estourar rate-limit Nominatim.
            await new Promise((r) => setTimeout(r, 1100));
        }

        const [basesPend] = await db.query(
            "SELECT b.id AS base_id, b.empresa_id, e.nome AS empresa_nome, " +
            "       e.rua, e.numero, e.bairro, e.cidade, e.uf, e.cep " +
            "FROM bases b INNER JOIN empresas e ON e.id = b.empresa_id " +
            "WHERE e.status = 'ativo' AND (b.lat IS NULL OR b.lng IS NULL)"
        );
        for (const item of basesPend) {
            const coords = await geocodificarEnderecoNominatim(item);
            if (coords) {
                await db.query('UPDATE bases SET lat = ?, lng = ? WHERE id = ?', [coords.lat, coords.lng, item.base_id]);
                resumo.bases_geocodificadas += 1;
                resumo.detalhes.push({ empresa_id: item.empresa_id, nome: item.empresa_nome, acao: 'geocodificada', lat: coords.lat, lng: coords.lng });
            } else {
                resumo.bases_ainda_pendentes += 1;
                resumo.detalhes.push({ empresa_id: item.empresa_id, nome: item.empresa_nome, acao: 'falhou_nominatim' });
            }
            await new Promise((r) => setTimeout(r, 1100));
        }

        res.json({ ok: true, resumo });
    } catch (erro) {
        console.error('[empresas geocodificar-bases]', erro);
        res.status(500).json({ erro: 'Erro interno ao geocodificar bases.', resumo });
    }
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

        // VALIDAÇÃO 1: documento (CPF ou CNPJ) precisa ser estruturalmente válido.
        // Sem isso, qualquer número de 11/14 dígitos passa e contamina o cadastro.
        const docCheck = validarDocumento(d.documento);
        if (!docCheck.ok) {
            return res.status(400).json({ erro: docCheck.msg, campo: 'documento' });
        }
        const documentoNorm = somenteDigitos(d.documento);

        // VALIDAÇÃO 2: anti-duplicidade. Mesmo com UNIQUE no banco, fazemos
        // SELECT antes pra devolver mensagem amigável (se confiarmos só na
        // constraint, o erro chega como "ER_DUP_ENTRY" cru). Se outro request
        // entrar entre o SELECT e o INSERT, o catch abaixo cobre o caso.
        const [dup] = await db.query(
            'SELECT id, nome FROM empresas WHERE documento = ? LIMIT 1',
            [documentoNorm]
        );
        if (dup.length > 0) {
            return res.status(409).json({
                erro: `Documento já cadastrado para "${dup[0].nome}" (ID ${dup[0].id}). Use a opção Editar.`,
                campo: 'documento',
                empresa_existente_id: dup[0].id
            });
        }

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
            d.nome, documentoNorm, d.cep, d.rua, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.cor1, d.cor2,
            d.acesso_usuario, d.acesso_email, senhaCriptografada, d.status, d.programa_parceiros, d.exigir_peso, d.db_tipo, d.db_string, caminhoLogo,
            d.limite_usuarios || 3, d.limite_motoristas || 5, d.limite_veiculos || 5, d.limite_bases || 1, vPlanoPost, dataVenPost, d.api_mapas || ''
        ];
        let resultado;
        try {
            [resultado] = await db.query(sql, valores);
        } catch (errInsert) {
            // Race condition: dois POSTs simultâneos passando pelo SELECT acima.
            // A UNIQUE KEY no banco pega; convertemos pra mensagem amigável.
            if (errInsert && (errInsert.code === 'ER_DUP_ENTRY' || errInsert.errno === 1062)) {
                return res.status(409).json({
                    erro: 'Documento já cadastrado em outra empresa.',
                    campo: 'documento'
                });
            }
            throw errInsert;
        }
        const novoEmpresaId = resultado.insertId;

        // Garante uma BASE default para a empresa recém-criada usando o
        // endereço informado no cadastro. Sem isso, /api/bases/{novoId}
        // devolveria [] e a tela de rotas cairia em coords default.
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