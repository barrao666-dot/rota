// ---------------------------------------------------------------------------
// Painel Master Rota++ — controle das 4 abas (Dashboard / Clientes / Mapa / Financeiro)
// ---------------------------------------------------------------------------
// Convenção: estado fica em variáveis no topo, funções abaixo. Sem framework
// nem build — só DOM + Chart.js (CDN) + Leaflet (CDN). Mantém deploy simples.

let empresasCarregadas = [];
let basesAtivasCarregadas = [];
let basesPendentesCoords = [];
let empresasSemBase = [];
let metricasCarregadas = null;
let idEmpresaEditando = null;

let mapaBasesPainel = null;
let mapaBasesPainelLayers = [];
let mapaBasesCompleto = null;
let mapaBasesCompletoLayers = [];

let chartStatus = null;
let chartUf = null;
let chartPlano = null;
let chartReceitaStatus = null;
let chartVencMes = null;

// ---------- Bootstrap ----------

function getPayloadDoToken(token) {
    try {
        const raw = (token || '').replace(/^bearer\s+/i, '').trim();
        if (!raw || raw.split('.').length < 2) return null;
        return JSON.parse(atob(raw.split('.')[1]));
    } catch (e) { return null; }
}

function iniciarPainel() {
    let tokenAtual = localStorage.getItem('auth_token');
    const payloadAtual = getPayloadDoToken(tokenAtual);
    if (payloadAtual?.role !== 'master') {
        const backup = sessionStorage.getItem('rota_plus_master_token_backup');
        if (backup) {
            localStorage.setItem('auth_token', backup);
            tokenAtual = backup;
        }
    }
    if (!tokenAtual) {
        window.location.href = '/index.html';
        return;
    }
    Promise.all([carregarMetricas(), carregarEmpresas(), carregarBasesAtivas()])
        .then(() => {
            renderizarTudo();
        })
        .catch((e) => console.error('[dashboard] falha no bootstrap', e));
}

function sairMaster() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('dados_empresa');
    localStorage.removeItem('dados_operador');
    try { sessionStorage.removeItem('rota_plus_master_token_backup'); } catch (e) {}
    window.location.href = '/index.html';
}

// ---------- Tabs / navegação ----------

const TITULOS_ABAS = {
    dash: 'Dashboard Geral',
    clientes: 'Clientes (Cadastro / Edição)',
    mapa: 'Mapa de Bases',
    financeiro: 'Financeiro'
};

function trocarAba(nome) {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === nome));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    const alvo = document.getElementById(`panel-${nome}`);
    if (alvo) alvo.classList.add('active');
    const tit = document.getElementById('topbar-titulo');
    if (tit) tit.innerText = TITULOS_ABAS[nome] || 'Painel Master';

    // Mapa do tile do dashboard e o mapa "completo" da aba Mapa precisam de
    // invalidateSize quando ficam visíveis, senão renderizam só um pedaço.
    if (nome === 'dash' && mapaBasesPainel) setTimeout(() => mapaBasesPainel.invalidateSize(), 100);
    if (nome === 'mapa') {
        if (!mapaBasesCompleto) inicializarMapaCompleto();
        renderizarPinosMapaCompleto();
        setTimeout(() => mapaBasesCompleto && mapaBasesCompleto.invalidateSize(), 100);
    }
}

// ---------- Carregamento de dados ----------

async function carregarMetricas() {
    try {
        const res = await apiFetch('/api/empresas/dashboard');
        metricasCarregadas = await res.json();
    } catch (e) {
        console.warn('[dashboard] falha em /dashboard', e);
    }
}

async function carregarEmpresas() {
    try {
        const resposta = await apiFetch('/api/empresas');
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados?.erro || `HTTP ${resposta.status}`);
        empresasCarregadas = Array.isArray(dados.empresas) ? dados.empresas : [];
    } catch (erro) {
        console.error('[dashboard] erro listando empresas', erro);
        empresasCarregadas = [];
    }
}

async function carregarBasesAtivas() {
    try {
        const res = await apiFetch('/api/empresas/dashboard/bases-ativas');
        const dados = await res.json();
        basesAtivasCarregadas = Array.isArray(dados.bases) ? dados.bases : [];
        basesPendentesCoords = Array.isArray(dados.pendentes_coords) ? dados.pendentes_coords : [];
        empresasSemBase = Array.isArray(dados.empresas_sem_base) ? dados.empresas_sem_base : [];
        console.log('[dashboard] bases-ativas:', {
            plotaveis: basesAtivasCarregadas.length,
            pendentes_coords: basesPendentesCoords.length,
            empresas_sem_base: empresasSemBase.length
        });
    } catch (e) {
        console.warn('[dashboard] falha em /dashboard/bases-ativas', e);
        basesAtivasCarregadas = [];
        basesPendentesCoords = [];
        empresasSemBase = [];
    }
}

function atualizarAvisoPendencias() {
    const total = (basesPendentesCoords.length || 0) + (empresasSemBase.length || 0);
    const mostra = total > 0;
    ['aviso-pendencias-mapa', 'aviso-pendencias-mapa-completo'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!mostra) { el.style.display = 'none'; el.innerHTML = ''; return; }
        const itensSemBase = empresasSemBase.slice(0, 5).map((e) => `<li><strong>${e.empresa_nome}</strong> — sem base cadastrada</li>`).join('');
        const itensSemCoords = basesPendentesCoords.slice(0, 5).map((b) => `<li><strong>${b.empresa_nome}</strong> — base "${b.base_nome}" sem coordenadas</li>`).join('');
        const resto = total > 10 ? `<li>…e mais ${total - 10} pendência(s).</li>` : '';
        el.innerHTML = `
            <strong>⚠️ ${total} pendência(s) impedindo o mapa de mostrar tudo:</strong>
            <ul>${itensSemBase}${itensSemCoords}${resto}</ul>
            Clique em <strong>🧭 Corrigir pendências</strong> para tentar resolver automaticamente via Nominatim.
        `;
        el.style.display = 'block';
    });
    ['btn-geocodificar-dash', 'btn-geocodificar-mapa'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.style.display = mostra ? 'inline-block' : 'none';
    });
}

async function executarGeocodificarBases() {
    const btns = ['btn-geocodificar-dash', 'btn-geocodificar-mapa'].map((i) => document.getElementById(i)).filter(Boolean);
    btns.forEach((b) => { b.disabled = true; b.innerText = '⏳ Processando…'; });
    try {
        const res = await apiFetch('/api/empresas/dashboard/geocodificar-bases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const dados = await res.json();
        if (!res.ok) throw new Error(dados.erro || `HTTP ${res.status}`);
        const r = dados.resumo || {};
        const msg = [
            `${r.empresas_sem_base || 0} base(s) default criada(s)`,
            `${r.bases_geocodificadas || 0} base(s) geocodificada(s)`,
            r.bases_ainda_pendentes ? `${r.bases_ainda_pendentes} ainda sem coord (endereço incompleto)` : null
        ].filter(Boolean).join(' · ');
        alert(`✅ Concluído: ${msg}`);
        await carregarBasesAtivas();
        renderizarPinosMapaPainel();
        renderizarPinosMapaCompleto();
        renderizarTopbarResumo();
        atualizarAvisoPendencias();
    } catch (e) {
        alert(`❌ Falha ao geocodificar: ${e.message || e}`);
    } finally {
        btns.forEach((b) => { b.disabled = false; b.innerText = '🧭 Corrigir pendências'; });
    }
}

// ---------- Render orquestrador ----------

function renderizarTudo() {
    renderizarKPIs();
    inicializarMapaPainel();
    renderizarPinosMapaPainel();
    renderizarGraficos();
    renderizarFiltrosUF();
    renderizarDatagrid();
    renderizarFinanceiro();
    renderizarTopbarResumo();
    atualizarAvisoPendencias();
}

function renderizarTopbarResumo() {
    const m = metricasCarregadas;
    if (!m) return;
    const el = document.getElementById('topbar-resumo');
    if (el) el.innerText = `${m.clientes_total || 0} contas · ${basesAtivasCarregadas.length} bases ativas`;
}

// ---------- KPIs ----------

function fmtBRL(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function fmtBRLcent(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtData(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('pt-BR'); } catch (e) { return '—'; }
}

function renderizarKPIs() {
    const m = metricasCarregadas || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };
    const setHTML = (id, v) => { const e = document.getElementById(id); if (e) e.innerHTML = v; };

    set('kpi-clientes-total', m.clientes_total || 0);
    setHTML('kpi-clientes-sub', `<strong style="color:var(--pbi-success)">${m.clientes_ativos || 0}</strong> ativos · <strong style="color:var(--pbi-danger)">${m.clientes_bloqueados || 0}</strong> bloqueados`);
    set('kpi-receita', fmtBRL(m.receita || 0));
    set('kpi-venc30', m.vencimentos_30d || 0);
    set('kpi-operacao', (m.veiculos_ativos || 0) + (m.motoristas_ativos || 0));
    setHTML('kpi-operacao-sub', `${m.motoristas_ativos || 0} motoristas / ${m.veiculos_ativos || 0} veículos`);
}

// ---------- Mapa (Leaflet) ----------

function inicializarMapaPainel() {
    if (mapaBasesPainel || !document.getElementById('mapa-bases')) return;
    if (typeof L === 'undefined') {
        console.error('[dashboard] Leaflet (L) não carregou — verifique internet/CDN.');
        const el = document.getElementById('mapa-bases');
        if (el) el.innerHTML = '<div style="padding:24px; text-align:center; color:#b91c1c;">⚠️ Biblioteca de mapa (Leaflet) não carregou. Verifique sua conexão.</div>';
        return;
    }
    mapaBasesPainel = L.map('mapa-bases', { zoomControl: true }).setView([-15.78, -47.93], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapaBasesPainel);
    // invalidateSize em 2 momentos: agora (caso container ganhe tamanho tardiamente) e em 300ms (após CSS/fontes assentarem).
    setTimeout(() => { try { mapaBasesPainel.invalidateSize(); } catch (e) {} }, 50);
    setTimeout(() => { try { mapaBasesPainel.invalidateSize(); } catch (e) {} }, 350);
}
function inicializarMapaCompleto() {
    if (mapaBasesCompleto || !document.getElementById('mapa-bases-completo')) return;
    if (typeof L === 'undefined') {
        console.error('[dashboard] Leaflet (L) não carregou — verifique internet/CDN.');
        return;
    }
    mapaBasesCompleto = L.map('mapa-bases-completo', { zoomControl: true }).setView([-15.78, -47.93], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapaBasesCompleto);
    setTimeout(() => { try { mapaBasesCompleto.invalidateSize(); } catch (e) {} }, 50);
    setTimeout(() => { try { mapaBasesCompleto.invalidateSize(); } catch (e) {} }, 350);
}

function pinoColorido(cor, sigla) {
    const corHex = cor || '#0078d4';
    const txt = (sigla || '').slice(0, 3).toUpperCase();
    return L.divIcon({
        className: 'pino-base-master',
        html: `<div style="background:${corHex}; color:#fff; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-weight:700; border:3px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4); font-size:10px;">${txt}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

function renderizarPinos(mapa, layersRef) {
    if (!mapa) return [];
    layersRef.forEach((l) => mapa.removeLayer(l));
    layersRef.length = 0;
    if (basesAtivasCarregadas.length === 0) {
        // Zero pinos: mantém a visão geral do Brasil pra deixar claro que está vazio por falta de dado.
        try { mapa.setView([-15.78, -47.93], 4); } catch (e) {}
        return layersRef;
    }

    const bounds = L.latLngBounds([]);
    basesAtivasCarregadas.forEach((b) => {
        const sigla = b.empresa_nome ? b.empresa_nome.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 3) : '·';
        const m = L.marker([b.lat, b.lng], { icon: pinoColorido(b.cor, sigla) }).addTo(mapa);
        const popup = `<div style="font-size:12px;">
            <strong style="color:${b.cor || '#0078d4'};">${b.empresa_nome}</strong><br>
            <span style="color:#666;">${b.base_nome}</span><br>
            <small>${b.endereco || ''}</small>
        </div>`;
        m.bindPopup(popup);
        layersRef.push(m);
        bounds.extend([b.lat, b.lng]);
    });
    if (layersRef.length > 0) {
        try {
            if (layersRef.length === 1) {
                // Só 1 ponto: fitBounds sem pad zooma absurdamente — força um zoom confortável.
                mapa.setView(bounds.getCenter(), 11);
            } else {
                mapa.fitBounds(bounds.pad(0.2), { maxZoom: 10 });
            }
        } catch (e) { console.warn('[dashboard] erro no fitBounds', e); }
        // Garante que o Leaflet recalcule tamanho (o tile do painel pode ter sido pintado enquanto a aba estava escondida).
        setTimeout(() => { try { mapa.invalidateSize(); } catch (e) {} }, 100);
    }
    return layersRef;
}

function renderizarPinosMapaPainel() {
    inicializarMapaPainel();
    renderizarPinos(mapaBasesPainel, mapaBasesPainelLayers);
    const r = document.getElementById('mapa-resumo');
    if (r) r.innerText = `${basesAtivasCarregadas.length} base(s) ativa(s)`;
}
function renderizarPinosMapaCompleto() {
    inicializarMapaCompleto();
    renderizarPinos(mapaBasesCompleto, mapaBasesCompletoLayers);
    const r = document.getElementById('mapa-completo-resumo');
    if (r) {
        const empresas = new Set(basesAtivasCarregadas.map((b) => b.empresa_id)).size;
        r.innerText = `${basesAtivasCarregadas.length} base(s) ativa(s) em ${empresas} empresa(s)`;
    }
}
async function recarregarMapaBases() {
    await carregarBasesAtivas();
    renderizarPinosMapaPainel();
    renderizarPinosMapaCompleto();
    renderizarTopbarResumo();
    atualizarAvisoPendencias();
}

// ---------- Charts ----------

function destruirChart(c) { try { if (c) c.destroy(); } catch (e) {} }

function renderizarGraficos() {
    if (typeof Chart === 'undefined') {
        console.warn('[dashboard] Chart.js não carregou (sem internet?). Gráficos ficam vazios.');
        return;
    }
    Chart.defaults.font.family = "'Segoe UI', sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = '#374151';

    const m = metricasCarregadas || {};

    // Donut: status das contas
    const ativos = m.clientes_ativos || 0;
    const bloq = m.clientes_bloqueados || 0;
    destruirChart(chartStatus);
    const ctxStatus = document.getElementById('chart-status');
    if (ctxStatus) {
        chartStatus = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Ativas', 'Bloqueadas'],
                datasets: [{ data: [ativos, bloq], backgroundColor: ['#16a34a', '#dc2626'], borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    // Bar: clientes ativos por UF
    const ufs = (m.por_uf || []).slice(0, 8);
    destruirChart(chartUf);
    const ctxUf = document.getElementById('chart-uf');
    if (ctxUf) {
        chartUf = new Chart(ctxUf, {
            type: 'bar',
            data: {
                labels: ufs.map((u) => u.uf),
                datasets: [{ label: 'Clientes ativos', data: ufs.map((u) => u.qtd), backgroundColor: '#0078d4', borderRadius: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    // Bar: distribuição de empresas por faixa de plano
    const faixas = { 'Até R$ 99': 0, 'R$ 100–299': 0, 'R$ 300–599': 0, 'R$ 600–999': 0, 'R$ 1000+': 0 };
    empresasCarregadas.forEach((e) => {
        if (e.status !== 'ativo') return;
        const v = parseFloat(e.valor_plano || 0);
        if (v <= 99) faixas['Até R$ 99']++;
        else if (v <= 299) faixas['R$ 100–299']++;
        else if (v <= 599) faixas['R$ 300–599']++;
        else if (v <= 999) faixas['R$ 600–999']++;
        else faixas['R$ 1000+']++;
    });
    destruirChart(chartPlano);
    const ctxPlano = document.getElementById('chart-plano');
    if (ctxPlano) {
        chartPlano = new Chart(ctxPlano, {
            type: 'bar',
            data: {
                labels: Object.keys(faixas),
                datasets: [{ label: 'Contas ativas', data: Object.values(faixas), backgroundColor: '#f2c811', borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    // Lista de vencimentos próximos (próximas 30 dias)
    renderizarListaVencimentos();
}

function renderizarListaVencimentos() {
    const div = document.getElementById('lista-vencimentos');
    if (!div) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const lim = new Date(hoje); lim.setDate(lim.getDate() + 30);
    const lista = empresasCarregadas
        .filter((e) => e.status === 'ativo' && e.data_vencimento)
        .map((e) => ({ ...e, _venc: new Date(e.data_vencimento) }))
        .filter((e) => !isNaN(e._venc) && e._venc >= hoje && e._venc <= lim)
        .sort((a, b) => a._venc - b._venc)
        .slice(0, 8);

    if (lista.length === 0) { div.className = 'tile-empty'; div.innerText = 'Sem vencimentos nos próximos 30 dias.'; return; }
    div.className = '';
    div.innerHTML = lista.map((e) => {
        const dias = Math.round((e._venc - hoje) / 86400000);
        const cor = dias <= 7 ? 'var(--pbi-danger)' : dias <= 15 ? 'var(--pbi-warn)' : 'var(--pbi-text-muted)';
        return `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f3f5;">
            <span style="font-weight:600;">${e.nome}</span>
            <span style="color:${cor}; font-weight:700;">${dias}d</span>
        </div>`;
    }).join('');
}

// ---------- Datagrid de Clientes ----------

function renderizarFiltrosUF() {
    const sel = document.getElementById('filtro-uf');
    if (!sel) return;
    const atual = sel.value;
    const ufs = Array.from(new Set(empresasCarregadas.map((e) => (e.uf || '').toUpperCase()).filter(Boolean))).sort();
    sel.innerHTML = '<option value="">Todas as UFs</option>' + ufs.map((u) => `<option value="${u}">${u}</option>`).join('');
    if (ufs.includes(atual)) sel.value = atual;
}

function renderizarDatagrid() {
    const tbody = document.getElementById('lista-empresas');
    if (!tbody) return;
    const busca = (document.getElementById('filtro-busca')?.value || '').trim().toLowerCase();
    const fStatus = document.getElementById('filtro-status')?.value || '';
    const fUf = (document.getElementById('filtro-uf')?.value || '').toUpperCase();

    const filtrados = empresasCarregadas.filter((e) => {
        if (fStatus && e.status !== fStatus) return false;
        if (fUf && (e.uf || '').toUpperCase() !== fUf) return false;
        if (busca) {
            const alvo = `${e.nome || ''} ${e.documento || ''} ${e.acesso_email || ''}`.toLowerCase();
            if (!alvo.includes(busca)) return false;
        }
        return true;
    });

    const resumo = document.getElementById('datagrid-resumo');
    if (resumo) resumo.innerText = `${filtrados.length} de ${empresasCarregadas.length} contas`;

    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--pbi-text-muted);">Nenhuma conta encontrada.</td></tr>';
        return;
    }

    tbody.innerHTML = filtrados.map((emp) => {
        const isAtivo = emp.status === 'ativo';
        const docFmt = window.DocValidator ? window.DocValidator.formatarDocumento(emp.documento) : (emp.documento || '');
        const cidadeUf = [emp.cidade, (emp.uf || '').toUpperCase()].filter(Boolean).join(' / ');
        const valor = emp.valor_plano ? fmtBRLcent(emp.valor_plano) : 'R$ 0,00';
        const venc = fmtData(emp.data_vencimento);
        const badge = isAtivo
            ? '<span class="badge badge-success">🟢 Ativa</span>'
            : '<span class="badge badge-danger">🔴 Bloqueada</span>';
        const btnStatus = isAtivo
            ? `<button class="btn-mini btn-danger" onclick="alterarStatus(${emp.id}, 'bloqueado')">Bloquear</button>`
            : `<button class="btn-mini btn-success" onclick="alterarStatus(${emp.id}, 'ativo')">Reativar</button>`;
        return `<tr>
            <td><strong style="color:${emp.cor1 || '#0078d4'};">${emp.nome || '—'}</strong></td>
            <td><code>${docFmt}</code></td>
            <td>${cidadeUf || '—'}</td>
            <td>${valor}</td>
            <td>${venc}</td>
            <td>${badge}</td>
            <td>
                <button class="btn-mini btn-warn" onclick="logarComoCliente(${emp.id})">👁️ Painel</button>
                <button class="btn-mini btn-primary" onclick="iniciarEdicao(${emp.id}); trocarAba('clientes');">✏️ Editar</button>
                ${btnStatus}
            </td>
        </tr>`;
    }).join('');
}

// ---------- Painel Financeiro ----------

function renderizarFinanceiro() {
    const m = metricasCarregadas || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.innerText = v; };

    const mrr = Number(m.receita || 0);
    const bruta = Number(m.receita_bruta || 0);
    const perdida = Math.max(0, bruta - mrr);
    const ativos = Number(m.clientes_ativos || 0);
    const ticket = ativos > 0 ? mrr / ativos : 0;

    set('fin-mrr', fmtBRL(mrr));
    set('fin-bruta', fmtBRL(bruta));
    set('fin-ticket', fmtBRLcent(ticket));
    set('fin-perdida', fmtBRL(perdida));

    if (typeof Chart !== 'undefined') {
        destruirChart(chartReceitaStatus);
        const c1 = document.getElementById('chart-receita-status');
        if (c1) {
            chartReceitaStatus = new Chart(c1, {
                type: 'bar',
                data: {
                    labels: ['Ativos (entra no caixa)', 'Bloqueados (perdida)'],
                    datasets: [{ data: [mrr, perdida], backgroundColor: ['#16a34a', '#dc2626'], borderRadius: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtBRL(v) } } }
                }
            });
        }

        // Vencimentos por mês (próximos 6 meses)
        const buckets = {};
        const hoje = new Date();
        for (let i = 0; i < 6; i++) {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
            const k = `${d.getMonth() + 1}/${d.getFullYear()}`;
            buckets[k] = 0;
        }
        empresasCarregadas.forEach((e) => {
            if (!e.data_vencimento || e.status !== 'ativo') return;
            const d = new Date(e.data_vencimento);
            if (isNaN(d)) return;
            const k = `${d.getMonth() + 1}/${d.getFullYear()}`;
            if (k in buckets) buckets[k] += parseFloat(e.valor_plano || 0);
        });
        destruirChart(chartVencMes);
        const c2 = document.getElementById('chart-venc-mes');
        if (c2) {
            chartVencMes = new Chart(c2, {
                type: 'line',
                data: {
                    labels: Object.keys(buckets),
                    datasets: [{ label: 'A receber', data: Object.values(buckets), borderColor: '#0078d4', backgroundColor: 'rgba(0,120,212,0.15)', fill: true, tension: 0.3, borderWidth: 2 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { callback: (v) => fmtBRL(v) } } }
                }
            });
        }
    }

    // Top 10
    const top = empresasCarregadas
        .map((e) => ({ ...e, _v: parseFloat(e.valor_plano || 0) }))
        .sort((a, b) => b._v - a._v)
        .slice(0, 10);
    const tb = document.getElementById('top10-empresas');
    if (tb) {
        tb.innerHTML = top.length === 0
            ? '<tr><td colspan="5" style="text-align:center; padding:18px; color:var(--pbi-text-muted);">Sem dados.</td></tr>'
            : top.map((e) => {
                const docFmt = window.DocValidator ? window.DocValidator.formatarDocumento(e.documento) : (e.documento || '');
                const badge = e.status === 'ativo' ? '<span class="badge badge-success">🟢</span>' : '<span class="badge badge-danger">🔴</span>';
                return `<tr>
                    <td><strong>${e.nome || '—'}</strong></td>
                    <td><code>${docFmt}</code></td>
                    <td>${badge}</td>
                    <td style="text-align:right; font-weight:700;">${fmtBRLcent(e._v)}</td>
                    <td>${fmtData(e.data_vencimento)}</td>
                </tr>`;
            }).join('');
    }
}

// ---------- Validação CPF/CNPJ no formulário ----------

function onInputDocumento() {
    const el = document.getElementById('emp-documento');
    const erro = document.getElementById('erro-documento');
    if (!el) return;
    el.classList.remove('valid', 'invalid');
    if (erro) { erro.classList.remove('show'); erro.innerText = ''; }
}

function onBlurDocumento() {
    const el = document.getElementById('emp-documento');
    const erro = document.getElementById('erro-documento');
    if (!el) return;
    const valor = (el.value || '').trim();
    if (!valor) return;

    const v = window.DocValidator ? window.DocValidator.validarDocumento(valor) : { ok: true, msg: '' };
    if (!v.ok) {
        el.classList.remove('valid'); el.classList.add('invalid');
        if (erro) { erro.innerText = v.msg; erro.classList.add('show'); }
        return;
    }
    el.classList.remove('invalid'); el.classList.add('valid');
    if (erro) { erro.classList.remove('show'); }

    if (window.DocValidator) {
        const norm = window.DocValidator.somenteDigitos(valor);
        el.value = window.DocValidator.formatarDocumento(norm);

        // Anti-duplicidade local: se já existe na lista de empresas carregadas
        // E não estamos editando essa mesma, avisa o operador antes de o
        // POST devolver 409.
        if (!idEmpresaEditando) {
            const dup = empresasCarregadas.find((e) => (e.documento || '').replace(/\D/g, '') === norm);
            if (dup) {
                el.classList.remove('valid'); el.classList.add('invalid');
                if (erro) {
                    erro.innerText = `Documento já cadastrado para "${dup.nome}". Clique em ✏️ Editar nessa conta.`;
                    erro.classList.add('show');
                }
            }
        }
    }
    buscarDocumento();
}

async function buscarCep() {
    const el = document.getElementById('emp-cep'); if (!el) return;
    const cep = el.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const dados = await r.json();
        if (dados.erro) return;
        const setV = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
        setV('emp-rua', dados.logradouro || '');
        setV('emp-bairro', dados.bairro || '');
        setV('emp-cidade', dados.localidade || '');
        setV('emp-uf', dados.uf || '');
        const num = document.getElementById('emp-numero'); if (num) num.focus();
    } catch (e) { /* offline / cep inválido */ }
}

async function buscarDocumento() {
    const el = document.getElementById('emp-documento'); if (!el) return;
    const doc = el.value.replace(/\D/g, '');
    if (doc.length !== 14) return;
    try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
        if (!r.ok) return;
        const dados = await r.json();
        const elNome = document.getElementById('emp-nome');
        if (elNome && !elNome.value) elNome.value = dados.razao_social || dados.nome_fantasia || '';
        if (dados.cep) {
            const elCep = document.getElementById('emp-cep');
            if (elCep && !elCep.value) { elCep.value = String(dados.cep).replace(/\D/g, ''); buscarCep(); }
        }
    } catch (e) { /* offline / cnpj inexistente */ }
}

// ---------- CRUD ----------

function toggleSenha(inputId, btn) {
    const campo = document.getElementById(inputId);
    if (!campo) return;
    if (campo.type === 'password') { campo.type = 'text'; btn.innerText = '🙈'; }
    else { campo.type = 'password'; btn.innerText = '👁️'; }
}

function iniciarEdicao(id) {
    const emp = empresasCarregadas.find((e) => e.id === id);
    if (!emp) return;
    idEmpresaEditando = id;
    const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };

    const tit = document.getElementById('titulo-form'); if (tit) tit.innerText = '✏️ Editando: ' + emp.nome;
    const docFmt = window.DocValidator ? window.DocValidator.formatarDocumento(emp.documento) : (emp.documento || '');
    setVal('emp-documento', docFmt);
    const docEl = document.getElementById('emp-documento'); if (docEl) docEl.disabled = true;

    setVal('emp-nome', emp.nome); setVal('emp-cep', emp.cep || ''); setVal('emp-rua', emp.rua || '');
    setVal('emp-numero', emp.numero || ''); setVal('emp-complemento', emp.complemento || '');
    setVal('emp-bairro', emp.bairro || ''); setVal('emp-cidade', emp.cidade || ''); setVal('emp-uf', emp.uf || '');

    setVal('emp-limite-usuarios', emp.limite_usuarios || 3);
    setVal('emp-limite-motoristas', emp.limite_motoristas || 5);
    setVal('emp-limite-veiculos', emp.limite_veiculos || 5);
    setVal('emp-limite-bases', emp.limite_bases || 1);
    setVal('emp-valor-plano', emp.valor_plano || '');
    setVal('emp-vencimento', emp.data_vencimento ? emp.data_vencimento.split('T')[0] : '');
    setVal('emp-cor1', emp.cor1 || '#0078d4');
    setVal('emp-cor2', emp.cor2 || '#f2c811');

    const aviso = document.getElementById('aviso-logo'); if (aviso) aviso.style.display = 'block';

    setVal('emp-usuario', emp.acesso_usuario || ''); setVal('emp-email', emp.acesso_email || '');
    setVal('emp-senha', '');
    setVal('emp-status', emp.status || 'ativo');
    setVal('emp-programa-parceiros', emp.programa_parceiros || 'inativo');
    setVal('emp-auditoria-peso', emp.auditoria_cargas || 'sim');
    setVal('emp-api-mapas', emp.api_mapas || '');

    const btnS = document.getElementById('btn-salvar'); if (btnS) btnS.innerText = '💾 Salvar Alterações';
    const btnC = document.getElementById('btn-cancelar'); if (btnC) btnC.style.display = 'inline-block';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicao() {
    idEmpresaEditando = null;
    const form = document.getElementById('form-empresa'); if (form) form.reset();
    const tit = document.getElementById('titulo-form'); if (tit) tit.innerText = '🏢 Cadastrar Nova Assinatura';
    const docEl = document.getElementById('emp-documento'); if (docEl) { docEl.disabled = false; docEl.classList.remove('valid', 'invalid'); }
    const erro = document.getElementById('erro-documento'); if (erro) { erro.classList.remove('show'); erro.innerText = ''; }
    const aviso = document.getElementById('aviso-logo'); if (aviso) aviso.style.display = 'none';
    const btnS = document.getElementById('btn-salvar'); if (btnS) btnS.innerText = '💾 Registrar Cliente';
    const btnC = document.getElementById('btn-cancelar'); if (btnC) btnC.style.display = 'none';
    const msg = document.getElementById('msg-alerta'); if (msg) { msg.classList.remove('show', 'alert-success', 'alert-error'); msg.innerText = ''; }
}

function mostrarAlerta(tipo, texto) {
    const msg = document.getElementById('msg-alerta');
    if (!msg) { alert(texto); return; }
    msg.classList.remove('alert-success', 'alert-error');
    msg.classList.add('show', tipo === 'ok' ? 'alert-success' : 'alert-error');
    msg.innerText = texto;
    setTimeout(() => { msg.classList.remove('show'); }, 6000);
}

async function alterarStatus(id, novoStatus) {
    if (!confirm(`Alterar status para "${novoStatus}"?`)) return;
    try {
        await apiFetch(`/api/empresas/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus })
        });
        await Promise.all([carregarMetricas(), carregarEmpresas(), carregarBasesAtivas()]);
        renderizarTudo();
    } catch (e) { alert('Erro ao alterar status.'); }
}

async function logarComoCliente(id) {
    const empresaId = Number(id);
    if (!empresaId) return alert('ID inválido.');
    let t = (localStorage.getItem('auth_token') || '').trim();
    if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
    if (!t) {
        alert('Sessão Master expirada. Faça login novamente.');
        window.location.href = '/master/index.html';
        return;
    }
    const tokenMasterBackup = t;
    try {
        const res = await fetch('/api/login/emitir-token-empresa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
            body: JSON.stringify({ empresa_id: empresaId })
        });
        const dados = await res.json();
        if (!res.ok) {
            alert(dados.erro || 'Não foi possível abrir o painel do cliente.');
            return;
        }
        try { sessionStorage.setItem('rota_plus_master_token_backup', tokenMasterBackup); } catch (e) {}
        localStorage.setItem('auth_token', dados.token);
        localStorage.setItem('dados_empresa', JSON.stringify(dados.empresa));
        const pop = window.open('/empresa/painel.html', '_blank');
        if (!pop || pop.closed) {
            alert('O navegador bloqueou a aba. Permita pop-ups ou abra /empresa/painel.html manualmente.');
        }
    } catch (e) { alert('Erro de conexão.'); }
}

async function salvarEmpresa() {
    // Validação client-side de CPF/CNPJ ANTES do POST. O servidor revalida
    // (defesa em profundidade), mas avisar aqui evita uma viagem ao backend.
    const docEl = document.getElementById('emp-documento');
    const docVal = docEl ? docEl.value : '';
    if (!idEmpresaEditando) {
        const v = window.DocValidator ? window.DocValidator.validarDocumento(docVal) : { ok: true };
        if (!v.ok) {
            mostrarAlerta('err', v.msg);
            if (docEl) { docEl.classList.add('invalid'); docEl.focus(); }
            return;
        }
    }

    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const formData = new FormData();
    const docNorm = window.DocValidator ? window.DocValidator.somenteDigitos(docVal) : docVal;

    formData.append('nome', getVal('emp-nome'));
    formData.append('documento', docNorm);
    formData.append('cep', getVal('emp-cep'));
    formData.append('rua', getVal('emp-rua'));
    formData.append('numero', getVal('emp-numero'));
    formData.append('complemento', getVal('emp-complemento'));
    formData.append('bairro', getVal('emp-bairro'));
    formData.append('cidade', getVal('emp-cidade'));
    formData.append('uf', getVal('emp-uf'));
    formData.append('cor1', getVal('emp-cor1'));
    formData.append('cor2', getVal('emp-cor2'));
    formData.append('acesso_usuario', getVal('emp-usuario'));
    formData.append('acesso_email', getVal('emp-email'));
    formData.append('acesso_senha', getVal('emp-senha'));
    formData.append('status', getVal('emp-status'));
    formData.append('programa_parceiros', getVal('emp-programa-parceiros'));
    formData.append('exigir_peso', getVal('emp-auditoria-peso'));
    formData.append('limite_usuarios', getVal('emp-limite-usuarios') || 3);
    formData.append('limite_motoristas', getVal('emp-limite-motoristas') || 5);
    formData.append('limite_veiculos', getVal('emp-limite-veiculos') || 5);
    formData.append('limite_bases', getVal('emp-limite-bases') || 1);
    formData.append('valor_plano', getVal('emp-valor-plano') || 0);
    formData.append('data_vencimento', getVal('emp-vencimento') || '');
    formData.append('api_mapas', getVal('emp-api-mapas'));

    const inputArquivo = document.getElementById('emp-logo');
    if (inputArquivo && inputArquivo.files.length > 0) formData.append('logo', inputArquivo.files[0]);

    const idNum = idEmpresaEditando != null ? Number(idEmpresaEditando) : null;
    const urlFinal = idNum ? `/api/empresas/${idNum}` : '/api/empresas';
    const metodoFinal = idNum ? 'PUT' : 'POST';

    try {
        const resposta = await apiFetch(urlFinal, { method: metodoFinal, body: formData });
        if (resposta.ok) {
            mostrarAlerta('ok', idNum ? 'Conta atualizada com sucesso.' : 'Conta cadastrada. Base default em criação no servidor.');
            cancelarEdicao();
            await Promise.all([carregarMetricas(), carregarEmpresas(), carregarBasesAtivas()]);
            renderizarTudo();
            return;
        }
        let msg = `Erro HTTP ${resposta.status}`;
        try { const j = await resposta.json(); if (j.erro) msg = j.erro; } catch (e) {}
        mostrarAlerta('err', msg);
        if (resposta.status === 409 && docEl) { docEl.classList.add('invalid'); docEl.focus(); }
    } catch (erro) {
        mostrarAlerta('err', 'Erro de conexão ao salvar. Verifique se o servidor está no ar.');
    }
}
