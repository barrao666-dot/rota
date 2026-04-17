let ORS_KEY = '';
let empresaId = null;
let CORTE_MANHA = '09:00';
let CORTE_TARDE = '14:00';
let html5QrcodeScanner = null;
const ZOOM_BASE_OPERACIONAL_ROTAS = 17;

// IMPORTANTE: nunca usar coords default fixas aqui. Antes do carregamento da
// base da empresa, qualquer valor "esperto" parece a base real do cliente
// anterior — e ao trocar de empresa o operador vê o pino na cidade errada.
// Mantemos null e quem for usar precisa checar BASE_EMPRESA_OK primeiro.
let LOJA_COORDS = null;
let ENDERECO_BASE_TEXTO = '';
// True quando a base ATUAL da empresa foi carregada/geocodificada com sucesso.
// Enquanto false, não permitimos gerar rotas nem desenhar pino — caso
// contrário, mostramos uma localização errada (de outra empresa) ou rota
// partindo da base errada.
let BASE_EMPRESA_OK = false;

let TABELA_PRODUTOS = {}; let FROTA_VEICULOS = []; let MOTORISTAS_EQUIPE = [];

let map; let entregas = []; let fornecedoresBase = []; let layersPinos = []; let layersLinhas = []; let idEditando = null;
let ultimaAssinaturaSincRotas = '';
let ultimaAssinaturaLinhasRota = '';
const ROTAS_KM_ALERTA_MOVIMENTO = 2.0;
const ROTAS_KM_MELHORIA_REFINO = 0.25;

// Regras de horário (cut-offs do turno)
// Limite para aceitar NOVAS entregas/endereços na rota do dia corrente.
const CORTE_INSERCAO_ROTA = '17:50';
// Limite para virar o dia: pendências e rotas não iniciadas migram para o próximo dia.
const CORTE_VIRADA_DIA = '18:30';
// Fim padrão dos turnos (usado para validar transbordo do turno e realocação).
const FIM_TURNO_MANHA = '12:00';
const FIM_TURNO_TARDE = '18:00';

// Limiares para avisos de reordenação (distância total em linha reta).
const ROTA_AVISO_AUMENTO_KM = 1.5;     // +1,5km no percurso já avisa o operador
const ROTA_AVISO_AUMENTO_PCT = 0.20;   // ou +20% sobre o custo anterior
// Densidade volumétrica padrão (~0,0025 m³ por kg) para estimar capacidade
// volumétrica quando o veículo não possui esse campo cadastrado.
const VEICULO_VOLUME_PADRAO_M3_POR_KG = 0.0025;

function rotasPollSubtleLigado() {
    return localStorage.getItem('rotas_poll_subtle') !== '0';
}
function rotasIntelOrdemLigado() {
    return localStorage.getItem('rotas_intel_ordem') !== '0';
}
function initRotasOpcoesUi() {
    const subChk = document.getElementById('chk-rotas-subtle-poll');
    if (subChk) {
        subChk.checked = localStorage.getItem('rotas_poll_subtle') !== '0';
        subChk.addEventListener('change', () => {
            localStorage.setItem('rotas_poll_subtle', subChk.checked ? '1' : '0');
            ultimaAssinaturaSincRotas = '';
            ultimaAssinaturaLinhasRota = '';
        });
    }
    const intelChk = document.getElementById('chk-rotas-intel-ordem');
    if (intelChk) {
        intelChk.checked = localStorage.getItem('rotas_intel_ordem') !== '0';
        intelChk.addEventListener('change', () => {
            localStorage.setItem('rotas_intel_ordem', intelChk.checked ? '1' : '0');
        });
    }
}
function onChangeFiltroDataRotas() {
    ultimaAssinaturaSincRotas = '';
    ultimaAssinaturaLinhasRota = '';
    renderizarListaSimples({ preservarViewport: false });
    atualizarSelectEntregaVincular();
    tracarRotasNasRuas();
}
/** Força próximo carregarDados a redesenhar (evita UI “travada” se o sync suave pular após falha local). */
function invalidarCachesyncRotas() {
    ultimaAssinaturaSincRotas = '';
    ultimaAssinaturaLinhasRota = '';
}
function listaPacotesRotaOrdenada(data, periodo) {
    return entregas
        .filter((e) => e.dataEntrega === data && e.periodo === periodo && e.ordem && e.status !== 'concluida')
        .sort((a, b) => a.ordem - b.ordem);
}
function snapOrdemTurno(data, periodo) {
    return listaPacotesRotaOrdenada(data, periodo).map((p) => ({ id: p.id, ordem: p.ordem }));
}
async function restaurarSnapOrdem(snap) {
    for (let i = 0; i < snap.length; i++) {
        const row = snap[i];
        await apiFetchJson(`/api/coletas/${row.id}/ordem`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ordem: row.ordem })
        });
    }
}
function custoHaversinePercurso(listaOrdenada) {
    const L = listaOrdenada.filter((p) => p.coords && p.coords.length >= 2 && !isNaN(p.coords[0]) && !isNaN(p.coords[1]));
    if (!L.length) return 0;
    if (!Array.isArray(LOJA_COORDS) || LOJA_COORDS.length < 2) return 0;
    let c = calcularDistancia(LOJA_COORDS[0], LOJA_COORDS[1], L[0].coords[0], L[0].coords[1]);
    for (let k = 0; k < L.length - 1; k++) {
        c += calcularDistancia(L[k].coords[0], L[k].coords[1], L[k + 1].coords[0], L[k + 1].coords[1]);
    }
    return c;
}
async function trocarOrdemDoisPacotesApi(a, b) {
    const oa = a.ordem;
    const ob = b.ordem;
    await apiFetchJson(`/api/coletas/${a.id}/ordem`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordem: ob })
    });
    await apiFetchJson(`/api/coletas/${b.id}/ordem`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordem: oa })
    });
}
function assinaturaSincronizacaoRotas(listaEntregas, dataFiltro) {
    const subset = listaEntregas
        .filter((e) => e.dataEntrega === dataFiltro)
        .map((e) =>
            [
                e.id,
                e.ordem ?? '',
                e.status,
                e.periodo,
                e.tempoViagem ?? '',
                String(e.distanciaTrecho ?? ''),
                e.nomeCliente ? String(e.nomeCliente).slice(0, 32) : '',
                e.coords && e.coords.length >= 2 ? Math.round(e.coords[0] * 1e5) : '',
                e.coords && e.coords.length >= 2 ? Math.round(e.coords[1] * 1e5) : ''
            ].join(':')
        )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return (dataFiltro || '') + '|' + subset.join('|');
}
function assinaturaLinhasRota(d) {
    const part = (turno) => {
        const pts = entregas
            .filter((e) => e.dataEntrega === d && e.periodo === turno && e.ordem && e.status !== 'concluida' && e.coords)
            .sort((a, b) => a.ordem - b.ordem);
        return `${turno}:${pts.map((p) => p.id).join(',')}`;
    };
    return `${d}|${part('manha')}|${part('tarde')}`;
}
async function refinamentoLocalHaversineAposMover(idMovido, data, periodo) {
    if (!rotasIntelOrdemLigado()) return;
    for (let pass = 0; pass < 2; pass++) {
        const L = listaPacotesRotaOrdenada(data, periodo);
        if (L.length < 2 || !L.every((p) => p.coords && p.coords.length >= 2)) return;
        const i = L.findIndex((x) => x.id === idMovido);
        if (i === -1) return;
        const custoAtual = custoHaversinePercurso(L);
        let melhorDelta = 0;
        let trocarI = -1;
        let trocarJ = -1;
        if (i < L.length - 1) {
            const Ls = L.slice();
            const t = Ls[i];
            Ls[i] = Ls[i + 1];
            Ls[i + 1] = t;
            const d = custoAtual - custoHaversinePercurso(Ls);
            if (d > melhorDelta) {
                melhorDelta = d;
                trocarI = i;
                trocarJ = i + 1;
            }
        }
        if (i > 0) {
            const Ls = L.slice();
            const t = Ls[i - 1];
            Ls[i - 1] = Ls[i];
            Ls[i] = t;
            const d = custoAtual - custoHaversinePercurso(Ls);
            if (d > melhorDelta) {
                melhorDelta = d;
                trocarI = i - 1;
                trocarJ = i;
            }
        }
        if (melhorDelta < ROTAS_KM_MELHORIA_REFINO || trocarI < 0) return;
        await trocarOrdemDoisPacotesApi(L[trocarI], L[trocarJ]);
        await carregarDados({ subtle: true });
    }
}

// Garante a invariante pickup→delivery: para cada coleta com
// coletaVinculadaId preenchido na data informada:
//   1. a coleta e sua entrega ficam no MESMO turno (coleta herda o turno da entrega);
//   2. a coleta recebe ordem imediatamente anterior à entrega na sequência do turno.
// Só grava se houver mudanças reais, evitando loops desnecessários com o backend.
async function garantirAdjacenciaVinculosNoDia(dataFiltro) {
    const vinculadas = entregas.filter((e) =>
        e.dataEntrega === dataFiltro &&
        e.status !== 'concluida' &&
        e.coletaVinculadaId != null &&
        ehColeta(e)
    );
    if (vinculadas.length === 0) return false;

    let alterou = false;

    // 1) Força coleta no mesmo turno da entrega vinculada e herda o período
    //    dela mesmo quando a coleta ainda não está ordenada. Também colore a
    //    coleta para facilitar a leitura visual no card.
    for (const coleta of vinculadas) {
        const alvo = entregas.find((x) => x.id === coleta.coletaVinculadaId);
        if (!alvo) continue; // entrega foi removida — será dissociada na próxima leitura
        if (alvo.dataEntrega !== coleta.dataEntrega) continue;
        const periodoAlvo = alvo.periodo || coleta.periodo;
        if (periodoAlvo && coleta.periodo !== periodoAlvo) {
            try {
                await apiFetchJson(`/api/coletas/${coleta.id}/turno`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ periodo: periodoAlvo })
                });
                coleta.periodo = periodoAlvo;
                alterou = true;
            } catch (e) {
                console.warn('Falha ao alinhar turno da coleta vinculada', coleta.id, e);
            }
        }
    }

    // 2) Reorganiza ordem por turno: coleta imediatamente antes da entrega alvo.
    //    Inclui coletas SEM ordem quando a entrega alvo já está roteada — assim
    //    uma coleta recém-inserida e vinculada entra automaticamente na rota.
    for (const turno of ['manha', 'tarde']) {
        const roteadas = entregas
            .filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem && e.status !== 'concluida')
            .sort((a, b) => a.ordem - b.ordem);

        // Coletas vinculadas cujo alvo está roteado neste turno mas que ainda
        // não têm ordem precisam ser injetadas.
        const coletasSemOrdemParaInjetar = entregas.filter((e) =>
            e.dataEntrega === dataFiltro &&
            e.periodo === turno &&
            e.status !== 'concluida' &&
            !e.ordem &&
            ehColeta(e) &&
            e.coletaVinculadaId != null &&
            roteadas.some((r) => r.id === e.coletaVinculadaId)
        );

        if (roteadas.length === 0 && coletasSemOrdemParaInjetar.length === 0) continue;

        const temVinculoNoTurno = roteadas.some((x) => x.coletaVinculadaId != null && ehColeta(x))
            || coletasSemOrdemParaInjetar.length > 0;
        if (!temVinculoNoTurno) continue;

        // Mapa de pickup por id de delivery, combinando as já roteadas e as
        // recém-vinculadas sem ordem (essas entram na sequência pela primeira vez).
        const coletasPorAlvo = new Map();
        for (const p of roteadas) {
            if (ehColeta(p) && p.coletaVinculadaId != null) {
                coletasPorAlvo.set(p.coletaVinculadaId, p);
            }
        }
        for (const p of coletasSemOrdemParaInjetar) {
            if (!coletasPorAlvo.has(p.coletaVinculadaId)) {
                coletasPorAlvo.set(p.coletaVinculadaId, p);
            }
        }

        const coletasJaAlocadas = new Set();
        const nova = [];
        for (const p of roteadas) {
            const ehVinculada = ehColeta(p) && p.coletaVinculadaId != null;
            if (ehVinculada) continue; // será injetada quando a entrega alvo aparecer
            const pickup = coletasPorAlvo.get(p.id);
            if (pickup && !coletasJaAlocadas.has(pickup.id)) {
                nova.push(pickup);
                coletasJaAlocadas.add(pickup.id);
            }
            nova.push(p);
        }
        // Coletas vinculadas cuja entrega não está no mesmo turno voltam ao fim.
        for (const [, pickup] of coletasPorAlvo) {
            if (!coletasJaAlocadas.has(pickup.id)) nova.push(pickup);
        }

        const corDoTurno = turno === 'manha' ? '#16a34a' : '#2563eb';
        const entregasAlterar = [];
        nova.forEach((p, idx) => {
            const novaOrdem = idx + 1;
            const mudouOrdem = p.ordem !== novaOrdem;
            const mudouCor = ehColeta(p) && p.coletaVinculadaId != null && p.corIcone !== corDoTurno;
            if (mudouOrdem || mudouCor) {
                p.ordem = novaOrdem;
                if (mudouCor) p.corIcone = corDoTurno;
                entregasAlterar.push(p);
            }
        });
        if (entregasAlterar.length > 0) {
            // Recalcula ETA do turno agora que a ordem mudou (coleta injetada).
            const etaAlterados = recalcularEtaTurno(dataFiltro, turno);
            // Consolida: entregas com ordem OU hora_prevista alteradas.
            const idsJaNoLote = new Set(entregasAlterar.map((x) => x.id));
            etaAlterados.forEach((x) => { if (!idsJaNoLote.has(x.id)) entregasAlterar.push(x); });
            try {
                await atualizarRoteamentoLote(entregasAlterar);
                alterou = true;
            } catch (e) {
                console.warn('Falha ao gravar adjacência pickup→delivery', e);
            }
        }
    }

    if (alterou) {
        invalidarCachesyncRotas();
        await carregarDados({ subtle: true });
    }
    return alterou;
}

// Garante que coletas rejeitadas pelo ORS (normalmente por tempo do turno)
// SEMPRE entrem na rota do dia — a regra de negócio é que coleta nunca
// fica pendente fora da rota. Escolhe o turno que tem menos paradas e
// INSERE na melhor posição geográfica (cheapest insertion via Haversine)
// pra não criar zig-zag no meio da rota já otimizada pelo ORS.
async function forcarColetasNoTurnoMaisLeve(coletas, dataFiltro) {
    if (!coletas || coletas.length === 0) return;

    for (const coleta of coletas) {
        const qtdManha = entregas.filter((e) => e.dataEntrega === dataFiltro && e.periodo === 'manha' && e.ordem && e.status !== 'concluida').length;
        const qtdTarde = entregas.filter((e) => e.dataEntrega === dataFiltro && e.periodo === 'tarde' && e.ordem && e.status !== 'concluida').length;
        const turnoAlvo = qtdManha <= qtdTarde ? 'manha' : 'tarde';
        const cor = turnoAlvo === 'manha' ? '#16a34a' : '#2563eb';

        // Cheapest insertion: acha a posição (ordem) que minimiza o
        // aumento de distância total. Evita jogar a coleta no fim e
        // quebrar a proximidade construída pelo ORS.
        const melhorOrdem = escolherMelhorOrdemInsercao(coleta, dataFiltro, turnoAlvo);

        coleta.periodo = turnoAlvo;
        coleta.ordem = melhorOrdem;
        coleta.corIcone = cor;
        coleta.status = 'pendente';

        // Abre espaço na sequência: todo mundo >= melhorOrdem ganha +1.
        const demais = entregas.filter((e) =>
            e.dataEntrega === dataFiltro && e.periodo === turnoAlvo &&
            e.status !== 'concluida' && e.id !== coleta.id && e.ordem >= melhorOrdem
        );
        const entregasAlterar = [coleta];
        demais.forEach((e) => { e.ordem = (e.ordem || 0) + 1; entregasAlterar.push(e); });

        try {
            await atualizarRoteamentoLote(entregasAlterar);
        } catch (e) {
            console.warn('Falha ao auto-forçar coleta na rota', coleta.id, e);
        }
    }
}

// Retorna a melhor ORDEM (1-based) para inserir `pacoteNovo` no turno
// especificado, minimizando o aumento de distância em linha reta.
// Se o pacote não tem coords válidos, retorna o fim da fila (fallback).
function escolherMelhorOrdemInsercao(pacoteNovo, dataFiltro, turno) {
    const existentes = entregas
        .filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem && e.status !== 'concluida' && e.id !== pacoteNovo.id)
        .sort((a, b) => a.ordem - b.ordem);
    if (existentes.length === 0) return 1;
    const coordsNovo = pacoteNovo.coords;
    if (!Array.isArray(coordsNovo) || coordsNovo.length < 2 || !Array.isArray(LOJA_COORDS) || LOJA_COORDS.length < 2) {
        return existentes.length + 1;
    }
    // Sequência completa: base → p1 → p2 → ... → pn → base
    const seq = [LOJA_COORDS, ...existentes.map((e) => e.coords), LOJA_COORDS];
    let melhorPos = existentes.length + 1;
    let melhorCusto = Infinity;
    for (let i = 1; i < seq.length; i++) {
        const antes = seq[i - 1];
        const depois = seq[i];
        // Custo extra = (antes→novo) + (novo→depois) − (antes→depois)
        const extra = calcularDistancia(antes[0], antes[1], coordsNovo[0], coordsNovo[1])
                    + calcularDistancia(coordsNovo[0], coordsNovo[1], depois[0], depois[1])
                    - calcularDistancia(antes[0], antes[1], depois[0], depois[1]);
        if (extra < melhorCusto) { melhorCusto = extra; melhorPos = i; }
    }
    return melhorPos;
}

// Reordena os pontos vizinhos ao item recém-movido aplicando um
// "nearest-neighbor" ancorado: o idMovido mantém a posição que o usuário
// escolheu e os demais são reposicionados a partir dele priorizando
// proximidade (em linha reta). Só roda quando o custo final é melhor que
// o atual — respeita a decisão do usuário se a ordem manual for boa.
async function reordenacaoInteligenteAncorada(idMovido, data, periodo) {
    if (!rotasIntelOrdemLigado()) return;
    const L = listaPacotesRotaOrdenada(data, periodo);
    if (L.length < 3 || !L.every((p) => p.coords && p.coords.length >= 2)) return;
    const idxAncora = L.findIndex((p) => p.id === idMovido);
    if (idxAncora === -1) return;

    const custoAtual = custoHaversinePercurso(L);
    const ancora = L[idxAncora];
    const anteriores = L.slice(0, idxAncora);
    const posteriores = L.slice(idxAncora + 1);

    // Reordena "posteriores" via vizinho mais próximo partindo da âncora.
    const reorderPosteriores = [];
    let atual = ancora;
    const pool = posteriores.slice();
    while (pool.length) {
        let melhor = 0;
        let melhorDist = Infinity;
        for (let i = 0; i < pool.length; i++) {
            const d = calcularDistancia(atual.coords[0], atual.coords[1], pool[i].coords[0], pool[i].coords[1]);
            if (d < melhorDist) { melhorDist = d; melhor = i; }
        }
        const proximo = pool.splice(melhor, 1)[0];
        reorderPosteriores.push(proximo);
        atual = proximo;
    }

    const nova = [...anteriores, ancora, ...reorderPosteriores];
    const custoNovo = custoHaversinePercurso(nova);
    // Só grava se melhorou de forma relevante (evita "brigar" com o usuário).
    if (custoAtual - custoNovo < Math.max(ROTA_AVISO_AUMENTO_KM * 0.75, ROTAS_KM_MELHORIA_REFINO * 3)) return;

    try {
        const entregasAlterar = [];
        nova.forEach((p, idx) => {
            const novaOrdem = idx + 1;
            if (p.ordem !== novaOrdem) {
                p.ordem = novaOrdem;
                entregasAlterar.push(p);
            }
        });
        if (entregasAlterar.length === 0) return;
        await atualizarRoteamentoLote(entregasAlterar);
        invalidarCachesyncRotas();
        await carregarDados({ subtle: true });
        mostrarSucesso('🔁 Rota reorganizada automaticamente com base na nova posição do ponto movido.');
    } catch (e) {
        console.warn('Falha na reordenação inteligente ancorada', e);
    }
}

function aplicarTemaEmpresaRotas(empresa) {
    const corPrimaria = (empresa && empresa.cor1) ? empresa.cor1 : '#333333';
    const corSecundaria = (empresa && empresa.cor2) ? empresa.cor2 : '#F9801A';
    const root = document.documentElement;
    root.style.setProperty('--primary', corPrimaria);
    root.style.setProperty('--accent', corSecundaria);
    root.style.setProperty('--charcoal', corPrimaria);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', corPrimaria);
}

const dadosOperador = localStorage.getItem('dados_operador'); const dadosEmpresa = localStorage.getItem('dados_empresa');

if (!dadosOperador || !dadosEmpresa) { alert("Acesso restrito. Faça login."); window.location.href = '/index.html'; } else {
    const operador = JSON.parse(dadosOperador); const empresa = JSON.parse(dadosEmpresa);
    aplicarTemaEmpresaRotas(empresa);
    empresaId = operador.empresa_id || operador.id;
    const opEl = document.getElementById('txt-nome-operador');
    const empEl = document.getElementById('txt-nome-empresa');
    if (opEl) opEl.innerText = operador.nome || 'Operador';
    if (empEl) empEl.innerText = empresa.nome || 'Logística';
    if (empresa.caminho_logo) {
        const logoEl = document.getElementById('img-logo-empresa');
        if (logoEl) { logoEl.src = empresa.caminho_logo; logoEl.style.display = 'block'; }
        const relEl = document.getElementById('img-relatorio-logo');
        if (relEl) { relEl.src = empresa.caminho_logo; relEl.style.display = 'block'; }
    }
    if (empresa.api_mapas && empresa.api_mapas.trim() !== '') ORS_KEY = empresa.api_mapas;
}

function getToday() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; }
function formatarData(dataStr) { if(!dataStr) return ''; const partes = dataStr.split('-'); return `${partes[2]}/${partes[1]}/${partes[0]}`; }
function calcularDistancia(lon1, lat1, lon2, lat2) { const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180; const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2); const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); return R * c; }

function horaParaDecimal(hhmm, fallback) {
    if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return fallback;
    const [h, m] = hhmm.split(':').map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
    return h + (m / 60);
}

function adicionarUmDia(dataStr) {
    const d = new Date(`${dataStr}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function agoraDecimal() {
    const n = new Date();
    return n.getHours() + (n.getMinutes() / 60);
}

// True se o horário atual já ultrapassou o limite de inserção (17:50 por padrão)
// para a data informada (só faz sentido travar "hoje").
function passouLimiteInsercaoHoje(dataEntregaStr) {
    if (dataEntregaStr !== getToday()) return false;
    const limite = horaParaDecimal(CORTE_INSERCAO_ROTA, 17 + (50 / 60));
    return agoraDecimal() >= limite;
}

// True se já passou do horário de virada (18:30) em relação a "hoje".
function passouViradaDia() {
    const limite = horaParaDecimal(CORTE_VIRADA_DIA, 18.5);
    return agoraDecimal() >= limite;
}

// Um turno é considerado "iniciado" quando há pelo menos uma entrega marcada
// como concluída nele (indício de que o motorista saiu em rota).
function turnoFoiIniciado(dataFiltro, turno) {
    return entregas.some((e) =>
        e.dataEntrega === dataFiltro &&
        e.periodo === turno &&
        e.status === 'concluida'
    );
}

function tempoEstimadoTotalTurnoMin(dataFiltro, turno) {
    const pacotes = listaPacotesRotaOrdenada(dataFiltro, turno);
    return pacotes.reduce((acc, p) => {
        const viagem = parseInt(p.tempoViagem) || 0;
        const servicoMin = Math.round(((p.specs && p.specs.tempoServico) || 600) / 60);
        return acc + viagem + servicoMin;
    }, 0);
}

function fimDoTurnoDecimal(turno) {
    if (turno === 'manha') return horaParaDecimal(FIM_TURNO_MANHA, 12);
    return horaParaDecimal(FIM_TURNO_TARDE, 18);
}

// Calcula capacidade utilizada (peso em kg e volume em m³) para um turno.
function calcularCargaTurno(dataFiltro, turno) {
    const pacotes = entregas.filter((e) =>
        e.dataEntrega === dataFiltro &&
        e.periodo === turno &&
        e.ordem &&
        e.status !== 'concluida'
    );
    let pesoKg = 0;
    let volumeM3 = 0;
    for (const p of pacotes) {
        const peso = parseFloat(p.specs?.peso || 0) || 0;
        const a = parseFloat(p.specs?.a || 0) || 0;
        const l = parseFloat(p.specs?.l || 0) || 0;
        const c = parseFloat(p.specs?.c || 0) || 0;
        pesoKg += peso;
        // dimensões vêm em cm; converte para m³.
        volumeM3 += (a * l * c) / 1_000_000;
    }
    return { pesoKg, volumeM3, qtd: pacotes.length };
}

// Retorna a capacidade (peso/volume) do veículo atualmente selecionado.
// Se não houver volume cadastrado, usa heurística em cima do peso permitido.
function capacidadeVeiculoSelecionado() {
    const selV = document.getElementById('select-veiculo');
    const idVei = selV ? selV.value : '';
    const v = FROTA_VEICULOS.find((x) => String(x.id) === String(idVei));
    if (!v) return null;
    const pesoMax = parseFloat(v.capacidade_peso) || 0;
    const volumeMax = parseFloat(v.capacidade_volume_m3) > 0
        ? parseFloat(v.capacidade_volume_m3)
        : pesoMax * VEICULO_VOLUME_PADRAO_M3_POR_KG;
    return { id: v.id, modelo: v.modelo, placa: v.placa, pesoMax, volumeMax };
}

// Retorna true se o registro é uma COLETA (tipo "Coleta" ou prefixo no nome).
function ehColeta(entrega) {
    if (!entrega) return false;
    return entrega.tamanho === 'Coleta' || (typeof entrega.nomeCliente === 'string' && entrega.nomeCliente.startsWith('🏢 COLETA:'));
}

// Lista entregas (não coletas) da data selecionada, disponíveis para serem
// escolhidas como alvo de vínculo de uma nova coleta.
function entregasDisponiveisParaVincular(dataFiltro) {
    return entregas
        .filter((e) => e.dataEntrega === dataFiltro && !ehColeta(e) && e.status !== 'concluida')
        .sort((a, b) => (a.ordem || 9999) - (b.ordem || 9999) || String(a.nomeCliente || '').localeCompare(String(b.nomeCliente || '')));
}

// (Re)popula o select de "Vincular coleta a uma entrega" quando a lista de
// entregas do dia muda. Mantém a seleção atual se ainda for válida.
function atualizarSelectEntregaVincular() {
    const sel = document.getElementById('select-entrega-vincular');
    if (!sel) return;
    // Preferência: data escolhida no campo de inserção da coleta (data-entrega).
    // Fallback: filtro da tela. Assim, mudar a data do formulário já atualiza a lista de entregas elegíveis.
    const dataCampo = document.getElementById('data-entrega');
    const filtroEl = document.getElementById('filtro-data-operacao');
    const dataRef = (dataCampo && dataCampo.value) || (filtroEl && filtroEl.value) || getToday();
    const atualSelecionado = sel.value;
    const lista = entregasDisponiveisParaVincular(dataRef);
    sel.innerHTML = `<option value="">Coleta independente (sem vínculo — ${formatarData(dataRef) || dataRef})</option>`;
    if (lista.length === 0) {
        sel.innerHTML += `<option value="" disabled>Nenhuma entrega pendente em ${formatarData(dataRef) || dataRef}</option>`;
    }
    lista.forEach((e) => {
        const rotulo = `#${e.id} · ${(e.nomeCliente || 'Entrega').slice(0, 40)}${e.ordem ? ` (ordem ${e.ordem}º)` : ''}`;
        sel.innerHTML += `<option value="${e.id}">${rotulo}</option>`;
    });
    if (atualSelecionado && lista.some((e) => String(e.id) === String(atualSelecionado))) {
        sel.value = atualSelecionado;
    }
}

// Emite avisos visuais (mostrarErro com prefixo ⚠️) quando a carga excede
// peso ou volume do veículo escolhido.
function avaliarAvisosCapacidade(dataFiltro, turno, opts = {}) {
    const silent = !!opts.silent;
    const cap = capacidadeVeiculoSelecionado();
    if (!cap || cap.pesoMax <= 0) return { warnPeso: false, warnVolume: false };
    const carga = calcularCargaTurno(dataFiltro, turno);
    const warnPeso = carga.pesoKg > cap.pesoMax;
    const warnVolume = carga.volumeM3 > cap.volumeMax;
    if (!silent && (warnPeso || warnVolume)) {
        const partes = [];
        if (warnPeso) partes.push(`peso ${carga.pesoKg.toFixed(1)}kg &gt; ${cap.pesoMax.toFixed(0)}kg`);
        if (warnVolume) partes.push(`volume ${carga.volumeM3.toFixed(3)}m³ &gt; ${cap.volumeMax.toFixed(3)}m³`);
        mostrarErro(`⚠️ Capacidade do veículo (${cap.modelo} ${cap.placa}) excedida no turno ${turno === 'manha' ? 'manhã' : 'tarde'}: ${partes.join(' e ')}.`);
    }
    return { warnPeso, warnVolume, cap, carga };
}

function focarMapaNaBaseRotas() {
    if (!map || !Array.isArray(LOJA_COORDS) || LOJA_COORDS.length < 2) return;
    const lat = parseFloat(LOJA_COORDS[1]);
    const lng = parseFloat(LOJA_COORDS[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    map.setView([lat, lng], ZOOM_BASE_OPERACIONAL_ROTAS);
    // Pino da base só é desenhado quando temos coords válidas. Substitui o
    // anterior se já existia (ex.: após geocodificação tardia ou mudança de
    // base) para não acumular múltiplos pinos no mapa.
    try {
        if (marcadorBaseRotas) { map.removeLayer(marcadorBaseRotas); }
        const popupTxt = ENDERECO_BASE_TEXTO ? `<b>Base</b><br>${ENDERECO_BASE_TEXTO}` : '<b>Base</b>';
        marcadorBaseRotas = L.marker([lat, lng]).addTo(map).bindPopup(popupTxt);
    } catch (e) { /* mapa não pronto */ }
}

function aplicarRegraHorario(opts = {}) {
    const silent = !!opts.silent;
    const inputData = document.getElementById('data-entrega');
    const selectPeriodo = document.getElementById('periodo');
    const optManha = document.getElementById('opt-manha');
    const optTarde = document.getElementById('opt-tarde');
    if (!inputData || !selectPeriodo || !optManha || !optTarde) return;

    if (!inputData.value) inputData.value = getToday();
    const dataSelecionada = inputData.value;
    const hoje = getToday();
    const agora = new Date();
    const tempoDecimal = agora.getHours() + (agora.getMinutes() / 60);

    const corteManha = horaParaDecimal(CORTE_MANHA, 9.0);
    const corteTarde = horaParaDecimal(CORTE_TARDE, 14.0);
    const travaManha = corteManha + 0.5;
    const travaHoje = corteTarde + 0.5;

    optManha.disabled = false;
    optTarde.disabled = false;

    if (dataSelecionada < hoje) {
        inputData.value = hoje;
        return aplicarRegraHorario(opts);
    }

    const limiteInsercao = horaParaDecimal(CORTE_INSERCAO_ROTA, 17 + (50 / 60));
    const limiteVirada = horaParaDecimal(CORTE_VIRADA_DIA, 18.5);

    if (dataSelecionada === hoje) {
        if (tempoDecimal >= limiteVirada) {
            inputData.value = adicionarUmDia(hoje);
            if (selectPeriodo.value !== 'manha') selectPeriodo.value = 'manha';
            if (!silent) mostrarErro(`Após ${CORTE_VIRADA_DIA} novas entregas só são aceitas no próximo dia (virada automática).`);
            return;
        }
        if (tempoDecimal >= limiteInsercao) {
            if (!silent) mostrarErro(`⚠️ Após ${CORTE_INSERCAO_ROTA} não é permitido inserir novos endereços na rota do dia. A data foi ajustada para o próximo dia.`);
            inputData.value = adicionarUmDia(hoje);
            if (selectPeriodo.value !== 'manha') selectPeriodo.value = 'manha';
            return;
        }
        if (tempoDecimal >= travaHoje) {
            inputData.value = adicionarUmDia(hoje);
            if (selectPeriodo.value !== 'manha') selectPeriodo.value = 'manha';
            if (!silent) mostrarErro(`Após ${CORTE_TARDE} (+30min), novos agendamentos vão para o próximo dia.`);
            return;
        }
        if (tempoDecimal >= travaManha) {
            optManha.disabled = true;
            if (selectPeriodo.value === 'manha') selectPeriodo.value = 'tarde';
            if (!silent) mostrarErro(`Após ${CORTE_MANHA} (+30min), turno da manhã fica indisponível para novos agendamentos.`);
        }
    }
}

/* Geocoding e formato de endereço: geocodificarEntregaMesmaRegraPainel, parseEnderecoSalvoPainel em /js/endereco-geocode.js */

// Inicializa o mapa centralizado no Brasil (visão larga) e SEM pino de base.
// O pino só é desenhado depois que carregarConfiguracoesDaEmpresa resolver
// as coords reais — ver focarMapaNaBaseRotas. Centro=[-15.78, -47.93] (Brasília)
// e zoom 4 mostra o país inteiro, deixando óbvio que a base ainda não carregou.
try {
    map = L.map('map').setView([-15.78, -47.93], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
} catch(err) { }
let marcadorBaseRotas = null;

async function sincronizarEmpresaAtual() {
    try {
        const data = await apiFetchJson('/api/empresas/me');
        if (!data || !data.empresa) return;
        const emp = data.empresa;
        localStorage.setItem('dados_empresa', JSON.stringify(emp));
        aplicarTemaEmpresaRotas(emp);
        if (emp.api_mapas && emp.api_mapas.trim() !== '') ORS_KEY = emp.api_mapas;
    } catch (e) {
        // segue com dados locais se falhar
    }
}

function registrarServiceWorkerRotas() {
    if (!('serviceWorker' in navigator)) return;
    // Força a atualização do SW e limpa caches antigos ao abrir a tela de rotas.
    // Sem isso, qualquer versão antiga do service-worker continua servindo
    // rotas.js/rotas.html do cache e as correções não aparecem.
    navigator.serviceWorker.register('/service-worker.js').then((reg) => {
        try { reg.update(); } catch (_) {}
    }).catch(() => {});
    if (window.caches && caches.keys) {
        caches.keys().then((keys) => {
            keys.forEach((k) => {
                // Remove caches antigos (v1, v2, v3) mantendo apenas a versão corrente.
                if (/motorista-v[123]$/i.test(k)) caches.delete(k).catch(() => {});
            });
        }).catch(() => {});
    }
}

window.onload = async () => {
    registrarServiceWorkerRotas();
    initRotasOpcoesUi();
    try {
        await sincronizarEmpresaAtual();
        document.getElementById('data-entrega').value = getToday();
        document.getElementById('filtro-data-operacao').value = getToday();
        await carregarConfiguracoesDaEmpresa();
        aplicarRegraHorario();
        await carregarDados();

        // Mantém o dropdown de "Vincular a entrega" em sincronia com a data do formulário
        const inputDataEnt = document.getElementById('data-entrega');
        if (inputDataEnt && !inputDataEnt.dataset.syncVincBind) {
            inputDataEnt.dataset.syncVincBind = '1';
            inputDataEnt.addEventListener('change', () => atualizarSelectEntregaVincular());
        }
    } catch (e) { console.error('[rotas] falha no bootstrap', e); }
};

function sairDoSistema() {
    if (!confirm('Deseja deslogar do sistema?')) return;
    localStorage.removeItem('dados_operador');
    localStorage.removeItem('dados_empresa');
    localStorage.removeItem('auth_token');
    window.location.href = '/index.html';
}

async function buscarCepEntrega() {
    let cep = document.getElementById('endereco-cep').value.replace(/\D/g, '');
    if (cep.length === 8) {
        try {
            let res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            let dados = await res.json();
            if (!dados.erro) {
                document.getElementById('endereco-rua').value = dados.logradouro || '';
                document.getElementById('endereco-bairro').value = dados.bairro || '';
                document.getElementById('endereco-cidade').value = dados.localidade || '';
                document.getElementById('endereco-estado').value = dados.uf || '';
                document.getElementById('endereco-num').focus();
            }
        } catch (e) { console.error("Erro ao buscar CEP:", e); }
    }
}

// Atualiza um banner persistente com avisos de capacidade/tempo da rota
// considerando o veículo selecionado e as dimensões reais dos pacotes.
function atualizarBannerAvisosRota(dataFiltro) {
    const banner = document.getElementById('rota-warn-banner');
    if (!banner) return;
    const avisos = [];

    for (const turno of ['manha', 'tarde']) {
        const carga = calcularCargaTurno(dataFiltro, turno);
        if (carga.qtd === 0) continue;

        const cap = capacidadeVeiculoSelecionado();
        if (cap && cap.pesoMax > 0) {
            if (carga.pesoKg > cap.pesoMax) {
                avisos.push(
                    `⚠️ <b>Capacidade (peso)</b> do veículo excedida no turno ` +
                    `<b>${turno === 'manha' ? 'manhã' : 'tarde'}</b>: ` +
                    `${carga.pesoKg.toFixed(1)}kg / ${cap.pesoMax.toFixed(0)}kg.`
                );
            }
            if (carga.volumeM3 > cap.volumeMax) {
                avisos.push(
                    `⚠️ <b>Capacidade (volume)</b> do veículo excedida no turno ` +
                    `<b>${turno === 'manha' ? 'manhã' : 'tarde'}</b>: ` +
                    `${carga.volumeM3.toFixed(3)}m³ / ${cap.volumeMax.toFixed(3)}m³.`
                );
            }
        }

        const tempoMin = tempoEstimadoTotalTurnoMin(dataFiltro, turno);
        const inicioTurno = turno === 'manha'
            ? horaParaDecimal(CORTE_MANHA, 9)
            : horaParaDecimal(CORTE_TARDE, 14);
        const fimTurno = fimDoTurnoDecimal(turno);
        const duracaoMin = Math.max(0, (fimTurno - inicioTurno) * 60);
        if (duracaoMin > 0 && tempoMin > duracaoMin) {
            avisos.push(
                `⏱️ Tempo estimado (${tempoMin}min) ultrapassa a janela do turno ` +
                `<b>${turno === 'manha' ? 'manhã' : 'tarde'}</b> (${Math.round(duracaoMin)}min). ` +
                `Os endereços excedentes serão alocados para a próxima rota.`
            );
        }
    }

    if (avisos.length === 0) {
        banner.classList.remove('show');
        banner.innerHTML = '';
    } else {
        banner.innerHTML = avisos.join('<br>');
        banner.classList.add('show');
    }
}

function atualizarEstadoBotoes(temRotaValida) {
    const btnCriar = document.getElementById('btn-criar-rota');
    const btnRecalc = document.getElementById('btn-recalc-rota');
    const btnLimpar = document.getElementById('btn-limpar-rota');
    if (!btnCriar || !btnRecalc) return;

    if (temRotaValida) {
        // Com rota gerada: oculta "Criar Rota" (só reaparece via "Limpar Rota")
        // e deixa o "Recalcular" ativo para ajustes finos manuais.
        btnCriar.style.display = 'none';
        btnCriar.disabled = true;
        btnRecalc.disabled = false;
        btnRecalc.style.opacity = '1';
        btnRecalc.style.display = '';
        if (btnLimpar) btnLimpar.style.display = '';
    } else {
        // Sem rota válida: "Criar Rota" é o único botão de ação principal.
        btnCriar.style.display = '';
        btnCriar.disabled = false;
        btnCriar.style.opacity = '1';
        btnRecalc.disabled = true;
        btnRecalc.style.opacity = '0.5';
    }
}

// Lê o objeto da empresa logada do localStorage. Usado quando precisamos
// reconstruir a base a partir do cadastro (sem chamar /api/empresas/me).
function obterDadosEmpresaLocal() {
    try {
        const raw = localStorage.getItem('dados_empresa');
        if (!raw) return null;
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : null;
    } catch (_) {
        return null;
    }
}

// Monta um endereço legível a partir do cadastro da empresa (rua/numero/etc).
// Usado para tentar geocodificar a base default quando o backend devolveu
// uma base sem coordenadas ou nenhuma base.
function montarEnderecoEmpresaLocal(emp) {
    if (!emp) return '';
    const partes = [];
    const rua = (emp.rua || '').trim();
    const numero = (emp.numero || '').trim();
    if (rua) partes.push(numero ? `${rua}, ${numero}` : rua);
    const bairro = (emp.bairro || '').trim();
    if (bairro) partes.push(bairro);
    const cidade = (emp.cidade || '').trim();
    const uf = (emp.uf || '').trim();
    const cidadeUf = [cidade, uf].filter(Boolean).join(' - ');
    if (cidadeUf) partes.push(cidadeUf);
    const cep = (emp.cep || '').replace(/\D/g, '');
    if (cep) partes.push(`CEP ${cep}`);
    return partes.join(' - ');
}

// Tenta geocodificar o endereço da empresa logada e usar como base. Se obtiver
// coords, persiste no backend (PUT na base existente, ou POST se não existir)
// para que a próxima sessão já abra resolvida.
async function resolverBasePeloCadastroEmpresa(baseExistente) {
    const emp = obterDadosEmpresaLocal();
    if (!emp) return false;
    const enderecoLocal = montarEnderecoEmpresaLocal(emp);
    if (!enderecoLocal) return false;

    let coords = null;
    try {
        if (typeof geocodificarEntregaMesmaRegraPainel === 'function') {
            const r = await geocodificarEntregaMesmaRegraPainel({
                rua: emp.rua || '',
                numero: emp.numero || '',
                bairro: emp.bairro || '',
                cidade: emp.cidade || '',
                uf: emp.uf || '',
                cep: emp.cep || ''
            });
            if (r && Number.isFinite(r.lat) && Number.isFinite(r.lon)) {
                coords = { lat: r.lat, lng: r.lon };
            }
        }
    } catch (e) {
        console.warn('[rotas] geocodificação da base da empresa falhou', e);
    }

    if (!coords) return false;

    LOJA_COORDS = [coords.lng, coords.lat];
    BASE_EMPRESA_OK = true;
    ENDERECO_BASE_TEXTO = enderecoLocal;
    const relBase = document.getElementById('txt-relatorio-base');
    if (relBase) relBase.innerText = `Saída: ${enderecoLocal.split('-')[0]}`;
    const sideBase = document.getElementById('txt-endereco-base-sidebar');
    if (sideBase) sideBase.innerText = enderecoLocal.split('-')[0];
    focarMapaNaBaseRotas();

    // Persiste no backend para que a próxima carga já venha completa.
    try {
        if (baseExistente && baseExistente.id) {
            await apiFetchJson(`/api/bases/${baseExistente.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: baseExistente.nome || 'Sede',
                    endereco: enderecoLocal,
                    lat: coords.lat,
                    lng: coords.lng,
                    corte_manha: baseExistente.corte_manha || '09:00',
                    corte_tarde: baseExistente.corte_tarde || '14:00'
                })
            });
        } else {
            await apiFetchJson('/api/bases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    empresa_id: empresaId,
                    nome: 'Sede',
                    endereco: enderecoLocal,
                    lat: coords.lat,
                    lng: coords.lng,
                    corte_manha: '09:00',
                    corte_tarde: '14:00'
                })
            });
        }
    } catch (e) {
        console.warn('[rotas] não foi possível salvar a base auto-geocodificada', e);
    }
    return true;
}

// Mostra um aviso visível quando não conseguimos resolver a base. Sem isso,
// o operador continuaria gerando rotas com origem em coordenadas erradas.
function exibirAvisoBaseNaoConfigurada(baseExistente) {
    const emp = obterDadosEmpresaLocal();
    const enderecoSugestao = montarEnderecoEmpresaLocal(emp);
    const partes = [
        '⚠️ Base de partida não configurada para esta empresa.'
    ];
    if (baseExistente && baseExistente.endereco) {
        partes.push(`Endereço cadastrado: ${baseExistente.endereco}.`);
    } else if (enderecoSugestao) {
        partes.push(`Endereço da empresa: ${enderecoSugestao}.`);
    }
    partes.push('Cadastre a base no painel da empresa antes de gerar rotas — caso contrário, o ponto de partida ficará incorreto.');
    const banner = document.getElementById('rota-warn-banner');
    if (banner) {
        banner.style.display = 'block';
        banner.style.background = '#fef3c7';
        banner.style.color = '#92400e';
        banner.style.border = '1px solid #f59e0b';
        banner.style.padding = '8px 12px';
        banner.style.borderRadius = '6px';
        banner.style.margin = '8px 0';
        banner.innerText = partes.join(' ');
    } else {
        mostrarErro(partes.join(' '));
    }
}

async function carregarConfiguracoesDaEmpresa() {
    try {
        const bases = await apiFetchJson(`/api/bases/${empresaId}`);
        const baseAtiva = bases && bases.length > 0 ? bases[0] : null;
        const latNum = baseAtiva ? parseFloat(baseAtiva.lat) : NaN;
        const lngNum = baseAtiva ? parseFloat(baseAtiva.lng) : NaN;
        const baseTemCoords = baseAtiva && Number.isFinite(latNum) && Number.isFinite(lngNum);

        if (baseTemCoords) {
            LOJA_COORDS = [lngNum, latNum];
            BASE_EMPRESA_OK = true;
            ENDERECO_BASE_TEXTO = baseAtiva.endereco || '';
            CORTE_MANHA = baseAtiva.corte_manha || CORTE_MANHA;
            CORTE_TARDE = baseAtiva.corte_tarde || CORTE_TARDE;
            const relBase = document.getElementById('txt-relatorio-base');
            if (relBase && baseAtiva.endereco) relBase.innerText = `Saída: ${baseAtiva.endereco.split('-')[0]}`;
            const sideBase = document.getElementById('txt-endereco-base-sidebar');
            if (sideBase && baseAtiva.endereco) sideBase.innerText = baseAtiva.endereco.split('-')[0];
            const cutM = document.getElementById('lbl-corte-manha');
            const cutT = document.getElementById('lbl-corte-tarde');
            if (cutM) cutM.innerText = CORTE_MANHA;
            if (cutT) cutT.innerText = CORTE_TARDE;
            focarMapaNaBaseRotas();
        } else {
            // Sem base com coordenadas: NÃO podemos cair no LOJA_COORDS default,
            // que aponta para a região de outra empresa. Tentamos resolver pelo
            // endereço da empresa logada (localStorage). Se conseguir geocodar,
            // gravamos a base no backend para a próxima sessão já abrir certa.
            const resolvido = await resolverBasePeloCadastroEmpresa(baseAtiva);
            if (!resolvido) {
                exibirAvisoBaseNaoConfigurada(baseAtiva);
            }
        }

        const regras = await apiFetchJson(`/api/regras/${empresaId}`);
        const selTam = document.getElementById('tamanho'); selTam.innerHTML = ''; TABELA_PRODUTOS = {};
        if(regras.length === 0) { selTam.innerHTML = '<option value="Ate20">Padrão (SLA 10m)</option>'; TABELA_PRODUTOS["Ate20"] = { peso: 10, c:30, l:30, a:30, tempoServico: 600 }; } 
        else { regras.forEach(r => { const key = `cat_${r.id}`; selTam.innerHTML += `<option value="${key}">${r.nome_categoria} (SLA: ${r.tempo_sla}m)</option>`; TABELA_PRODUTOS[key] = { peso: 10, c:30, l:30, a:30, tempoServico: parseInt(r.tempo_sla) * 60 }; }); }

        MOTORISTAS_EQUIPE = await apiFetchJson(`/api/motoristas/${empresaId}`);
        const selM = document.getElementById('select-motorista'); selM.innerHTML = '<option value="">Motorista (Opcional)</option>'; MOTORISTAS_EQUIPE.forEach(m => selM.innerHTML += `<option value="${m.id}">${m.nome}</option>`);

        FROTA_VEICULOS = await apiFetchJson(`/api/veiculos/${empresaId}`);
        const selV = document.getElementById('select-veiculo'); selV.innerHTML = '<option value="">Veículo (Opcional)</option>'; FROTA_VEICULOS.forEach(v => selV.innerHTML += `<option value="${v.id}">${v.modelo} (${v.placa})</option>`);
        // Reavalia avisos de capacidade ao trocar de veículo selecionado.
        if (!selV.dataset.bannerBound) {
            selV.addEventListener('change', () => {
                const filtro = document.getElementById('filtro-data-operacao');
                atualizarBannerAvisosRota(filtro ? filtro.value : getToday());
            });
            selV.dataset.bannerBound = '1';
        }
    } catch(e) {}
}

function abrirCameraBarcode() {
    const reader = document.getElementById('reader');
    if (!reader || typeof Html5QrcodeScanner === 'undefined') return;
    if (reader.style.display === 'block') {
        reader.style.display = 'none';
        if (html5QrcodeScanner) html5QrcodeScanner.clear().catch(() => {});
        return;
    }
    reader.style.display = 'block';
    html5QrcodeScanner = new Html5QrcodeScanner('reader', { fps: 10, qrbox: { width: 250, height: 100 } }, false);
    html5QrcodeScanner.render((txt) => {
        const cb = document.getElementById('codigo-barras');
        if (cb) cb.value = txt;
        mostrarSucesso(`LIDO: ${txt}`);
        html5QrcodeScanner.clear().catch(() => {});
        reader.style.display = 'none';
    }, () => {});
}

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

function xmlPrimeiroPorLocalName(xmlDoc, localName) {
    if (!xmlDoc || !localName) return null;
    const nsList = xmlDoc.getElementsByTagNameNS(NFE_NS, localName);
    if (nsList && nsList.length) return nsList[0];
    const all = xmlDoc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
        if (all[i].localName === localName) return all[i];
    }
    return null;
}

function xmlTextoFilho(pai, localName) {
    if (!pai) return '';
    const ns = pai.getElementsByTagNameNS(NFE_NS, localName);
    if (ns && ns[0]) return String(ns[0].textContent || '').trim();
    for (let c = pai.firstElementChild; c; c = c.nextElementSibling) {
        if (c.localName === localName) return String(c.textContent || '').trim();
    }
    const leg = pai.getElementsByTagName(localName);
    if (leg && leg[0]) return String(leg[0].textContent || '').trim();
    return '';
}

function extrairChaveNFe(xmlDoc) {
    const inf = xmlPrimeiroPorLocalName(xmlDoc, 'infNFe');
    if (!inf) return '';
    const id = (inf.getAttribute('Id') || inf.getAttribute('id') || '').trim();
    if (/^NFe\d{44}$/i.test(id)) return id.slice(3);
    const ch = xmlTextoFilho(inf, 'chNFe') || xmlTextoFilho(inf, 'chave');
    const digits = String(ch).replace(/\D/g, '');
    return digits.length === 44 ? digits : '';
}

function processarXML(event) {
    const input = event && event.target ? event.target : null;
    const file = input && input.files ? input.files[0] : null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const raw = e.target.result;
            const xmlDoc = new DOMParser().parseFromString(raw, 'text/xml');
            const pe = xmlDoc.querySelector('parsererror');
            if (pe) {
                mostrarErro('XML inválido ou arquivo corrompido.');
                return;
            }
            const dest = xmlPrimeiroPorLocalName(xmlDoc, 'dest');
            if (!dest) {
                mostrarErro('NFe sem bloco de destinatário (dest). Verifique se é uma NFe completa (não resumo).');
                return;
            }
            const nome = xmlTextoFilho(dest, 'xNome');
            const ender = xmlPrimeiroPorLocalName(dest, 'enderDest');
            const xLgr = xmlTextoFilho(ender, 'xLgr');
            const nro = xmlTextoFilho(ender, 'nro');
            const xBairro = xmlTextoFilho(ender, 'xBairro');
            const xMun = xmlTextoFilho(ender, 'xMun');
            const uf = xmlTextoFilho(ender, 'UF');
            let cep = xmlTextoFilho(ender, 'CEP').replace(/\D/g, '');
            if (cep.length === 8) cep = `${cep.slice(0, 5)}-${cep.slice(5)}`;

            const elNome = document.getElementById('nome-cliente');
            if (elNome) elNome.value = nome;
            const elRua = document.getElementById('endereco-rua');
            if (elRua) elRua.value = xLgr;
            const elNum = document.getElementById('endereco-num');
            if (elNum) elNum.value = nro;
            const elBai = document.getElementById('endereco-bairro');
            if (elBai) elBai.value = xBairro;
            const elCid = document.getElementById('endereco-cidade');
            if (elCid) elCid.value = xMun;
            const elUf = document.getElementById('endereco-estado');
            if (elUf && uf) elUf.value = uf.length === 2 ? uf.toUpperCase() : elUf.value;
            const elCep = document.getElementById('endereco-cep');
            if (elCep) elCep.value = cep;

            const chave = extrairChaveNFe(xmlDoc);
            const elCb = document.getElementById('codigo-barras');
            if (elCb && chave) elCb.value = chave;

            const okEnd = xLgr && nro && xBairro;
            mostrarSucesso(okEnd ? 'NFe lida: cliente e endereço preenchidos. Confira os dados antes de salvar.' : 'NFe lida: confira endereço (logradouro, nº e bairro) no XML.');
        } catch (err) {
            mostrarErro('Erro ao ler o XML.');
        } finally {
            if (input) input.value = '';
        }
    };
    reader.readAsText(file, 'UTF-8');
}

async function buscarSugestoesRua() { return; }
function iniciarVoz() { alert('Voz indisponível nesta versão.'); }

async function carregarDados(opts = {}) {
    const subtle = !!opts.subtle;
    const fromPoll = !!opts.fromPoll;
    const st = document.getElementById('status-nuvem');
    const usarSyncSuave = fromPoll && rotasPollSubtleLigado() && subtle;
    const statusDiscreto = subtle && (fromPoll ? rotasPollSubtleLigado() : true);
    if (!statusDiscreto) {
        st.classList.remove('rotas-sync-quiet');
        st.innerText = '⏳ Conectando Banco...';
    } else {
        st.classList.add('rotas-sync-quiet');
        st.innerText = '⟳';
    }
    try {
        const data = await apiFetchJson(`/api/coletas/${empresaId}`);
        fornecedoresBase = data.filter((e) => e.status === 'modelo');

        const novaLista = data.filter((e) => e.status !== 'modelo').map((e) => ({
            id: e.id,
            nomeCliente: e.fornecedor,
            endereco: e.endereco,
            dataEntrega: e.data_entrega ? e.data_entrega.substring(0, 10) : getToday(),
            periodo: e.periodo || 'manha',
            ordem: e.ordem,
            status: e.status || 'pendente',
            coords: e.lat && e.lng ? [parseFloat(e.lng), parseFloat(e.lat)] : null,
            tempoViagem: e.tempo_viagem,
            distanciaTrecho: e.distancia_km,
            corIcone: e.cor_icone,
            tamanho: e.tamanho || Object.keys(TABELA_PRODUTOS)[0],
            motorista_nome: e.motorista_nome,
            veiculo_modelo: e.veiculo_modelo,
            veiculo_placa: e.veiculo_placa,
            tempoViagemReal: e.tempo_viagem_real,
            tempoNoLocalReal: e.tempo_no_local_real,
            horaPrevista: e.hora_prevista || null,
            specs: { peso: e.peso || 0, a: e.altura || 0, l: e.largura || 0, c: e.comprimento || 0, tempoServico: e.tempo_medio || 600 },
            // Quando preenchido, indica que este registro é uma COLETA atrelada
            // à entrega cujo id = coletaVinculadaId (pickup → delivery).
            coletaVinculadaId: e.coleta_vinculada_id ? Number(e.coleta_vinculada_id) : null
        }));

        const filtro = document.getElementById('filtro-data-operacao').value;
        const sig = assinaturaSincronizacaoRotas(novaLista, filtro);
        const skipUiRecriarLista = usarSyncSuave && sig === ultimaAssinaturaSincRotas;

        entregas = novaLista;

        const selF = document.getElementById('select-fornecedor');
        selF.innerHTML = '<option value="">Selecione um local de carga...</option>';
        fornecedoresBase.forEach((f) => {
            selF.innerHTML += `<option value="${f.id}">${f.fornecedor}</option>`;
        });

        ultimaAssinaturaSincRotas = sig;
        st.classList.remove('rotas-sync-quiet');
        st.innerText = '📊 Sincronizado OK';

        atualizarSelectEntregaVincular();

        if (skipUiRecriarLista) return;

        renderizarListaSimples({ preservarViewport: usarSyncSuave });
        await tracarRotasNasRuas({ fromPoll: usarSyncSuave });
        return true;
    } catch (err) {
        st.classList.remove('rotas-sync-quiet');
        st.innerText = '⚠️ Erro Conexão';
        return false;
    }
}

async function verificarRotasExpiradas(opts = {}) {
    const silent = !!opts.silent;
    const hoje = getToday();
    const agora = new Date();
    const tempoDecimal = agora.getHours() + (agora.getMinutes() / 60);
    const fimManhaDecimal = fimDoTurnoDecimal('manha');
    const limiteVirada = horaParaDecimal(CORTE_VIRADA_DIA, 18.5);
    let alterou = false;
    let motivoViradaDia = false;

    // Itens em entrega/atendimento NUNCA podem ser movidos pelo poll.
    // Itens com ordem definida (já em rota) também são preservados, exceto
    // quando a rota não foi iniciada e o limite de virada de dia chegou.
    const alvos = entregas.filter((e) =>
        e.status !== 'concluida' &&
        e.status !== 'em_atendimento' &&
        e.status !== 'em_transito'
    );
    for (const e of alvos) {
        let novoDia = null;
        let novoPeriodo = null;
        let resetarOrdem = false;

        if (e.dataEntrega < hoje) {
            // Itens vencidos: vão para hoje (turno ainda em aberto) ou para
            // amanhã se já estamos depois do corte de virada. Reseta ordem
            // porque a coleta saiu do dia em que foi roteada originalmente.
            if (tempoDecimal >= limiteVirada) {
                novoDia = adicionarUmDia(hoje);
                novoPeriodo = 'manha';
            } else {
                novoDia = hoje;
                novoPeriodo = tempoDecimal < fimManhaDecimal ? 'manha' : 'tarde';
            }
            resetarOrdem = true;
        } else if (e.dataEntrega === hoje) {
            // Virada de dia (18:30): apenas itens fora de rota OU em rota não
            // iniciada migram para o dia seguinte. Itens roteados de turnos já
            // iniciados permanecem (motorista já está em campo).
            if (tempoDecimal >= limiteVirada) {
                const foraDaRota = !e.ordem;
                const rotaNaoIniciada = !turnoFoiIniciado(e.dataEntrega, e.periodo);
                if (foraDaRota || rotaNaoIniciada) {
                    novoDia = adicionarUmDia(hoje);
                    novoPeriodo = 'manha';
                    resetarOrdem = true;
                    motivoViradaDia = true;
                }
            }
            // Migração manhã→tarde: somente para itens AINDA NÃO ROTEADOS.
            // Quando o usuário (ou o ORS) já fixou o item em uma rota da manhã,
            // a decisão é respeitada — caso contrário o poll destruiria rotas
            // recém-criadas após as 12h, exatamente o sintoma reportado.
            else if (!e.ordem && e.periodo === 'manha' && tempoDecimal >= fimManhaDecimal) {
                novoPeriodo = 'tarde';
            }
        }

        if (!novoDia && !novoPeriodo) continue;

        const payload = {};
        if (novoDia) payload.dataEntrega = novoDia;
        if (novoPeriodo) payload.periodo = novoPeriodo;
        payload.status = 'pendente';

        try {
            await apiFetchJson(`/api/coletas/${e.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            // Só limpa ordem/tempo/cor quando o item realmente sai do dia/turno
            // em que estava roteado. Mudança "in place" (apenas dia, ou apenas
            // turno mantendo ordem) preserva o roteamento atual.
            if (resetarOrdem) {
                await atualizarRoteamentoColeta(e.id, {
                    ordem: null,
                    tempo_viagem: null,
                    distancia_km: null,
                    cor_icone: null,
                    status: 'pendente'
                });
            }
            alterou = true;
        } catch (err) {
            console.warn('Falha ao reciclar coleta', e.id, err);
        }
    }

    if (alterou) {
        await carregarDados();
        if (!silent) {
            if (motivoViradaDia) {
                mostrarErro(`🌙 Virada de dia (${CORTE_VIRADA_DIA}): pedidos fora de rota ou em rotas não iniciadas foram movidos para o próximo dia.`);
            } else {
                mostrarErro('⚠️ Reciclagem automática aplicada: pendências foram movidas para próximo turno/dia.');
            }
        }
    }
}

async function atualizarRoteamentoColeta(id, dados) {
    return apiFetchJson(`/api/coletas/${id}/roteamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });
}

function montarPayloadRoteamento(entrega) {
    const payload = {
        id: entrega.id,
        ordem: entrega.ordem ?? null,
        tempo_viagem: entrega.tempoViagem ?? null,
        distancia_km: entrega.distanciaTrecho == null ? null : Number(entrega.distanciaTrecho),
        cor_icone: entrega.corIcone ?? null,
        status: entrega.status ?? 'pendente',
        periodo: entrega.periodo ?? null,
        hora_prevista: entrega.horaPrevista || null
    };
    // dataEntrega opcional: só enviamos quando o fluxo de "estouro de turno"
    // precisa migrar o pacote pro próximo dia. Fora isso, o backend não altera.
    if (entrega.__migrarData) payload.data_entrega = entrega.__migrarData;
    return payload;
}

// Soma `segundos` ao horário base "HH:MM" e devolve "HH:MM" (wrap em 24h
// raramente ocorre aqui, mas tratamos defensivamente).
function somarSegundosHHMM(baseHHMM, segundos) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(baseHHMM || '').trim());
    const hBase = m ? parseInt(m[1], 10) : 9;
    const mBase = m ? parseInt(m[2], 10) : 0;
    const totalMin = hBase * 60 + mBase + Math.round((Number(segundos) || 0) / 60);
    const h = Math.floor(totalMin / 60) % 24;
    const mm = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Recalcula a hora_prevista (ETA) de cada parada de um turno acumulando
// (tempoViagem + tempoServico) ponto-a-ponto desde o início do turno.
// Usado após reordenações manuais (subir/descer), injeção de coletas
// vinculadas ou forçar coletas no turno mais leve — assim o ETA no card
// sempre bate com a ordem atual. Retorna a lista de entregas que foi
// alterada, pra facilitar persistir só o delta.
function recalcularEtaTurno(dataFiltro, turno) {
    const baseHHMM = turno === 'manha' ? CORTE_MANHA : CORTE_TARDE;
    const pacotes = entregas
        .filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem && e.status !== 'concluida')
        .sort((a, b) => a.ordem - b.ordem);
    const alterados = [];
    // Acumulador em segundos desde o início do turno.
    let acumSeg = 0;
    pacotes.forEach((p) => {
        // Tempo de viagem (minutos) pra chegar NESTE ponto. Na 1ª parada,
        // se não tiver registro, usa 0 (sai da base e a primeira parada é "já").
        acumSeg += (Number(p.tempoViagem) || 0) * 60;
        const novoEta = somarSegundosHHMM(baseHHMM, acumSeg);
        if (p.horaPrevista !== novoEta) {
            p.horaPrevista = novoEta;
            alterados.push(p);
        }
        // Tempo de serviço no ponto (em segundos).
        acumSeg += Number(p.specs?.tempoServico) || 600;
    });
    return alterados;
}

// Soma N dias ao YYYY-MM-DD informado (ignora fuso do browser somando em UTC).
function somarDiasIso(dataIso, dias) {
    if (!dataIso) return null;
    const [y, m, d] = String(dataIso).slice(0, 10).split('-').map(Number);
    const base = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    base.setUTCDate(base.getUTCDate() + Number(dias || 0));
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
}

async function atualizarRoteamentoLote(entregasAlvo) {
    return apiFetchJson('/api/coletas/roteamento/lote', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entregas: entregasAlvo.map(montarPayloadRoteamento) })
    });
}

async function addFornecedorFila() {
    const idForn = document.getElementById('select-fornecedor').value;
    if (!idForn) return mostrarErro('Selecione um fornecedor na lista.');
    const motId = document.getElementById('select-motorista').value;
    const veiId = document.getElementById('select-veiculo').value;
    const f = fornecedoresBase.find((x) => String(x.id) === String(idForn));
    if (!f) return mostrarErro('Fornecedor selecionado não foi encontrado no cadastro. Recarregue a página.');
    const dataEnt = document.getElementById('data-entrega').value;
    let per = document.getElementById('periodo').value;
    if (!dataEnt) return mostrarErro('Informe a data de entrega antes de inserir a coleta.');
    if (passouLimiteInsercaoHoje(dataEnt)) {
        return mostrarErro(`⚠️ Após ${CORTE_INSERCAO_ROTA} não é permitido inserir novos endereços na rota do dia. Selecione uma data futura.`);
    }

    // Resolve o vínculo (opcional). Quando há entrega-alvo, a coleta herda o
    // período dela — caso contrário o pickup poderia cair em turno diferente.
    const selVinc = document.getElementById('select-entrega-vincular');
    const idVinculoRaw = selVinc ? selVinc.value : '';
    let coletaVinculadaId = null;
    let entregaAlvo = null;
    if (idVinculoRaw) {
        entregaAlvo = entregas.find((x) => String(x.id) === String(idVinculoRaw));
        if (!entregaAlvo) return mostrarErro('Entrega selecionada para vínculo não existe mais. Recarregue a lista.');
        if (ehColeta(entregaAlvo)) return mostrarErro('Não é possível vincular uma coleta a outra coleta.');
        if (entregaAlvo.dataEntrega !== dataEnt) {
            return mostrarErro(`A entrega vinculada (#${entregaAlvo.id}) está agendada para ${formatarData(entregaAlvo.dataEntrega)}. Ajuste a data da coleta para coincidir.`);
        }
        coletaVinculadaId = Number(entregaAlvo.id);
        per = entregaAlvo.periodo || per;
    }

    const payload = {
        empresa_id: empresaId,
        fornecedor: '🏢 COLETA: ' + f.fornecedor,
        endereco: f.endereco,
        lat: f.lat,
        lng: f.lng,
        peso: 0, altura: 0, largura: 0, comprimento: 0,
        tempo_medio: 3000,
        dataEntrega: dataEnt,
        periodo: per,
        tamanho: 'Coleta',
        status: 'pendente',
        motorista_id: motId || null,
        veiculo_id: veiId || null,
        coleta_vinculada_id: coletaVinculadaId
    };

    try {
        const resp = await apiFetch('/api/coletas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let corpo = null;
        try { corpo = await resp.clone().json(); } catch (_) { corpo = null; }

        if (!resp.ok) {
            const motivo = (corpo && (corpo.erro || corpo.error || corpo.message)) || `HTTP ${resp.status}`;
            console.error('[rotas] POST /api/coletas falhou', { status: resp.status, corpo, payload });
            return mostrarErro(`Não foi possível salvar a coleta: ${motivo}`);
        }

        mostrarSucesso(coletaVinculadaId
            ? `Coleta lançada e VINCULADA à entrega #${coletaVinculadaId} (pickup antes da delivery).`
            : 'Instrução de Carga lançada na Fila!');
        document.getElementById('filtro-data-operacao').value = dataEnt;
        if (selVinc) selVinc.value = '';
        await carregarDados();
        // Sempre reavalia adjacência: injeta a coleta logo antes da entrega
        // quando a entrega já estava roteada; caso contrário é um no-op.
        if (coletaVinculadaId) {
            await garantirAdjacenciaVinculosNoDia(dataEnt);
            renderizarListaSimples({ preservarViewport: true });
        }
    } catch (e) {
        console.error('[rotas] exceção em addFornecedorFila', e);
        mostrarErro(`Erro ao salvar coleta: ${e && e.message ? e.message : 'falha de rede.'}`);
    }
}

async function salvarPacote() {
    const btn = document.getElementById('btn-salvar');
    const nomeCliente = document.getElementById('nome-cliente').value.trim(), cepRaw = document.getElementById('endereco-cep').value.trim(), rua = document.getElementById('endereco-rua').value.trim(), num = document.getElementById('endereco-num').value.trim(), bairro = document.getElementById('endereco-bairro').value.trim(), cidade = document.getElementById('endereco-cidade').value.trim(), estado = document.getElementById('endereco-estado').value, dataEnt = document.getElementById('data-entrega').value, per = document.getElementById('periodo').value, tam = document.getElementById('tamanho').value; 
    esconderMensagens(); if(!rua || !num || !bairro || !dataEnt) return mostrarErro("⚠️ Preencha Rua, Número, Bairro e Data.");
    // Bloqueia inclusão de novos endereços na rota do dia após o corte de inserção (17:50).
    // Somente entregas cuja data seja o dia corrente são travadas; datas futuras seguem normalmente.
    if (idEditando === null && passouLimiteInsercaoHoje(dataEnt)) {
        return mostrarErro(`⚠️ Após ${CORTE_INSERCAO_ROTA} não é permitido inserir novos endereços na rota do dia. Altere a data para o próximo dia.`);
    }
    const cepDigits = cepRaw.replace(/\D/g, '');
    const calcCep = cepDigits ? `, CEP: ${cepDigits}` : '';
    let enderecoCompleto = `${rua}, ${num} - ${bairro}, ${cidade} - ${estado}${calcCep}`;

    let lat; let lon;
    btn.innerText = "⏳ Buscando GPS..."; btn.disabled = true;
    try {
        const melhor = await geocodificarEntregaMesmaRegraPainel({
            rua,
            numero: num,
            bairro,
            cidade,
            uf: estado,
            cep: cepRaw
        });
        if (melhor) {
            lon = melhor.lon;
            lat = melhor.lat;
        } else {
            btn.innerHTML = "➕ Adicionar à Fila";
            btn.style.background = "var(--accent)";
            btn.disabled = false;
            return mostrarErro("GPS não localizou o endereço. Verifique rua, número, bairro e cidade.");
        }
    } catch (e) {
        btn.innerHTML = "➕ Adicionar à Fila";
        btn.style.background = "var(--accent)";
        btn.disabled = false;
        return mostrarErro("Erro ao consultar o mapa. Tente novamente em instantes.");
    }

    const specs = TABELA_PRODUTOS[tam] || { peso: 10, a: 30, l: 30, c: 30, tempoServico: 600 };
    try {
        const codigoBarras = (document.getElementById('codigo-barras') && document.getElementById('codigo-barras').value.trim()) || null;
        const payload = { empresa_id: empresaId, fornecedor: nomeCliente, endereco: enderecoCompleto, lat, lng: lon, peso: specs.peso, altura: specs.a, largura: specs.l, comprimento: specs.c, tempo_medio: specs.tempoServico, dataEntrega: dataEnt, periodo: per, tamanho: tam, status: 'pendente', codigo_barras: codigoBarras };
        btn.innerText = "⏳ Salvando BD...";
        
        let url = '/api/coletas'; let method = 'POST';
        if (idEditando !== null) {
            await apiFetchJson(`${url}/${idEditando}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fornecedor: payload.fornecedor,
                    endereco: payload.endereco,
                    lat: payload.lat,
                    lng: payload.lng,
                    dataEntrega: payload.dataEntrega,
                    periodo: payload.periodo,
                    tamanho: payload.tamanho,
                    peso: payload.peso,
                    altura: payload.altura,
                    largura: payload.largura,
                    comprimento: payload.comprimento,
                    tempo_medio: payload.tempo_medio,
                    codigo_barras: document.getElementById('codigo-barras')?.value || null
                })
            });
            await atualizarRoteamentoColeta(idEditando, { ordem: null });
            idEditando = null;
        } else {
            // IMPORTANTE: usar apiFetch direto sem tratar resp.ok mascarava
            // erros de backend (400/500) e o usuário via "salvo com sucesso"
            // mesmo quando o registro não entrava no BD. Agora validamos o
            // status e devolvemos o motivo retornado pelo servidor.
            const resp = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            let corpo = null;
            try { corpo = await resp.clone().json(); } catch (_) { corpo = null; }
            if (!resp.ok) {
                const motivo = (corpo && (corpo.erro || corpo.error || corpo.message)) || `HTTP ${resp.status}`;
                console.error('[rotas] POST /api/coletas (entrega) falhou', { status: resp.status, corpo, payload });
                btn.innerHTML = "➕ Adicionar à Fila";
                btn.style.background = "var(--accent)";
                btn.disabled = false;
                return mostrarErro(`Não foi possível salvar a entrega: ${motivo}`);
            }
        }

        mostrarSucesso("Pacote salvo com sucesso!"); limparFormulario();
        document.getElementById('filtro-data-operacao').value = dataEnt; await carregarDados();
    } catch (err) {
        console.error('[rotas] exceção em salvarPacote', err);
        mostrarErro(`Falha ao salvar: ${err && err.message ? err.message : 'erro de rede.'}`);
    }
    finally { btn.innerHTML = "➕ Adicionar à Fila"; btn.style.background = "var(--accent)"; btn.disabled = false; }
}

function editarEntrega(id) {
    const p = entregas.find(x => x.id == id); if(!p) return;
    document.getElementById('nome-cliente').value = p.nomeCliente || '';
    const parsed = typeof parseEnderecoSalvoPainel === 'function' ? parseEnderecoSalvoPainel(p.endereco || '') : null;
    if (parsed && (parsed.rua || parsed.numero)) {
        document.getElementById('endereco-cep').value = parsed.cep && parsed.cep.length === 8 ? `${parsed.cep.slice(0, 5)}-${parsed.cep.slice(5)}` : (parsed.cep || '');
        document.getElementById('endereco-rua').value = parsed.rua || '';
        document.getElementById('endereco-num').value = parsed.numero || '';
        document.getElementById('endereco-bairro').value = parsed.bairro || '';
        document.getElementById('endereco-cidade').value = parsed.cidade || '';
        if (parsed.uf) document.getElementById('endereco-estado').value = parsed.uf;
    } else {
        document.getElementById('endereco-cep').value = '';
        try {
            const partes = p.endereco.split('-');
            document.getElementById('endereco-rua').value = partes[0].split(',')[0].trim();
            document.getElementById('endereco-num').value = partes[0].split(',')[1].trim();
            document.getElementById('endereco-bairro').value = partes[1].split(',')[0].trim();
        } catch (e) {
            document.getElementById('endereco-rua').value = p.endereco;
        }
    }
    document.getElementById('data-entrega').value = p.dataEntrega; document.getElementById('periodo').value = p.periodo; 
    let selectTam = document.getElementById('tamanho'); if (selectTam.querySelector(`option[value="${p.tamanho}"]`)) selectTam.value = p.tamanho;
    idEditando = id; document.getElementById('btn-salvar').innerHTML = "💾 Salvar Alteração"; document.getElementById('btn-salvar').style.background = "#059669";
}

function limparFormulario() { document.getElementById('endereco-cep').value = ""; document.getElementById('nome-cliente').value = ""; document.getElementById('endereco-rua').value = ""; document.getElementById('endereco-num').value = ""; document.getElementById('endereco-bairro').value = ""; }

async function removerEntrega(id) { if(confirm("Deseja excluir esta entrega?")) { try { await apiFetch(`/api/coletas/${id}`, { method: 'DELETE' }); await carregarDados(); mostrarSucesso("Excluída."); } catch(e){} } }
async function limparTodasEntregas() { if(confirm("⚠️ ATENÇÃO: Apagar TODAS as entregas do BD? Ação irreversível.")) { for(let e of entregas) { await apiFetch(`/api/coletas/${e.id}`, { method: 'DELETE' }); } await carregarDados(); mostrarSucesso("Tudo apagado."); } }

function reorganizarSequencia(data, periodo) { let pacotes = entregas.filter(e => e.dataEntrega === data && e.periodo === periodo && e.ordem && e.status !== 'concluida'); pacotes.sort((a, b) => a.ordem - b.ordem); pacotes.forEach((p, index) => { p.ordem = index + 1; }); }

async function retirarDeRota(id) {
    const p = entregas.find(e => e.id === id);
    if (!p || p.status === 'concluida') return;
    try {
        await atualizarRoteamentoColeta(id, {
            ordem: null,
            tempo_viagem: null,
            distancia_km: null,
            cor_icone: null,
            status: 'pendente'
        });
        await carregarDados();
    } catch (e) {
        mostrarErro("Falha ao retirar da rota.");
    }
}
async function alterarTurno(id, novoTurno) {
    const p = entregas.find(e => e.id === id);
    if (!p || p.status === 'concluida') return;
    try {
        await apiFetchJson(`/api/coletas/${id}/turno`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periodo: novoTurno })
        });
        await apiFetchJson(`/api/coletas/${id}/ordem`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ordem: null })
        });
        await carregarDados();
        mostrarSucesso(`Movido para ${novoTurno}`);
    } catch (e) {
        mostrarErro("Falha ao alterar turno.");
    }
}
async function limparRotasDoDia() {
    const dataFiltro = document.getElementById('filtro-data-operacao').value;
    if (!confirm(`Remover as rotas organizadas de ${formatarData(dataFiltro)}?`)) return;
    const alvos = entregas.filter(e => e.dataEntrega === dataFiltro && e.status !== 'concluida' && e.ordem);
    try {
        await Promise.all(alvos.map((e) => atualizarRoteamentoColeta(e.id, {
            ordem: null,
            tempo_viagem: null,
            distancia_km: null,
            cor_icone: null
        })));
        await carregarDados();
        mostrarSucesso("Rotas limpas.");
    } catch (e) {
        mostrarErro("Falha ao limpar rotas do dia.");
    }
}
async function marcarConcluida(id) {
    try {
        await apiFetchJson(`/api/coletas/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'concluir' })
        });
        await carregarDados();
    } catch (e) {
        mostrarErro("Falha ao concluir entrega.");
    }
}
async function desfazerConcluida(id) {
    try {
        await apiFetchJson(`/api/coletas/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao: 'reabrir' })
        });
        await carregarDados();
    } catch (e) {
        mostrarErro("Falha ao reabrir entrega.");
    }
}
async function moverOrdem(id, direcao) {
    const p = entregas.find((e) => e.id === id);
    if (!p || !p.ordem) return;
    const pacotesTurno = entregas
        .filter((e) => e.dataEntrega === p.dataEntrega && e.periodo === p.periodo && e.ordem && e.status !== 'concluida')
        .sort((a, b) => a.ordem - b.ordem);
    const iAtual = pacotesTurno.findIndex((e) => e.id === id);
    if (iAtual === -1) return;
    const iAlvo = iAtual + direcao;
    if (iAlvo < 0 || iAlvo >= pacotesTurno.length) return;

    const pAlvo = pacotesTurno[iAlvo];
    const snap = snapOrdemTurno(p.dataEntrega, p.periodo);

    // Captura custo anterior (em linha reta) para avaliar distanciamento pós-troca.
    const custoAntes = custoHaversinePercurso(pacotesTurno);
    const simulada = pacotesTurno.slice();
    simulada[iAtual] = pAlvo;
    simulada[iAlvo] = p;
    const custoDepois = custoHaversinePercurso(simulada);
    const delta = custoDepois - custoAntes;
    const deltaPct = custoAntes > 0 ? delta / custoAntes : 0;
    const houveDistanciamento = delta >= ROTA_AVISO_AUMENTO_KM || deltaPct >= ROTA_AVISO_AUMENTO_PCT;

    try {
        await trocarOrdemDoisPacotesApi(p, pAlvo);
        ultimaAssinaturaLinhasRota = '';
        invalidarCachesyncRotas();
        await carregarDados({ subtle: true });

        if (houveDistanciamento) {
            // Permite forçar a ordem não otimizada, mas emite aviso e tenta
            // reorganizar os pontos próximos mantendo o item ancorado.
            mostrarErro(
                `⚠️ A alteração aumentou a distância total da rota em ` +
                `${delta.toFixed(1)} km (${(deltaPct * 100).toFixed(0)}%). ` +
                `Reorganizando pontos próximos para manter eficiência...`
            );
            await reordenacaoInteligenteAncorada(id, p.dataEntrega, p.periodo);
        }

        // Mantém coleta sempre imediatamente antes da sua entrega vinculada.
        await garantirAdjacenciaVinculosNoDia(p.dataEntrega);
        await recalcularTurnoAposMudancaManual(p.dataEntrega, p.periodo);
        avaliarAvisosCapacidade(p.dataEntrega, p.periodo);
        if (!houveDistanciamento) {
            mostrarSucesso('Rota reajustada com base na nova ordem manual.');
        }
    } catch (e) {
        try {
            await restaurarSnapOrdem(snap);
            ultimaAssinaturaLinhasRota = '';
            await carregarDados({ subtle: true });
        } catch (e2) {
            console.warn(e2);
        }
        mostrarErro('Falha ao mover ordem. Ordem anterior foi restaurada quando possível.');
    }
}

async function forcarNaRota(id, turno) {
    const p = entregas.find(e => e.id == id);
    if (!p) return;
    if (passouLimiteInsercaoHoje(p.dataEntrega)) {
        return mostrarErro(`⚠️ Após ${CORTE_INSERCAO_ROTA} não é permitido inserir novos endereços na rota do dia.`);
    }
    const pacotesOrdem = entregas.filter(x => x.dataEntrega === p.dataEntrega && x.status !== 'concluida' && x.periodo === turno && x.ordem);
    const ordem = pacotesOrdem.length + 1;
    const cor = turno === 'manha' ? '#16a34a' : '#2563eb';
    try {
        await atualizarRoteamentoColeta(id, { periodo: turno, ordem, cor_icone: cor });
        await carregarDados();
        await garantirAdjacenciaVinculosNoDia(p.dataEntrega);
        await recalcularTurnoAposMudancaManual(p.dataEntrega, turno);
        avaliarAvisosCapacidade(p.dataEntrega, turno);
        mostrarSucesso("Enviado para o fim da fila do turno e rota reajustada.");
    } catch (e) {
        mostrarErro("Falha ao forçar entrada na rota.");
    }
}

function renderizarListaSimples(opts = {}) {
    const preservarViewport = !!opts.preservarViewport;
    const container = document.getElementById('cards-container');
    container.innerHTML = '';
    const dataFiltro = document.getElementById('filtro-data-operacao').value;
    let pacotes = entregas.filter((e) => e.dataEntrega === dataFiltro);
    
    const temRotaHoje = pacotes.some(p => p.ordem > 0 && p.status !== 'concluida');
    atualizarEstadoBotoes(temRotaHoje);
    atualizarBannerAvisosRota(dataFiltro);

    pacotes.sort((a, b) => { let pA = a.periodo === 'manha'?1:2; let pB = b.periodo === 'manha'?1:2; let oA = a.ordem||9999; let oB = b.ordem||9999; if (oA === 9999 && oB !== 9999) return 1; if (oA !== 9999 && oB === 9999) return -1; if (pA !== pB) return pA - pB; if (oA !== oB) return oA - oB; return 0; });
    layersPinos.forEach(layer => { if(map) map.removeLayer(layer); }); layersPinos = [];
    
    if (pacotes.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px;">Nenhum agendamento para hoje.</div>`;
        if (!preservarViewport) focarMapaNaBaseRotas();
        return;
    }

    const bounds = new L.LatLngBounds();
    pacotes.forEach(e => {
        const isConcluida = e.status === 'concluida'; const isColeta = e.tamanho === 'Coleta';
        let corBorda = e.corIcone || '#64748b'; if (isConcluida) corBorda = '#16a34a'; if (isColeta && !isConcluida) corBorda = '#0284c7';
        
        let pinClass = isColeta ? 'custom-pin coleta-pin' : 'custom-pin'; 

        // PLOTA TANTO ENTREGAS QUANTO COLETAS NO MAPA
        if(!isConcluida && e.coords && e.coords.length >= 2 && !isNaN(e.coords[0]) && !isNaN(e.coords[1])) {
            const marker = L.marker([e.coords[1], e.coords[0]], { icon: L.divIcon({ className: pinClass, html: `<div style="background:${corBorda};">${e.ordem ? e.ordem : '📍'}</div>`, iconSize:[26,26] }) }).addTo(map);
            marker.bindPopup(`<b>${e.ordem ? e.ordem + 'º Parada' : 'Agendado'}</b><br>${e.nomeCliente}<br>${e.endereco}`); layersPinos.push(marker); bounds.extend([e.coords[1], e.coords[0]]);
        }

        let botoes = isConcluida ? `<button class="btn-small" onclick="desfazerConcluida(${e.id})">↩️ Desfazer</button>` : `<button class="btn-small" style="color:#16a34a;" onclick="marcarConcluida(${e.id})">✔️ Concluir</button>${isColeta?'':`<button class="btn-small" onclick="editarEntrega(${e.id})">✏️ Editar</button>`}<button class="btn-small delete" style="color:red;" onclick="removerEntrega(${e.id})">🗑️ Excluir</button>`;
        
        if (!isConcluida) {
            if(!e.ordem) { botoes += `<br><button class="btn-small" style="color:#16a34a; font-weight:800; margin-top:5px; margin-right:8px;" onclick="forcarNaRota(${e.id}, 'manha')">⚠️ Forçar (Manhã)</button><button class="btn-small" style="color:#2563eb; font-weight:800; margin-top:5px;" onclick="forcarNaRota(${e.id}, 'tarde')">⚠️ Forçar (Tarde)</button>`; } 
            else { botoes += `<br><button class="btn-small" style="color:#8b5cf6; font-weight:800; margin-top:5px;" onclick="alterarTurno(${e.id}, '${e.periodo === 'manha' ? 'tarde' : 'manha'}')">🔄 Mover Turno</button><button class="btn-small" style="color:#ea580c; font-weight:800; margin-top:5px; margin-left: 8px;" onclick="retirarDeRota(${e.id})">❌ Remover Rota</button><div style="width:100%; display:flex; gap:5px; margin-top:8px;"><button class="btn-small" style="flex:1; border: 1px solid #cbd5e1; background:#f8fafc; color:#0284c7; padding:5px; border-radius:4px;" onclick="moverOrdem(${e.id}, -1)">⬆️ Subir</button><button class="btn-small" style="flex:1; border: 1px solid #cbd5e1; background:#f8fafc; color:#0284c7; padding:5px; border-radius:4px;" onclick="moverOrdem(${e.id}, 1)">⬇️ Descer</button></div>`; }
        }

        let atribTxt = "";
        if (isColeta) {
            if(e.motorista_nome) atribTxt += `👤 ${e.motorista_nome} &nbsp;`; if(e.veiculo_modelo) atribTxt += `🚛 ${e.veiculo_modelo} (${e.veiculo_placa||''})`;
            if(atribTxt !== "") atribTxt = `<div style="font-size:11px; color:#0284c7; font-weight:bold; margin-top:3px;">${atribTxt}</div>`;
        }
        let nomeTamanhoLabel = "Padrão"; const optTam = document.querySelector(`#tamanho option[value="${e.tamanho}"]`); if(optTam) nomeTamanhoLabel = optTam.innerText.split('(')[0];

        // Badge de vínculo pickup→delivery: mostra em ambos os lados
        // da relação, indicando claramente a ligação.
        let vinculoTxt = '';
        if (ehColeta(e) && e.coletaVinculadaId != null) {
            const alvo = entregas.find((x) => x.id === e.coletaVinculadaId);
            const rot = alvo ? `#${alvo.id} · ${(alvo.nomeCliente || '').slice(0, 24)}` : `#${e.coletaVinculadaId}`;
            vinculoTxt = `<div style="margin-top:4px;padding:4px 6px;border-radius:4px;background:#ecfeff;color:#0e7490;font-size:10px;font-weight:700;border:1px dashed #67e8f9;">🔗 Pickup vinculado à entrega ${rot} <span style="font-weight:500;">· sempre 1 parada antes</span></div>`;
        } else if (!ehColeta(e)) {
            const pickup = entregas.find((x) => ehColeta(x) && x.coletaVinculadaId === e.id);
            if (pickup) {
                vinculoTxt = `<div style="margin-top:4px;padding:4px 6px;border-radius:4px;background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;border:1px dashed #fcd34d;">📦 Coleta vinculada #${pickup.id} ${pickup.ordem ? `(${pickup.ordem}º parada)` : '(pendente)'} antecede esta entrega</div>`;
            }
        }

        // Badge com hora prevista de chegada (ETA). Só aparece quando o
        // ponto já foi roteado e tem ETA persistido.
        const etaTxt = (e.horaPrevista && e.ordem && !isConcluida)
            ? `<span style="margin-left:8px; font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd;">🕐 ETA ${e.horaPrevista}</span>`
            : '';

        container.innerHTML += `<div class="card ${isConcluida ? 'concluida' : ''}" style="border-left-color: ${corBorda}; ${isColeta ? 'background:#f0f9ff;' : ''}">
            ${(e.ordem && !isConcluida) ? `<div class="badge-ordem" style="background: ${e.corIcone}">${e.ordem}º</div>` : ''}
            <strong style="font-size: 13px;">${e.nomeCliente}</strong><br><span style="font-size: 11px; color:#64748b;">${e.endereco}</span>${atribTxt}
            <div style="margin-top:4px;"><span style="font-size: 11px; color: ${corBorda}; font-weight: bold;">📅 ${formatarData(e.dataEntrega)} | Turno: ${e.periodo==='manha'?'Manhã':'Tarde'} ${isColeta?'| [INSTRUÇÃO DE COLETA]':''}</span>${etaTxt}</div>
            ${vinculoTxt}
            <table class="specs-table">
                <tr><td>📦 Cat: <b>${nomeTamanhoLabel}</b></td><td>⚖️ Peso: <b>${e.specs?.peso || 0} kg</b></td></tr>
                <tr><td colspan="2">📏 Dims (cm): <b>Alt: ${e.specs?.a || 0} | Larg: ${e.specs?.l || 0} | Comp: ${e.specs?.c || 0}</b></td></tr>
            </table>
            <div class="card-actions">${botoes}</div></div>`;
    });
    if (layersPinos.length > 0 && map) {
        bounds.extend([LOJA_COORDS[1], LOJA_COORDS[0]]);
        if (!preservarViewport) map.fitBounds(bounds, { padding: [30, 30] });
    } else if (!preservarViewport) {
        focarMapaNaBaseRotas();
    }
}

async function otimizarRotaEValidarTempo() {
    const dataFiltro = document.getElementById('filtro-data-operacao').value;
    const btnRota = document.querySelector('.btn-route');
    const tituloBtnOk = '📍 1. Criar Rota';

    // Sem base válida da própria empresa, qualquer rota gerada partiria do
    // LOJA_COORDS default (região de outro cliente). Bloqueia explicitamente.
    if (!BASE_EMPRESA_OK) {
        exibirAvisoBaseNaoConfigurada(null);
        return mostrarErro('Configure a base de partida desta empresa antes de gerar rotas.');
    }

    const entregasAlvo = entregas.filter((e) => e.dataEntrega === dataFiltro && e.status !== 'concluida');
    if (entregasAlvo.length === 0) return mostrarErro(`Não há entregas/coletas PENDENTES para traçar no mapa.`);

    entregasAlvo.forEach((e) => {
        delete e.ordem;
        delete e.tempoViagem;
        delete e.corIcone;
    });

    // Coletas VINCULADAS são retiradas da otimização: elas são inseridas
    // manualmente logo antes da entrega-alvo (pickup→delivery) depois que
    // o ORS planeja as rotas. Isso evita que o ORS separe a dupla em
    // veículos diferentes ou marque a coleta como "unassigned".
    const alvosParaOrs = entregasAlvo.filter((e) => !(ehColeta(e) && e.coletaVinculadaId != null));

    const idMap = new Map();
    const jobs = [];

    alvosParaOrs.forEach((e, index) => {
        if (e.coords && !isNaN(e.coords[0]) && !isNaN(e.coords[1])) {
            const safeId = index + 1;
            idMap.set(safeId, e.id);
            jobs.push({
                id: safeId,
                location: [parseFloat(e.coords[0]), parseFloat(e.coords[1])],
                service: parseInt(e.specs?.tempoServico || 600),
                delivery: [Math.min(500, Math.ceil(parseFloat(e.specs?.peso || 0)))]
            });
        }
    });

    if (jobs.length === 0) return mostrarErro('Nenhuma entrega válida com GPS.');

    // Janelas de tempo (em segundos a partir da "hora 0" do otimizador) por turno.
    // ORS reserva jobs que não couberem no time_window como unassigned, o que
    // já é tratado mais abaixo (migração automática para a próxima rota).
    const duracaoTurnoManhaSec = Math.max(0, (fimDoTurnoDecimal('manha') - horaParaDecimal(CORTE_MANHA, 9)) * 3600);
    const duracaoTurnoTardeSec = Math.max(0, (fimDoTurnoDecimal('tarde') - horaParaDecimal(CORTE_TARDE, 14)) * 3600);

    // IMPORTANTE: CADA veículo físico gera DOIS slots no ORS — 1 para a
    // manhã e 1 para a tarde do mesmo dia. Modelar só "veículo 1 = manhã /
    // veículo 2 = tarde" fazia com que uma frota com 1 caminhão só rodasse
    // manhã e jogasse a sobra pro dia seguinte (bug reportado). Com dois
    // slots por veículo, o ORS só empurra pra próxima data quando realmente
    // esgotou manhã E tarde do dia atual.
    const vehicles = [];
    const slotTurno = new Map();
    const capsFrota = FROTA_VEICULOS.length > 0
        ? FROTA_VEICULOS.map((v) => Math.ceil(parseFloat(v.capacidade_peso || 500)))
        : [500];
    capsFrota.forEach((cap) => {
        const idManha = vehicles.length + 1;
        vehicles.push({
            id: idManha,
            profile: 'driving-car',
            start: [parseFloat(LOJA_COORDS[0]), parseFloat(LOJA_COORDS[1])],
            capacity: [cap],
            time_window: [0, Math.max(3600, Math.round(duracaoTurnoManhaSec))]
        });
        slotTurno.set(idManha, 'manha');
        const idTarde = vehicles.length + 1;
        vehicles.push({
            id: idTarde,
            profile: 'driving-car',
            start: [parseFloat(LOJA_COORDS[0]), parseFloat(LOJA_COORDS[1])],
            capacity: [cap],
            time_window: [0, Math.max(3600, Math.round(duracaoTurnoTardeSec))]
        });
        slotTurno.set(idTarde, 'tarde');
    });

    let calculando = false;
    try {
        btnRota.innerText = '⏳ Calculando Rotas...';
        btnRota.disabled = true;
        calculando = true;
        const resp = await fetch('https://api.openrouteservice.org/optimization', {
            method: 'POST',
            headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs, vehicles })
        });
        const result = await resp.json();

        if (result.error) {
            console.error(result.error);
            invalidarCachesyncRotas();
            await carregarDados();
            return mostrarErro('Erro na Rota: ' + (result.error.message || 'Falha ao gerar o trajeto.'));
        }

        let avisoExcesso = '';
        let temExcesso = false;

        // Coletas rejeitadas pelo ORS (em geral por janela de tempo: serviço
        // de 50min é caro) são auto-forçadas no turno mais leve, sem exigir
        // clique de "Forçar". Assim a coleta NUNCA fica pendurada fora da
        // rota do dia, como pede a regra de negócio.
        const coletasForcadasDeUnassigned = [];
        // Pacotes que vão ser empurrados pro dia seguinte pela regra de
        // estouro de turno (o ORS não conseguiu encaixar nem na manhã nem
        // na tarde → o dia inteiro lotou → migra a sobra pro próximo dia).
        const entregasMigradasProximoDia = [];
        const proximoDiaIso = somarDiasIso(dataFiltro, 1);
        if (result.unassigned && result.unassigned.length > 0) {
            // Heurística de motivo real: comparamos peso individual de cada
            // job rejeitado com a MAIOR capacidade de peso disponível na frota.
            // Só marcamos como "excesso de peso" quando o item sozinho realmente
            // ultrapassa a capacidade. Senão, o motivo é a janela do turno.
            const maiorCapacidadeFrota = vehicles.reduce((m, v) => Math.max(m, (v.capacity && v.capacity[0]) || 0), 0);
            const pesoTotalJobs = jobs.reduce((s, j) => s + ((j.delivery && j.delivery[0]) || 0), 0);
            const capacidadeTotalFrota = vehicles.reduce((s, v) => s + ((v.capacity && v.capacity[0]) || 0), 0);
            const excedeFrotaNoTotal = capacidadeTotalFrota > 0 && pesoTotalJobs > capacidadeTotalFrota;

            const pacotesPesoIndividualPendentes = [];
            result.unassigned.forEach((itemRejeitado) => {
                const realId = idMap.get(itemRejeitado.id);
                if (!realId) return;
                const pacoteNaBase = entregas.find((e) => e.id === realId);
                if (!pacoteNaBase) return;

                const pesoItem = Math.ceil(parseFloat(pacoteNaBase.specs?.peso || 0));
                const excedePesoItem = maiorCapacidadeFrota > 0 && pesoItem > maiorCapacidadeFrota;

                pacoteNaBase.status = 'pendente';
                delete pacoteNaBase.ordem;
                delete pacoteNaBase.tempoViagem;
                delete pacoteNaBase.corIcone;

                // COLETA sem peso → entra forçada no turno mais leve (mantém
                // o comportamento atual: coleta sempre roda no dia).
                if (ehColeta(pacoteNaBase) && !excedePesoItem) {
                    coletasForcadasDeUnassigned.push(pacoteNaBase);
                    return;
                }

                // ENTREGA com peso individual maior que o maior veículo da
                // frota → empurrar pro dia seguinte não resolve (o veículo
                // não muda). Fica pendente com aviso pro operador.
                if (excedePesoItem) {
                    const ident = pacoteNaBase.nomeCliente ? pacoteNaBase.nomeCliente : (pacoteNaBase.endereco || '').substring(0, 30) + '...';
                    pacotesPesoIndividualPendentes.push(`📍 ${ident} — peso ${pesoItem}kg > capacidade`);
                    return;
                }

                // Demais rejeições (tempo do turno esgotado ou soma da
                // frota sem capacidade total) → MIGRA PRO PRÓXIMO DIA.
                // Regra: "manhã estoura → cai na tarde" (o ORS já faz isso
                // sozinho distribuindo entre veículo manhã/tarde). "Tarde
                // estoura → vai pro dia seguinte" (é o caso aqui, já que
                // nem tarde coube).
                delete pacoteNaBase.periodo;
                delete pacoteNaBase.distanciaTrecho;
                pacoteNaBase.dataEntrega = proximoDiaIso;
                pacoteNaBase.__migrarData = proximoDiaIso;
                entregasMigradasProximoDia.push(pacoteNaBase);
            });

            if (pacotesPesoIndividualPendentes.length > 0) {
                temExcesso = true;
                const msgPopUp =
                    '⚠️ ALGUNS PONTOS FICARAM FORA DA ROTA (capacidade de peso insuficiente)\n\n' +
                    'Itens pendentes (permanecem na lista para atuação manual):\n\n' +
                    pacotesPesoIndividualPendentes.join('\n') +
                    '\n\nDica: troque por um veículo de maior capacidade, ou\n' +
                    'use "⚠️ Forçar (Manhã/Tarde)" no card se quiser ignorar o limite.';
                setTimeout(() => { alert(msgPopUp); }, 500);
                avisoExcesso = '⚠️ Itens fora da rota: peso excede a capacidade do veículo.';
            }

            // REGRA DO VÍNCULO: toda coleta_vinculada_id que aponta para uma
            // entrega migrada TEM que ir junto pro próximo dia. Caso contrário,
            // a coleta fica sem rota no dia atual (entrega-pai saiu) e vira
            // órfã. Buscamos coletas vinculadas na data atual e migramos juntas.
            if (entregasMigradasProximoDia.length > 0) {
                const idsEntregasMigradas = new Set(entregasMigradasProximoDia.map((e) => Number(e.id)));
                const coletasVincMigrar = entregas.filter((c) =>
                    ehColeta(c)
                    && c.coletaVinculadaId != null
                    && idsEntregasMigradas.has(Number(c.coletaVinculadaId))
                    && c.dataEntrega === dataFiltro
                    && c.status !== 'concluida'
                );
                coletasVincMigrar.forEach((c) => {
                    c.status = 'pendente';
                    delete c.ordem;
                    delete c.tempoViagem;
                    delete c.corIcone;
                    delete c.periodo;
                    delete c.distanciaTrecho;
                    c.dataEntrega = proximoDiaIso;
                    c.__migrarData = proximoDiaIso;
                    entregasMigradasProximoDia.push(c);
                });
            }
        }

        // Helper local: mensagem amigável da migração do dia.
        const dataBr = (iso) => {
            if (!iso) return '';
            const [y, m, d] = iso.split('-');
            return `${d}/${m}/${y}`;
        };
        const avisarMigracaoProximoDia = () => {
            if (entregasMigradasProximoDia.length === 0) return;
            const linhas = entregasMigradasProximoDia.map((p) => {
                const ident = p.nomeCliente ? p.nomeCliente : (p.endereco || '').substring(0, 40) + '...';
                return `➡️ ${ident}`;
            }).join('\n');
            setTimeout(() => {
                alert(
                    `📅 ${entregasMigradasProximoDia.length} ponto(s) transferido(s) para ${dataBr(proximoDiaIso)}\n\n` +
                    'Motivo: a janela do turno da tarde esgotou — não havia tempo/capacidade para rodar hoje.\n\n' +
                    'Itens migrados (agora na fila do dia seguinte):\n\n' + linhas
                );
            }, 700);
        };

        if (result.routes && result.routes.length > 0) {
            for (const route of result.routes) {
                const coresFixas = ['#16a34a', '#2563eb', '#f59e0b', '#9333ea', '#ef4444'];
                const corDaRota = coresFixas[(route.vehicle - 1) % coresFixas.length];
                // Turno vem do mapa slotTurno (cada veículo físico gera slot manhã + tarde).
                const novoTurno = slotTurno.get(route.vehicle) || 'manha';
                // Horário-base do turno: ETA = baseTurno + step.arrival_sec.
                // step.arrival vem em segundos desde o "time 0" do veículo.
                const baseTurnoHHMM = novoTurno === 'manha' ? CORTE_MANHA : CORTE_TARDE;
                let contador = 1;
                let tempoAnt = route.steps[0].arrival;
                let distAnt = route.steps[0].distance || 0;
                route.steps.forEach((step) => {
                    if (step.type === 'job') {
                        const pReal = entregas.find((e) => e.id === idMap.get(step.id));
                        if (pReal) {
                            pReal.tempoViagem = Math.round((step.arrival - tempoAnt) / 60);
                            pReal.distanciaTrecho = step.distance ? ((step.distance - distAnt) / 1000).toFixed(1) : '0.0';
                            pReal.ordem = contador;
                            pReal.corIcone = corDaRota;
                            pReal.periodo = novoTurno;
                            pReal.horaPrevista = somarSegundosHHMM(baseTurnoHHMM, step.arrival);
                            contador++;
                        }
                    }
                    tempoAnt = step.arrival + (step.service || 0);
                    if (step.distance !== undefined) distAnt = step.distance;
                });
            }
            invalidarCachesyncRotas();
            // 1) Persiste o que o ORS decidiu (ordem/periodo/dataEntrega das migradas).
            await atualizarRoteamentoLote(entregasAlvo);
            // Limpa marker __migrarData depois de persistir para não vazar em futuros PATCHs.
            entregasMigradasProximoDia.forEach((p) => { delete p.__migrarData; });
            // 2) Coletas rejeitadas pelo ORS por tempo são auto-incluídas no
            //    turno mais leve. Regra de negócio: coleta sempre entra na rota
            //    do dia; usuário não precisa mais clicar em "Forçar".
            if (coletasForcadasDeUnassigned.length > 0) {
                await forcarColetasNoTurnoMaisLeve(coletasForcadasDeUnassigned, dataFiltro);
            }
            // 3) Reposiciona coletas vinculadas imediatamente antes de suas
            //    entregas, independente do que o ORS decidiu.
            await garantirAdjacenciaVinculosNoDia(dataFiltro);
            // 4) Se houve injeção manual (coletas forçadas ou vinculadas),
            //    as novas paradas estão sem tempo/distância reais. Recalcula
            //    via ORS driving-car pra atualizar tempoViagem/distanciaTrecho,
            //    depois recomputa ETA acumulado do turno.
            const houveInjecao = coletasForcadasDeUnassigned.length > 0
                || entregas.some((e) => e.dataEntrega === dataFiltro && ehColeta(e) && e.coletaVinculadaId != null && e.ordem);
            if (houveInjecao) {
                try { await recalcularDistanciasManuais({ silent: true }); } catch (e) {}
                const alteradosEta = [
                    ...recalcularEtaTurno(dataFiltro, 'manha'),
                    ...recalcularEtaTurno(dataFiltro, 'tarde')
                ];
                if (alteradosEta.length > 0) {
                    try { await atualizarRoteamentoLote(alteradosEta); } catch (e) {}
                }
            }
            renderizarListaSimples({ preservarViewport: false });
            await tracarRotasNasRuas();
            avisarMigracaoProximoDia();
            // Mensagem de status final: prioriza alerta de peso, depois migração,
            // depois coletas forçadas, senão sucesso pleno.
            if (temExcesso) mostrarErro(avisoExcesso);
            else if (entregasMigradasProximoDia.length > 0) {
                mostrarSucesso(`✔️ Rota gerada. ${entregasMigradasProximoDia.length} ponto(s) transferido(s) para ${dataBr(proximoDiaIso)}.`);
            } else if (coletasForcadasDeUnassigned.length > 0) {
                mostrarSucesso(`✔️ Rota gerada. ${coletasForcadasDeUnassigned.length} coleta(s) incluída(s) automaticamente no turno mais leve.`);
            } else {
                mostrarSucesso('✔️ Rota validada com sucesso! Coletas incluídas.');
            }
        } else if (temExcesso || coletasForcadasDeUnassigned.length > 0 || entregasMigradasProximoDia.length > 0) {
            invalidarCachesyncRotas();
            await atualizarRoteamentoLote(entregasAlvo);
            entregasMigradasProximoDia.forEach((p) => { delete p.__migrarData; });
            if (coletasForcadasDeUnassigned.length > 0) {
                await forcarColetasNoTurnoMaisLeve(coletasForcadasDeUnassigned, dataFiltro);
            }
            await garantirAdjacenciaVinculosNoDia(dataFiltro);
            renderizarListaSimples({ preservarViewport: false });
            await tracarRotasNasRuas();
            avisarMigracaoProximoDia();
            if (entregasMigradasProximoDia.length > 0 && !temExcesso) {
                mostrarSucesso(`✔️ ${entregasMigradasProximoDia.length} ponto(s) transferido(s) para ${dataBr(proximoDiaIso)} (turno da tarde esgotado).`);
            } else if (coletasForcadasDeUnassigned.length > 0 && !temExcesso) {
                mostrarSucesso(`✔️ ${coletasForcadasDeUnassigned.length} coleta(s) incluída(s) automaticamente no turno mais leve.`);
            } else {
                mostrarErro('Todos os pacotes ultrapassam os limites e ficaram pendentes.');
            }
        } else {
            mostrarErro('Limites excedidos ou resposta vazia. Rota não gerada.');
            invalidarCachesyncRotas();
            await carregarDados();
        }
    } catch (error) {
        invalidarCachesyncRotas();
        await carregarDados();
        mostrarErro('Falha no servidor de rotas (ORS). Tente de novo em instantes.');
    } finally {
        if (calculando) {
            btnRota.innerText = tituloBtnOk;
            btnRota.disabled = false;
        }
    }
}

async function recalcularDistanciasManuais(opts = {}) {
    const silent = !!opts.silent;
    if (!BASE_EMPRESA_OK) {
        if (!silent) mostrarErro('Configure a base de partida desta empresa antes de recalcular.');
        return;
    }
    const dataFiltro = document.getElementById('filtro-data-operacao').value;
    if (!silent) { const el = document.getElementById('status-nuvem'); if (el) el.innerText = '⏳ Calculando...'; }
    let alterou = false;
    for (const turno of ['manha', 'tarde']) {
        const pacotes = entregas.filter(e => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem && e.status !== 'concluida' && Array.isArray(e.coords) && e.coords.length === 2).sort((a,b) => a.ordem - b.ordem);
        if (pacotes.length > 0) {
            try { const coords = [LOJA_COORDS, ...pacotes.map(p => p.coords)]; const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/json', { method: 'POST', headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: coords }) }); const data = await r.json(); if (data.routes && data.routes.length > 0) { const segments = data.routes[0].segments; pacotes.forEach((p, index) => { if (segments[index]) { p.distanciaTrecho = (segments[index].distance / 1000).toFixed(1); p.tempoViagem = Math.round(segments[index].duration / 60); alterou = true; } }); } } catch(e) { }
        }
    }
    if (alterou) {
        const alterados = entregas.filter(e => e.dataEntrega === dataFiltro && e.ordem && e.status !== 'concluida');
        await atualizarRoteamentoLote(alterados);
        if (!silent) { renderizarListaSimples(); tracarRotasNasRuas(); mostrarSucesso("Distâncias recaluladas!"); }
    } else if (!silent) mostrarErro("Sem rotas validadas.");
}

async function recalcularTurnoAposMudancaManual(dataFiltro, turno) {
    const pacotes = entregas
        .filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem && e.status !== 'concluida')
        .sort((a, b) => a.ordem - b.ordem);
    if (pacotes.length === 0) return;

    try {
        const coords = [LOJA_COORDS, ...pacotes.map((p) => p.coords)];
        const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/json', {
            method: 'POST',
            headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: coords })
        });
        const data = await r.json();
        if (!(data.routes && data.routes.length > 0)) return;
        const segments = data.routes[0].segments || [];
        pacotes.forEach((p, index) => {
            if (segments[index]) {
                p.distanciaTrecho = (segments[index].distance / 1000).toFixed(1);
                p.tempoViagem = Math.round(segments[index].duration / 60);
            }
        });
        const alterados = entregas.filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem && e.status !== 'concluida');
        await atualizarRoteamentoLote(alterados);
        invalidarCachesyncRotas();
        await carregarDados({ subtle: true });
    } catch (e) {
        console.warn('Falha ao recalcular turno após mudança manual', e);
    }
}

function limparRotasDoMapa() {
    layersLinhas.forEach((l) => {
        if (map) map.removeLayer(l);
    });
    layersLinhas = [];
}
async function tracarRotasNasRuas(opts = {}) {
    const fromPoll = !!opts.fromPoll;
    // Sem base resolvida não dá pra desenhar rotas (LOJA_COORDS == null
    // quebraria o JSON enviado ao ORS). Sai limpo, sem alertas.
    if (!BASE_EMPRESA_OK || !Array.isArray(LOJA_COORDS) || LOJA_COORDS.length < 2) return;
    const d = document.getElementById('filtro-data-operacao').value;
    const sigLinhas = assinaturaLinhasRota(d);
    if (fromPoll && rotasPollSubtleLigado() && sigLinhas === ultimaAssinaturaLinhasRota) return;
    ultimaAssinaturaLinhasRota = sigLinhas;
    limparRotasDoMapa();
    const m = entregas.filter(e => e.dataEntrega === d && e.periodo === 'manha' && e.ordem && e.status !== 'concluida' && e.coords).sort((a,b)=>a.ordem-b.ordem);
    const t = entregas.filter(e => e.dataEntrega === d && e.periodo === 'tarde' && e.ordem && e.status !== 'concluida' && e.coords).sort((a,b)=>a.ordem-b.ordem);
    try {
        if(m.length > 0 && map) { const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', { method: 'POST', headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [LOJA_COORDS, ...m.map(p => p.coords), LOJA_COORDS] }) }); layersLinhas.push(L.geoJSON(await r.json(), { style: { color: '#16a34a', weight: 6, opacity: 0.6 } }).addTo(map)); }
        if(t.length > 0 && map) { const r = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', { method: 'POST', headers: { 'Authorization': ORS_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [LOJA_COORDS, ...t.map(p => p.coords), LOJA_COORDS] }) }); layersLinhas.push(L.geoJSON(await r.json(), { style: { color: '#2563eb', weight: 6, opacity: 0.6 } }).addTo(map)); }
    } catch(e) {}
}

// RESTAURAÇÃO DO BOTÃO DE GOOGLE MAPS
function abrirRotaGoogleMaps(turno) {
    const dataFiltro = document.getElementById('filtro-data-operacao').value;
    const pacotes = entregas.filter(e => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem > 0 && e.status !== 'concluida');
    pacotes.sort((a, b) => a.ordem - b.ordem);
    if(pacotes.length === 0) return alert("Nenhuma rota validada ou pendente para este turno.");
    
    const origem = encodeURIComponent(ENDERECO_BASE_TEXTO);
    const waypoints = pacotes.map(p => encodeURIComponent(p.endereco)).join('/');
    window.open(`https://www.google.com/maps/dir/${origem}/${waypoints}/${origem}`, '_blank');
}

function abrirRelatorio() { document.getElementById('filtro-turno-relatorio').value = 'todos'; renderizarConteudoRelatorio(); document.getElementById('modal-relatorio').style.display = 'flex'; }

// RESTAURAÇÃO DA BARRA DE RESUMO (PESO, VOLUMES, DISTÂNCIA) E MAPS
function renderizarConteudoRelatorio() {
    const d = document.getElementById('filtro-data-operacao').value; const pacotesDia = entregas.filter(e => e.dataEntrega === d); const turnoFiltro = document.getElementById('filtro-turno-relatorio').value;
    const container = document.getElementById('conteudo-relatorio'); container.innerHTML = "";
    let periodos = ['manha', 'tarde']; if (turnoFiltro !== 'todos') periodos = [turnoFiltro];
    const titulos = { 'manha': '☀️ Roteiro da Manhã', 'tarde': '🌤️ Roteiro da Tarde' }; const cores = { 'manha': '#16a34a', 'tarde': '#2563eb' };
    
    let encontrou = false;

    periodos.forEach(turno => {
        const pacotes = pacotesDia.filter(e => e.periodo === turno && (e.ordem > 0 || e.status === 'concluida')).sort((a, b) => (a.ordem || 999) - (b.ordem || 999));

        if(pacotes.length > 0) {
            encontrou = true;

            const totalPeso = pacotes.reduce((acc, p) => acc + parseFloat(p.specs?.peso || 0), 0);
            const distTotal = pacotes.reduce((acc, p) => acc + parseFloat(p.distanciaTrecho || 0), 0);
            const botaoGmaps = (pacotes.some(p => p.ordem && p.status !== 'concluida')) 
                ? `<button class="btn-gmaps" onclick="abrirRotaGoogleMaps('${turno}')">📍 Iniciar GPS (Google Maps)</button>` 
                : `<span style="font-size:11px; color:#15803d; font-weight: bold;">✔️ Rota Finalizada / Sem GPS</span>`;

            let tabelaHTML = `
                <div class="turno-section">
                    <div class="turno-title" style="color: ${cores[turno]}">
                        <span>${titulos[turno]} - ${formatarData(d)}</span>
                        ${botaoGmaps}
                    </div>
                    <div style="margin-bottom: 15px; font-size: 14px; color: #1e293b; background: #e2e8f0; padding: 10px; border-radius: 6px; border-left: 5px solid ${cores[turno]};">
                        <b>📦 Volumes:</b> ${pacotes.length} un.   |   <b>⚖️ Peso:</b> <span style="color: #ea580c; font-weight: 900;">${totalPeso.toFixed(1)} kg</span>   |   <b>🛣️ Distância Prevista:</b> <span style="color: #0284c7; font-weight: 900;">${distTotal.toFixed(1)} km</span>
                    </div>
                    <table class="relatorio-table">
                        <thead><tr><th style="width: 70px;">Ordem</th><th>Cliente / Endereço</th><th>Previsto (SLA)</th><th>Realizado</th><th>Distância</th><th>Peso</th><th>Status</th></tr></thead>
                        <tbody>
            `;

            pacotes.forEach(p => {
                let ordemCell = p.ordem ? `<span style="font-size: 14px; font-weight: 900; color: ${cores[turno]};">${p.ordem}º Parada</span>` : 'Pendente';
                let statusTxt = p.status === 'concluida' ? '<span style="color:#15803d; font-weight:bold;">✔️ CONCLUÍDO</span>' : '<span style="color:#d97706; font-weight:bold;">Aguardando</span>';
                
                let prevViagem = parseInt(p.tempoViagem) || 0; let prevObra = p.specs?.tempoServico ? Math.round(p.specs.tempoServico/60) : 10;
                let tempoPrevisto = `Viagem: ${prevViagem}m<br>Local: ${prevObra}m`;
                
                let tempoReal = '-';
                if (p.status === 'concluida') {
                    let realViagem = parseInt(p.tempoViagemReal) || 0; let realObra = parseInt(p.tempoNoLocalReal) || 0;
                    let calcViagem = realViagem - prevViagem; let calcObra = realObra - prevObra;
                    let corV = calcViagem > 0 ? 'color:red' : 'color:green'; let corO = calcObra > 0 ? 'color:red' : 'color:green';
                    let sinalV = calcViagem > 0 ? '+' : ''; let sinalO = calcObra > 0 ? '+' : '';
                    tempoReal = `Viagem: <b>${realViagem}m</b> <small style="${corV}">(${sinalV}${calcViagem})</small><br>Obra: <b>${realObra}m</b> <small style="${corO}">(${sinalO}${calcObra})</small>`;
                }

                tabelaHTML += `<tr style="${p.status === 'concluida' ? 'background:#f0fdf4;' : ''}">
                    <td><b>${p.status === 'concluida' ? '-' : ordemCell}</b></td>
                    <td style="${p.status === 'concluida' ? 'text-decoration: line-through;' : ''}"><b>${p.nomeCliente || 'Não inf.'}</b><br>${p.endereco}</td>
                    <td style="font-size:11px; color:#64748b;">${tempoPrevisto}</td>
                    <td style="font-size:11px; color:#1e293b;">${tempoReal}</td>
                    <td><b>${p.distanciaTrecho ? p.distanciaTrecho + ' km' : '-'}</b></td>
                    <td><b style="color: #ea580c">${p.specs?.peso || 0} kg</b></td>
                    <td>${statusTxt}</td>
                </tr>`;
            });

            tabelaHTML += `</tbody></table></div>`; container.innerHTML += tabelaHTML;
        }
    });

    if(!encontrou) { container.innerHTML = `<p style="text-align:center; padding: 20px;">Nenhuma entrega encontrada para este turno/data.</p>`; }
}

function fecharModal(id) { document.getElementById(id).style.display = 'none'; }
function mostrarErro(msg) { document.getElementById('msg-erro').innerHTML = msg; document.getElementById('msg-erro').style.display = 'block'; setTimeout(esconderMensagens, 6000); }
function mostrarSucesso(msg) { document.getElementById('msg-sucesso').innerHTML = msg; document.getElementById('msg-sucesso').style.display = 'block'; setTimeout(esconderMensagens, 3000); }
function esconderMensagens() { document.getElementById('msg-erro').style.display = 'none'; document.getElementById('msg-sucesso').style.display = 'none'; }

setInterval(async () => {
    try {
        aplicarRegraHorario({ silent: true });
        const ok = await carregarDados({ subtle: true, fromPoll: true });
        if (!ok) return;
        await verificarRotasExpiradas({ silent: true });
    } catch (e) {}
}, 20000);

/*
 * --- PONTO DE VOLTA / LEGADO (referência) ---
 * Se a sincronização suave ou a inteligência de ordem causarem problema:
 * - Desative na tela em "Opções da tela e da ordem", ou
 *   localStorage.setItem('rotas_poll_subtle','0'); localStorage.setItem('rotas_intel_ordem','0');
 *
 * Comportamento antigo (antes desta alteração):
 * - carregarDados() sem parâmetros: sempre status "Conectando Banco...", sempre renderizarListaSimples + tracarRotasNasRuas.
 * - moverOrdem: só trocava ordem via API e carregarDados() completo, sem confirmação de custo nem refinamento Haversine nem restauração de snapshot.
 */