/**
 * Validações de negócio para inclusão de entregas (espelho mínimo do front em rotas.js).
 * Não chama ORS — regras de tempo flexível após corte de expedição ficam no cliente.
 */

const VEICULO_VOLUME_PADRAO_M3_POR_KG = 0.0025;

function hojeISOLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function agoraDecimalLocal() {
    const n = new Date();
    return n.getHours() + n.getMinutes() / 60;
}

function horaParaDecimal(hhmm, fallback) {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return fallback;
    const [h, m] = hhmm.split(':').map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
    return h + m / 60;
}

function volumeM3DeDims(a, l, c) {
    const x = Number(a) || 0;
    const y = Number(l) || 0;
    const z = Number(c) || 0;
    return (x * y * z) / 1_000_000;
}

/**
 * Bloqueia novos pedidos para "hoje" após corte_virada_dia da primeira base da empresa.
 */
async function assertNaoPassouViradaDia(pool, empresaId, dataEntrega) {
    if (String(dataEntrega || '').slice(0, 10) !== hojeISOLocal()) {
        return { ok: true };
    }
    const [bases] = await pool.query(
        'SELECT corte_virada_dia FROM bases WHERE empresa_id = ? ORDER BY id ASC LIMIT 1',
        [empresaId]
    );
    const hhmm = bases && bases[0] && bases[0].corte_virada_dia
        ? String(bases[0].corte_virada_dia).slice(0, 5)
        : '18:30';
    const lim = horaParaDecimal(hhmm, 18.5);
    if (agoraDecimalLocal() >= lim) {
        return {
            ok: false,
            erro: `Após ${hhmm} novas entregas só são aceitas no próximo dia.`
        };
    }
    return { ok: true };
}

/**
 * Soma carga (peso + volume) de todos os pacotes do turno/dia exceto concluídos.
 */
async function somarCargaTurnoPendente(pool, empresaId, dataEntrega, periodo) {
    const [rows] = await pool.query(
        `SELECT peso, altura, largura, comprimento FROM coletas
         WHERE empresa_id = ? AND data_entrega = ? AND periodo = ? AND status <> 'concluida'`,
        [empresaId, dataEntrega, periodo]
    );
    let pesoKg = 0;
    let volumeM3 = 0;
    for (const r of rows) {
        pesoKg += Number(r.peso) || 0;
        volumeM3 += volumeM3DeDims(r.altura, r.largura, r.comprimento);
    }
    return { pesoKg, volumeM3 };
}

/**
 * Valida peso/volume projetados contra o veículo informado (mesma regra do painel Rotas).
 * Se veiculoId for omitido, não aplica (o front já valida com o selecionado).
 */
async function validarCapacidadeInsercaoEntrega(pool, {
    empresaId,
    veiculoId,
    dataEntrega,
    periodo,
    pesoNovo,
    alturaNovo,
    larguraNovo,
    comprimentoNovo
}) {
    if (veiculoId == null || veiculoId === '') {
        return { ok: true, ignorado: true };
    }
    const idV = Number(veiculoId);
    if (!Number.isFinite(idV) || idV <= 0) {
        return { ok: false, erro: 'veiculo_id inválido.' };
    }
    const [vei] = await pool.query(
        'SELECT id, capacidade_peso FROM veiculos WHERE id = ? AND empresa_id = ? LIMIT 1',
        [idV, empresaId]
    );
    if (vei.length === 0) {
        return { ok: false, erro: 'Veículo não encontrado para esta empresa.' };
    }
    const pesoMax = Number(vei[0].capacidade_peso) || 0;
    const volumeMax = pesoMax * VEICULO_VOLUME_PADRAO_M3_POR_KG;

    const base = await somarCargaTurnoPendente(pool, empresaId, dataEntrega, periodo);
    const pAdd = Number(pesoNovo) || 0;
    const vAdd = volumeM3DeDims(alturaNovo, larguraNovo, comprimentoNovo);
    const peso = base.pesoKg + pAdd;
    const vol = base.volumeM3 + vAdd;

    if (peso > pesoMax + 1e-6 || vol > volumeMax + 1e-9) {
        const partes = [];
        if (peso > pesoMax) partes.push(`peso total ${peso.toFixed(1)}kg > ${pesoMax.toFixed(0)}kg`);
        if (vol > volumeMax) partes.push(`volume total ${vol.toFixed(3)}m³ > ${volumeMax.toFixed(3)}m³`);
        return {
            ok: false,
            erro: `Capacidade do veículo excedida neste turno: ${partes.join(' e ')}.`
        };
    }
    return { ok: true };
}

module.exports = {
    hojeISOLocal,
    assertNaoPassouViradaDia,
    validarCapacidadeInsercaoEntrega,
    somarCargaTurnoPendente
};
