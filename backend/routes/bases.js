const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { assertCanAccessEmpresa } = require('../middleware/authz');
const { logAudit, parseIdOr400, isNonEmptyString } = require('../utils/route-helpers');

function horaHHMM(v, padrao) {
    let s = String(v == null ? '' : v).trim();
    // Navegadores podem enviar HH:MM:SS em <input type="time">; o regex abaixo só aceita HH:MM.
    if (/^\d{1,2}:\d{2}:\d{2}/.test(s)) s = s.slice(0, 5);
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
    if (!m) return padrao;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function minutosDesdeMeiaNoite(hhmm) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm == null ? '' : hhmm).trim());
    if (!m) return -1;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Retorna o horário HH:MM mais tardio (para manter corte_insercao_rota legado alinhado). */
function maisTardeHHMM(a, b) {
    const ma = minutosDesdeMeiaNoite(a);
    const mb = minutosDesdeMeiaNoite(b);
    if (ma < 0) return horaHHMM(b, '16:00');
    if (mb < 0) return horaHHMM(a, '10:30');
    return ma >= mb ? horaHHMM(a, '10:30') : horaHHMM(b, '16:00');
}

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

        const cM = horaHHMM(d.corte_manha, '09:00');
        const cT = horaHHMM(d.corte_tarde, '14:00');
        const fM = horaHHMM(d.fim_turno_manha, '12:00');
        const fT = horaHHMM(d.fim_turno_tarde, '18:00');
        const limM = horaHHMM(d.limite_insercao_manha, '10:30');
        const limT = horaHHMM(d.limite_insercao_tarde, '16:00');
        const ins = d.corte_insercao_rota != null && String(d.corte_insercao_rota).trim() !== ''
            ? horaHHMM(d.corte_insercao_rota, '17:50')
            : maisTardeHHMM(limM, limT);
        const vir = horaHHMM(d.corte_virada_dia, '18:30');
        await db.query(
            `INSERT INTO bases (empresa_id, nome, endereco, lat, lng, corte_manha, corte_tarde,
                fim_turno_manha, fim_turno_tarde, limite_insercao_manha, limite_insercao_tarde, corte_insercao_rota, corte_virada_dia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [d.empresa_id, d.nome, d.endereco, d.lat, d.lng, cM, cT, fM, fT, limM, limT, ins, vir]
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
        const [rowsCur] = await db.query(
            `SELECT corte_manha, corte_tarde, fim_turno_manha, fim_turno_tarde,
                    limite_insercao_manha, limite_insercao_tarde, corte_insercao_rota, corte_virada_dia
               FROM bases WHERE id = ?`,
            [id]
        );
        const cur = rowsCur && rowsCur[0];
        const merge = (campo, padrao) => {
            if (d[campo] !== undefined && d[campo] !== null && String(d[campo]).trim() !== '') {
                return horaHHMM(d[campo], padrao);
            }
            if (cur && cur[campo]) return horaHHMM(cur[campo], padrao);
            return padrao;
        };
        const cM = merge('corte_manha', '09:00');
        const cT = merge('corte_tarde', '14:00');
        const fM = merge('fim_turno_manha', '12:00');
        const fT = merge('fim_turno_tarde', '18:00');
        const limM = merge('limite_insercao_manha', '10:30');
        const limT = merge('limite_insercao_tarde', '16:00');
        const ins = d.corte_insercao_rota != null && String(d.corte_insercao_rota).trim() !== ''
            ? merge('corte_insercao_rota', '17:50')
            : maisTardeHHMM(limM, limT);
        const vir = merge('corte_virada_dia', '18:30');
        await db.query(
            `UPDATE bases SET nome=?, endereco=?, lat=?, lng=?, corte_manha=?, corte_tarde=?,
                fim_turno_manha=?, fim_turno_tarde=?, limite_insercao_manha=?, limite_insercao_tarde=?,
                corte_insercao_rota=?, corte_virada_dia=?
             WHERE id=?`,
            [d.nome, d.endereco, d.lat, d.lng, cM, cT, fM, fT, limM, limT, ins, vir, id]
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
