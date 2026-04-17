const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { assertCanAccessEmpresa } = require('../middleware/authz');
const { logAudit, parseIdOr400 } = require('../utils/route-helpers');

function empresaScopeClause(req) {
    return req.auth.role === 'master' ? null : Number(req.auth.empresaId);
}

function horaAtualHHMM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function adicionarUmDia(dataISO) {
    const d = new Date(`${dataISO}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validarDataISO(v) {
    if (typeof v !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function normalizarTextoOpcional(v, { max = 255 } = {}) {
    if (v == null) return null;
    if (typeof v !== 'string') return { erro: 'Valor de texto inválido.' };
    const t = v.trim();
    if (t.length > max) return { erro: `Texto excede ${max} caracteres.` };
    return t;
}

function normalizarNumeroOpcional(v, { min = null, max = null } = {}) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return { erro: 'Valor numérico inválido.' };
    if (min != null && n < min) return { erro: `Valor deve ser >= ${min}.` };
    if (max != null && n > max) return { erro: `Valor deve ser <= ${max}.` };
    return n;
}

// Valida que a entrega `entregaId` existe, pertence à mesma empresa,
// NÃO é uma coleta (tamanho != 'Coleta') e não é um modelo/template.
// Retorna { erro } ou { ok: true } quando a vinculação é válida.
async function validarVinculoEntrega(empresaId, entregaId) {
    if (entregaId == null) return { ok: true };
    const idNum = Number(entregaId);
    if (!Number.isFinite(idNum) || idNum <= 0) return { erro: 'Entrega vinculada inválida.' };
    const [rows] = await db.query(
        'SELECT id, empresa_id, tamanho, status FROM coletas WHERE id = ? LIMIT 1',
        [idNum]
    );
    if (rows.length === 0) return { erro: 'Entrega vinculada não encontrada.' };
    const alvo = rows[0];
    if (Number(alvo.empresa_id) !== Number(empresaId)) return { erro: 'Entrega vinculada pertence a outra empresa.' };
    if (String(alvo.tamanho || '').toLowerCase() === 'coleta') {
        return { erro: 'Não é permitido vincular uma coleta a outra coleta.' };
    }
    if (String(alvo.status || '').toLowerCase() === 'modelo') {
        return { erro: 'Não é permitido vincular a um registro modelo.' };
    }
    return { ok: true, alvo };
}

function montarUpdateRoteamento(payload) {
    const setParts = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(payload, 'ordem')) {
        const ordem = payload.ordem;
        if (ordem !== null && (!Number.isFinite(Number(ordem)) || Number(ordem) < 1)) {
            return { erro: 'Ordem inválida.' };
        }
        setParts.push('ordem = ?');
        values.push(ordem === null ? null : Math.trunc(Number(ordem)));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'tempo_viagem')) {
        const tempo = payload.tempo_viagem;
        if (tempo !== null && (!Number.isFinite(Number(tempo)) || Number(tempo) < 0)) {
            return { erro: 'Tempo de viagem inválido.' };
        }
        setParts.push('tempo_viagem = ?');
        values.push(tempo === null ? null : Math.trunc(Number(tempo)));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'distancia_km')) {
        const dist = payload.distancia_km;
        if (dist !== null && !Number.isFinite(Number(dist))) {
            return { erro: 'Distância inválida.' };
        }
        setParts.push('distancia_km = ?');
        values.push(dist === null ? null : Number(dist));
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'cor_icone')) {
        const cor = payload.cor_icone;
        if (cor !== null && typeof cor !== 'string') return { erro: 'Cor inválida.' };
        setParts.push('cor_icone = ?');
        values.push(cor === null ? null : cor.trim());
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        const status = String(payload.status || '').trim().toLowerCase();
        if (!['pendente', 'em_transito', 'em_atendimento', 'concluida', 'modelo'].includes(status)) {
            return { erro: 'Status inválido.' };
        }
        setParts.push('status = ?');
        values.push(status);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'periodo')) {
        const periodo = payload.periodo == null ? null : String(payload.periodo).trim().toLowerCase();
        if (periodo !== null && !['manha', 'tarde'].includes(periodo)) return { erro: 'Período inválido.' };
        setParts.push('periodo = ?');
        values.push(periodo);
    }

    // data_entrega opcional no lote: usado pela rotina de "estouro de turno"
    // que migra automaticamente os pontos que não couberam no dia atual para o
    // próximo dia (regra de negócio: manhã estoura → cai na tarde; tarde
    // estoura → cai no dia seguinte).
    if (Object.prototype.hasOwnProperty.call(payload, 'data_entrega')) {
        const dt = payload.data_entrega;
        if (dt !== null && !validarDataISO(dt)) return { erro: 'Data de entrega inválida. Use YYYY-MM-DD.' };
        setParts.push('data_entrega = ?');
        values.push(dt === null ? null : String(dt).slice(0, 10));
    }

    // hora_prevista (HH:MM): ETA calculado pelo otimizador ORS. Persistimos
    // pra o card mostrar o horário de chegada mesmo após F5.
    if (Object.prototype.hasOwnProperty.call(payload, 'hora_prevista')) {
        const hp = payload.hora_prevista;
        if (hp !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(hp))) {
            return { erro: 'Hora prevista inválida. Use HH:MM (00:00–23:59).' };
        }
        setParts.push('hora_prevista = ?');
        values.push(hp === null ? null : String(hp));
    }

    if (setParts.length === 0) return { erro: 'Nenhum campo válido para atualizar.' };
    return { setParts, values };
}

// ===== Rastreamento em tempo real do motorista =====
// Motorista envia sua posição periodicamente (a cada 15s na viagem ativa).
// Fazemos UPSERT por (empresa_id, usuario_id), mantendo uma linha só por
// motorista. Rota anterior à `/:id/...`, pois `/posicao` colidiria com o
// parâmetro dinâmico.
router.post('/posicao', requireAuth, async (req, res) => {
    try {
        // Aceita motoristaId (fluxo novo via tabela motoristas) ou
        // usuarioId (fluxo legado de operador com perfil motorista).
        const motoristaId = Number(req.auth && (req.auth.motoristaId || req.auth.usuarioId));
        const empresaId = Number(req.auth && req.auth.empresaId);
        if (!motoristaId || !empresaId) {
            console.warn('[posicao] 403 - role sem motorista/empresa', { auth: req.auth });
            return res.status(403).json({ erro: 'Apenas motoristas autenticados podem enviar posição.' });
        }
        const lat = parseFloat(req.body.lat);
        const lng = parseFloat(req.body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn('[posicao] 400 - coordenadas invalidas', { body: req.body });
            return res.status(400).json({ erro: 'Coordenadas inválidas.' });
        }
        console.log(`[posicao] OK emp=${empresaId} motorista=${motoristaId} lat=${lat} lng=${lng}`);
        const velocidade = req.body.velocidade != null && Number.isFinite(Number(req.body.velocidade))
            ? Math.max(0, Number(req.body.velocidade))
            : null;
        const precisao = req.body.precisao != null && Number.isFinite(Number(req.body.precisao))
            ? Math.max(0, Number(req.body.precisao))
            : null;

        await db.query(
            `INSERT INTO motoristas_posicao (empresa_id, usuario_id, lat, lng, velocidade, precisao, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                lat = VALUES(lat),
                lng = VALUES(lng),
                velocidade = VALUES(velocidade),
                precisao = VALUES(precisao),
                atualizado_em = NOW()`,
            [empresaId, motoristaId, lat, lng, velocidade, precisao]
        );
        res.json({ ok: true });
    } catch (erro) {
        console.warn('[coletas] POST /posicao falhou', erro && erro.message);
        res.status(500).json({ erro: 'Falha ao gravar posição.' });
    }
});

// Painel de rotas lê posições dos motoristas da empresa corrente.
// Retorna só os "frescos" (últimos 10 minutos) pra não poluir o mapa com
// dispositivos desligados há horas.
router.get('/posicao/motoristas', requireAuth, async (req, res) => {
    try {
        let empresaId;
        if (req.auth.role === 'master') {
            empresaId = Number(req.query.empresa_id) || null;
            if (!empresaId) return res.json([]);
        } else {
            empresaId = Number(req.auth.empresaId);
            if (!empresaId) return res.json([]);
        }
        // A coluna `usuario_id` em motoristas_posicao guarda hoje o id do
        // motorista (tabela `motoristas`). Fazemos JOIN com `motoristas`
        // primeiro; como fallback (rows legadas), tentamos `usuarios`.
        const [rows] = await db.query(
            `SELECT mp.usuario_id,
                    mp.usuario_id AS motorista_id,
                    COALESCE(m.nome, u.nome)   AS nome,
                    COALESCE(m.login, u.login) AS login,
                    mp.lat, mp.lng,
                    mp.velocidade, mp.precisao, mp.atualizado_em
               FROM motoristas_posicao mp
          LEFT JOIN motoristas m ON m.id = mp.usuario_id AND m.empresa_id = mp.empresa_id
          LEFT JOIN usuarios u   ON u.id = mp.usuario_id AND u.empresa_id = mp.empresa_id
              WHERE mp.empresa_id = ?
                AND mp.atualizado_em > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
              ORDER BY mp.atualizado_em DESC`,
            [empresaId]
        );
        res.json(rows);
    } catch (erro) {
        console.warn('[coletas] GET /posicao/motoristas falhou', erro && erro.message);
        res.status(500).json({ erro: 'Falha ao ler posições.' });
    }
});

router.patch('/:id/status', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const acao = String(req.body.acao || '').trim().toLowerCase();
        if (!['partir', 'cheguei', 'concluir', 'falha', 'reabrir'].includes(acao)) return res.status(400).json({ erro: 'Ação inválida.' });

        const scope = empresaScopeClause(req);
        let pacote;
        if (scope === null) {
            const [rows] = await db.query('SELECT * FROM coletas WHERE id = ? LIMIT 1', [id]);
            pacote = rows[0];
        } else {
            const [rows] = await db.query('SELECT * FROM coletas WHERE id = ? AND empresa_id = ? LIMIT 1', [id, scope]);
            pacote = rows[0];
        }
        if (!pacote) return res.status(404).json({ erro: 'Coleta não encontrada.' });

        const sets = [];
        const values = [];
        if (acao === 'partir') {
            sets.push('status = ?', 'hora_partida = ?');
            values.push('em_transito', horaAtualHHMM());
        } else if (acao === 'cheguei') {
            const viagemRaw = normalizarNumeroOpcional(req.body.tempo_viagem_real, { min: 1 });
            if (viagemRaw?.erro) return res.status(400).json({ erro: viagemRaw.erro });
            const viagemMin = pacote.hora_partida ? Math.max(1, Number(viagemRaw) || 1) : 1;
            sets.push('status = ?', 'hora_chegada = ?', 'tempo_viagem_real = ?');
            values.push('em_atendimento', horaAtualHHMM(), viagemMin);
        } else if (acao === 'concluir') {
            const localRaw = normalizarNumeroOpcional(req.body.tempo_no_local_real, { min: 1 });
            if (localRaw?.erro) return res.status(400).json({ erro: localRaw.erro });
            const localMin = pacote.hora_chegada ? Math.max(1, Number(localRaw) || 1) : 1;
            sets.push('status = ?', 'hora_conclusao = ?', 'tempo_no_local_real = ?');
            values.push('concluida', horaAtualHHMM(), localMin);
        } else if (acao === 'falha') {
            const dataBase = (pacote.data_entrega || new Date().toISOString().slice(0, 10)).toString().slice(0, 10);
            sets.push(
                'status = ?',
                'data_entrega = ?',
                'ordem = NULL',
                'tempo_viagem = NULL',
                'cor_icone = NULL',
                'hora_partida = NULL',
                'hora_chegada = NULL',
                'hora_conclusao = NULL'
            );
            values.push('pendente', adicionarUmDia(dataBase));
        } else if (acao === 'reabrir') {
            sets.push('status = ?');
            values.push('pendente');
        }

        const where = scope === null ? 'WHERE id = ?' : 'WHERE id = ? AND empresa_id = ?';
        values.push(id);
        if (scope !== null) values.push(scope);

        await db.query(`UPDATE coletas SET ${sets.join(', ')} ${where}`, values);
        logAudit(req, 'coletas', 'status', { id, acao });
        res.json({ mensagem: 'Status atualizado com sucesso.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao atualizar status da coleta.' });
    }
});

router.patch('/:id/ordem', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;

        const ordemRaw = req.body.ordem;
        const ordem = ordemRaw == null ? null : Number(ordemRaw);
        if (ordem !== null && (!Number.isFinite(ordem) || ordem < 1)) {
            return res.status(400).json({ erro: 'Ordem inválida.' });
        }

        const scope = empresaScopeClause(req);
        const where = scope === null ? 'WHERE id = ?' : 'WHERE id = ? AND empresa_id = ?';
        const params = ordem === null ? [null, id] : [Math.trunc(ordem), id];
        if (scope !== null) params.push(scope);

        const [result] = await db.query(`UPDATE coletas SET ordem = ? ${where}`, params);
        if (result.affectedRows === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });

        res.json({ mensagem: 'Ordem atualizada com sucesso.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao atualizar ordem da coleta.' });
    }
});

router.patch('/:id/turno', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const periodo = String(req.body.periodo || '').trim().toLowerCase();
        if (!['manha', 'tarde'].includes(periodo)) return res.status(400).json({ erro: 'Período inválido.' });

        const scope = empresaScopeClause(req);
        const where = scope === null ? 'WHERE id = ?' : 'WHERE id = ? AND empresa_id = ?';
        const params = [periodo, id];
        if (scope !== null) params.push(scope);

        const [result] = await db.query(`UPDATE coletas SET periodo = ? ${where}`, params);
        if (result.affectedRows === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });

        res.json({ mensagem: 'Turno atualizado com sucesso.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao atualizar turno da coleta.' });
    }
});

router.patch('/:id/roteamento', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;

        const payload = req.body || {};
        const parsed = montarUpdateRoteamento(payload);
        if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
        const { setParts, values } = parsed;

        const scope = empresaScopeClause(req);
        const where = scope === null ? 'WHERE id = ?' : 'WHERE id = ? AND empresa_id = ?';
        values.push(id);
        if (scope !== null) values.push(scope);

        const [result] = await db.query(`UPDATE coletas SET ${setParts.join(', ')} ${where}`, values);
        if (result.affectedRows === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });

        logAudit(req, 'coletas', 'roteamento_unitario', { id, campos: setParts.map((s) => s.split('=')[0].trim()) });
        res.json({ mensagem: 'Roteamento atualizado com sucesso.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao atualizar roteamento da coleta.' });
    }
});

router.patch('/roteamento/lote', requireAuth, async (req, res) => {
    let conn;
    try {
        const entregas = req.body.entregas;
        if (!Array.isArray(entregas) || entregas.length === 0) return res.status(400).json({ erro: 'Lista inválida.' });

        const scope = empresaScopeClause(req);
        conn = await db.getConnection();
        await conn.beginTransaction();

        for (const item of entregas) {
            const id = Number(item.id);
            if (!Number.isFinite(id)) return res.status(400).json({ erro: 'ID inválido em lote.' });

            const parsed = montarUpdateRoteamento(item);
            if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
            const { setParts, values } = parsed;

            const where = scope === null ? 'WHERE id = ?' : 'WHERE id = ? AND empresa_id = ?';
            const queryValues = [...values, id];
            if (scope !== null) queryValues.push(scope);
            const [result] = await conn.query(`UPDATE coletas SET ${setParts.join(', ')} ${where}`, queryValues);
            if (result.affectedRows === 0) {
                await conn.rollback();
                return res.status(404).json({ erro: `Coleta ${id} não encontrada.` });
            }
        }

        await conn.commit();
        logAudit(req, 'coletas', 'roteamento_lote', { quantidade: entregas.length, ids: entregas.map((e) => Number(e.id)) });
        res.json({ mensagem: 'Roteamento em lote atualizado com sucesso.' });
    } catch (erro) {
        if (conn) await conn.rollback();
        res.status(500).json({ erro: 'Erro interno ao atualizar roteamento em lote.' });
    } finally {
        if (conn) conn.release();
    }
});

router.patch('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;

        const d = req.body || {};
        const campos = [];
        const valores = [];

        if (Object.prototype.hasOwnProperty.call(d, 'fornecedor')) {
            const v = normalizarTextoOpcional(d.fornecedor, { max: 140 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('fornecedor = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'endereco')) {
            const v = normalizarTextoOpcional(d.endereco, { max: 500 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('endereco = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'lat')) {
            const v = normalizarNumeroOpcional(d.lat, { min: -90, max: 90 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('lat = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'lng')) {
            const v = normalizarNumeroOpcional(d.lng, { min: -180, max: 180 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('lng = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'dataEntrega')) {
            if (d.dataEntrega != null && !validarDataISO(d.dataEntrega)) return res.status(400).json({ erro: 'Data inválida. Use YYYY-MM-DD.' });
            campos.push('data_entrega = ?'); valores.push(d.dataEntrega || null);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'periodo')) {
            const p = d.periodo == null ? null : String(d.periodo).trim().toLowerCase();
            if (p != null && !['manha', 'tarde'].includes(p)) return res.status(400).json({ erro: 'Período inválido.' });
            campos.push('periodo = ?'); valores.push(p);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'tamanho')) {
            const v = normalizarTextoOpcional(d.tamanho, { max: 80 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('tamanho = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'peso')) {
            const v = normalizarNumeroOpcional(d.peso, { min: 0 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('peso = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'altura')) {
            const v = normalizarNumeroOpcional(d.altura, { min: 0 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('altura = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'largura')) {
            const v = normalizarNumeroOpcional(d.largura, { min: 0 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('largura = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'comprimento')) {
            const v = normalizarNumeroOpcional(d.comprimento, { min: 0 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('comprimento = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'tempo_medio')) {
            const v = normalizarNumeroOpcional(d.tempo_medio, { min: 0 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('tempo_medio = ?'); valores.push(v == null ? null : Math.trunc(v));
        }
        if (Object.prototype.hasOwnProperty.call(d, 'codigo_barras')) {
            const v = normalizarTextoOpcional(d.codigo_barras, { max: 140 });
            if (v?.erro) return res.status(400).json({ erro: v.erro });
            campos.push('codigo_barras = ?'); valores.push(v);
        }
        if (Object.prototype.hasOwnProperty.call(d, 'coleta_vinculada_id')) {
            const rawVinc = d.coleta_vinculada_id;
            if (rawVinc == null || rawVinc === '') {
                campos.push('coleta_vinculada_id = ?'); valores.push(null);
            } else {
                // Descobre a empresa da coleta atual antes de validar o alvo.
                const scope = empresaScopeClause(req);
                const baseQ = scope === null
                    ? 'SELECT empresa_id, tamanho FROM coletas WHERE id = ? LIMIT 1'
                    : 'SELECT empresa_id, tamanho FROM coletas WHERE id = ? AND empresa_id = ? LIMIT 1';
                const baseArgs = scope === null ? [id] : [id, scope];
                const [baseRows] = await db.query(baseQ, baseArgs);
                if (baseRows.length === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });
                const base = baseRows[0];
                if (String(base.tamanho || '').toLowerCase() !== 'coleta') {
                    return res.status(400).json({ erro: 'Apenas registros do tipo Coleta podem ser vinculados a uma entrega.' });
                }
                if (Number(rawVinc) === Number(id)) {
                    return res.status(400).json({ erro: 'Uma coleta não pode se vincular a si mesma.' });
                }
                const vinc = await validarVinculoEntrega(base.empresa_id, rawVinc);
                if (vinc.erro) return res.status(400).json({ erro: vinc.erro });
                campos.push('coleta_vinculada_id = ?'); valores.push(Number(rawVinc));
            }
        }

        if (campos.length === 0) return res.status(400).json({ erro: 'Nenhum campo válido para atualizar.' });

        const scope = empresaScopeClause(req);
        const where = scope === null ? 'WHERE id = ?' : 'WHERE id = ? AND empresa_id = ?';
        valores.push(id);
        if (scope !== null) valores.push(scope);

        const [result] = await db.query(`UPDATE coletas SET ${campos.join(', ')} ${where}`, valores);
        if (result.affectedRows === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });
        res.json({ mensagem: 'Coleta atualizada com sucesso.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro interno ao atualizar coleta.' });
    }
});

router.get('/:empresa_id', requireAuth, async (req, res) => {
    try {
        if (!assertCanAccessEmpresa(req, res, req.params.empresa_id)) return;
        const [linhas] = await db.query(`
            SELECT c.*, m.nome as motorista_nome, v.modelo as veiculo_modelo, v.placa as veiculo_placa 
            FROM coletas c LEFT JOIN motoristas m ON c.motorista_id = m.id LEFT JOIN veiculos v ON c.veiculo_id = v.id
            WHERE c.empresa_id = ?
        `, [req.params.empresa_id]);
        res.json(linhas);
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao buscar coletas.' }); }
});

router.post('/', requireAuth, async (req, res) => {
    try {
        const d = req.body;
        if (!assertCanAccessEmpresa(req, res, d.empresa_id)) return;

        if (!Number.isFinite(Number(d.empresa_id))) return res.status(400).json({ erro: 'Empresa inválida.' });
        const fornecedor = normalizarTextoOpcional(d.fornecedor || d.nomeCliente, { max: 140 });
        if (fornecedor?.erro || !fornecedor) return res.status(400).json({ erro: fornecedor?.erro || 'Fornecedor obrigatório.' });
        const endereco = normalizarTextoOpcional(d.endereco, { max: 500 });
        if (endereco?.erro || !endereco) return res.status(400).json({ erro: endereco?.erro || 'Endereço obrigatório.' });
        if (!validarDataISO(String(d.dataEntrega || ''))) return res.status(400).json({ erro: 'Data inválida. Use YYYY-MM-DD.' });
        const periodo = String(d.periodo || '').trim().toLowerCase();
        if (!['manha', 'tarde'].includes(periodo)) return res.status(400).json({ erro: 'Período inválido.' });
        const status = String(d.status || 'pendente').trim().toLowerCase();
        if (!['pendente', 'modelo', 'em_transito', 'em_atendimento', 'concluida'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
        const lat = normalizarNumeroOpcional(d.lat, { min: -90, max: 90 });
        if (lat?.erro) return res.status(400).json({ erro: lat.erro });
        const lng = normalizarNumeroOpcional(d.lng, { min: -180, max: 180 });
        if (lng?.erro) return res.status(400).json({ erro: lng.erro });
        const peso = normalizarNumeroOpcional(d.peso, { min: 0 });
        if (peso?.erro) return res.status(400).json({ erro: peso.erro });
        const altura = normalizarNumeroOpcional(d.altura, { min: 0 });
        if (altura?.erro) return res.status(400).json({ erro: altura.erro });
        const largura = normalizarNumeroOpcional(d.largura, { min: 0 });
        if (largura?.erro) return res.status(400).json({ erro: largura.erro });
        const comprimento = normalizarNumeroOpcional(d.comprimento, { min: 0 });
        if (comprimento?.erro) return res.status(400).json({ erro: comprimento.erro });
        const tempoMedio = normalizarNumeroOpcional(d.tempo_medio, { min: 0 });
        if (tempoMedio?.erro) return res.status(400).json({ erro: tempoMedio.erro });
        const tamanho = normalizarTextoOpcional(d.tamanho, { max: 80 });
        if (tamanho?.erro || !tamanho) return res.status(400).json({ erro: tamanho?.erro || 'Tamanho obrigatório.' });
        const codigoBarras = normalizarTextoOpcional(d.codigo_barras, { max: 140 });
        if (codigoBarras?.erro) return res.status(400).json({ erro: codigoBarras.erro });

        // coleta_vinculada_id só faz sentido quando este registro é uma COLETA.
        // Para entregas normais (tamanho != 'Coleta') ignoramos o campo.
        let coletaVinculadaId = null;
        if (String(tamanho || '').toLowerCase() === 'coleta' && d.coleta_vinculada_id != null && d.coleta_vinculada_id !== '') {
            const vinc = await validarVinculoEntrega(d.empresa_id, d.coleta_vinculada_id);
            if (vinc.erro) return res.status(400).json({ erro: vinc.erro });
            coletaVinculadaId = Number(d.coleta_vinculada_id);
        }

        const [result] = await db.query(`
            INSERT INTO coletas (
                empresa_id, fornecedor, endereco, lat, lng, data_entrega, periodo, tamanho, status, motorista_id, veiculo_id,
                peso, altura, largura, comprimento, tempo_medio, criado_em, codigo_barras, coleta_vinculada_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            Number(d.empresa_id), fornecedor, endereco, lat, lng, d.dataEntrega, periodo, tamanho, status,
            d.motorista_id || null, d.veiculo_id || null, peso || 0, altura || 0, largura || 0, comprimento || 0, tempoMedio || 600, d.criadoEm || null, codigoBarras, coletaVinculadaId
        ]);
        logAudit(req, 'coletas', 'create', { id: result.insertId, empresa_id: Number(d.empresa_id), status, vinculada: coletaVinculadaId });
        res.status(201).json({ id: result.insertId, mensagem: 'Criado com sucesso.' });
    } catch (erro) {
        console.error('[coletas:POST] falha ao salvar', { msg: erro && erro.message, code: erro && erro.code, sql: erro && erro.sqlMessage });
        res.status(500).json({ erro: 'Erro interno ao salvar coleta.', detalhe: (erro && (erro.sqlMessage || erro.message)) || null });
    }
});

router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const id = parseIdOr400(req, res);
        if (id == null) return;
        const scope = empresaScopeClause(req);
        // Coletas que apontavam para esta entrega perdem o vínculo (passam a
        // ser independentes). Evita órfãos e mantém a integridade do índice.
        if (scope === null) {
            await db.query('UPDATE coletas SET coleta_vinculada_id = NULL WHERE coleta_vinculada_id = ?', [id]);
            const [r] = await db.query('DELETE FROM coletas WHERE id = ?', [id]);
            if (r.affectedRows === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });
        } else {
            await db.query('UPDATE coletas SET coleta_vinculada_id = NULL WHERE coleta_vinculada_id = ? AND empresa_id = ?', [id, scope]);
            const [r] = await db.query('DELETE FROM coletas WHERE id = ? AND empresa_id = ?', [id, scope]);
            if (r.affectedRows === 0) return res.status(404).json({ erro: 'Coleta não encontrada.' });
        }
        logAudit(req, 'coletas', 'delete', { id });
        res.json({ mensagem: 'Excluído.' });
    } catch (erro) { res.status(500).json({ erro: 'Erro interno ao excluir coleta.' }); }
});

module.exports = router;
