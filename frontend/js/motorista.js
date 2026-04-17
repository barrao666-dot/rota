/* ===== Rota++ Motorista — PWA SPA =====
 * Fluxo obrigatório:  Home → Detail → Active
 *   - Home (#/)             : mapa + lista de rotas do dia
 *   - Detail (#/rota/:turno) : paradas + botão "Iniciar Rota"
 *   - Active (#/viagem/:turno): viagem ativa com cronômetros
 *
 * Otimizações PWA:
 *   - watchPosition enableHighAccuracy=true (apenas na view Active)
 *   - Screen Wake Lock (apenas na view Active)
 *   - document.visibilitychange: banner quando app em background
 *   - Reconexão automática do GPS e do WakeLock
 */

(function () {
    'use strict';

    // ===== Estado global =====
    let empresaId = 1;
    let ORS_KEY = '';
    let LOJA_COORDS = null; // [lng, lat]
    let bancoDadosCompleto = { entregas: [] };
    let hashAnterior = '';
    let syncInFlight = false;

    // Instâncias Leaflet (uma por view pra evitar "containers compartilhados")
    let mapHome = null, mapDetail = null, mapActive = null;
    let layersHome = [], layersDetail = [], layersActive = [];
    let layerLinhaDetail = null, layerLinhaActive = null;

    // GPS
    let gpsWatchId = null;
    let gpsLastLatLng = null;
    let gpsLastVelocidade = null;
    let gpsLastPrecisao = null;
    let gpsMarkerHome = null, gpsMarkerActive = null;
    let gpsPostTimer = null;

    // Detecção de paradas novas inseridas pelo painel durante a viagem.
    // Guardamos os IDs conhecidos após o 1º sync; quando um ID novo entra
    // numa rota do dia enquanto Active, disparamos o popup.
    let idsConhecidos = null;

    // WakeLock
    let wakeLockSentinel = null;

    // Rota ativa (view corrente + parâmetros)
    let currentView = 'home';
    let currentRouteKey = null; // { turno, data }

    // ===== Helpers =====
    const el = {
        topbar: () => document.getElementById('topbar'),
        topTitle: () => document.getElementById('topbar-title'),
        topSub: () => document.getElementById('topbar-subtitle'),
        btnBack: () => document.getElementById('btn-back'),
        syncPill: () => document.getElementById('sync-pill'),
        viewHome: () => document.getElementById('view-home'),
        viewDetail: () => document.getElementById('view-detail'),
        viewActive: () => document.getElementById('view-active'),
        sheetTitulo: () => document.getElementById('sheet-titulo'),
        sheetSub: () => document.getElementById('sheet-sub'),
        listaRotas: () => document.getElementById('lista-rotas'),
        detailTit: () => document.getElementById('detail-titulo'),
        detailSub: () => document.getElementById('detail-sub'),
        detailParadas: () => document.getElementById('detail-paradas'),
        btnIniciar: () => document.getElementById('btn-iniciar-rota'),
        activeTit: () => document.getElementById('active-titulo'),
        activeSub: () => document.getElementById('active-sub'),
        listaAtivas: () => document.getElementById('lista-paradas-ativas'),
        banner: () => document.getElementById('active-banner'),
        loading: () => document.getElementById('loading-overlay'),
        loadingText: () => document.getElementById('loading-text'),
        toast: () => document.getElementById('toast')
    };

    function getToday() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function formatarDataBr(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '';
    }
    function horaAgoraHHMM() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    function showLoading(texto) {
        el.loadingText().innerText = texto || 'Carregando...';
        el.loading().classList.add('show');
    }
    function hideLoading() {
        el.loading().classList.remove('show');
    }

    let toastTimer = null;
    function toast(mensagem, tipo) {
        const t = el.toast();
        t.innerText = mensagem;
        t.classList.toggle('err', tipo === 'err');
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    }

    // Popup de paradas inseridas pelo painel durante a viagem ativa.
    // Mostra um modal bloqueante (o motorista PRECISA ver), vibra o
    // dispositivo e toca um beep leve se o áudio estiver habilitado.
    function notificarParadasNovas(paradas) {
        try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]); } catch (_) {}
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC && !window.__motoristaAcBlocked) {
                const ac = new AC();
                const o = ac.createOscillator();
                const g = ac.createGain();
                o.type = 'sine'; o.frequency.value = 880;
                o.connect(g); g.connect(ac.destination);
                g.gain.setValueAtTime(0.15, ac.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
                o.start(); o.stop(ac.currentTime + 0.6);
                setTimeout(() => { try { ac.close(); } catch (_) {} }, 800);
            }
        } catch (_) { window.__motoristaAcBlocked = true; }

        const overlay = document.createElement('div');
        overlay.className = 'parada-nova-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        const tituloSingular = paradas.length === 1 ? 'Nova parada inserida' : `${paradas.length} novas paradas inseridas`;
        const itensHtml = paradas.map((p) => `
            <li>
                <strong>${escapeHtml(p.nomeCliente || 'Cliente')}</strong>
                <span>${escapeHtml(p.endereco || '-')}</span>
                <span class="badge">Ordem ${p.ordem ?? '-'} • ${p.periodo === 'manha' ? 'Manhã' : 'Tarde'}</span>
            </li>
        `).join('');
        overlay.innerHTML = `
            <div class="parada-nova-modal" tabindex="-1">
                <div class="parada-nova-header">
                    <span class="icone">🆕</span>
                    <h2>${escapeHtml(tituloSingular)}</h2>
                </div>
                <p class="parada-nova-sub">O despachante acabou de acrescentar ${paradas.length === 1 ? 'esta parada' : 'estas paradas'} à sua rota em andamento. Confira os detalhes abaixo.</p>
                <ul class="parada-nova-lista">${itensHtml}</ul>
                <button type="button" class="btn-primary-xl" data-acao="confirmar">Entendi, vou considerar</button>
            </div>
        `;
        document.body.appendChild(overlay);
        const fechar = () => { overlay.remove(); };
        overlay.querySelector('[data-acao="confirmar"]').addEventListener('click', fechar);
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) fechar(); });
        setTimeout(() => { try { overlay.querySelector('.parada-nova-modal').focus(); } catch (_) {} }, 60);
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ===== Config da empresa (base, API Key, etc) =====
    function prepareConfig() {
        const raw = localStorage.getItem('dados_empresa');
        if (!raw) return;
        try {
            const emp = JSON.parse(raw);
            empresaId = Number(emp.id || emp.empresa_id || 1);
            ORS_KEY = (emp.api_mapas || '').trim();
            const lat = parseFloat(emp.base_lat || emp.lat);
            const lng = parseFloat(emp.base_lng || emp.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) LOJA_COORDS = [lng, lat];
        } catch (err) {
            console.warn('[motorista] dados_empresa inválido:', err);
        }
    }

    async function syncEmpresa() {
        try {
            const dados = await apiFetchJson('/api/empresas/me');
            if (!dados || !dados.empresa) return;
            localStorage.setItem('dados_empresa', JSON.stringify(dados.empresa));
            prepareConfig();
            // Base via /api/bases caso a empresa tenha uma cadastrada
            try {
                const bases = await apiFetchJson(`/api/bases/${empresaId}`);
                const ativa = Array.isArray(bases) ? bases.find((b) => b.ativa == 1 || b.ativa === true) || bases[0] : null;
                if (ativa) {
                    const lat = parseFloat(ativa.lat);
                    const lng = parseFloat(ativa.lng);
                    if (Number.isFinite(lat) && Number.isFinite(lng)) LOJA_COORDS = [lng, lat];
                }
            } catch (_) {}
        } catch (_) {}
    }

    // ===== Router =====
    function parseRoute() {
        // #/                  → home
        // #/rota/manha        → detail
        // #/viagem/manha      → active
        const h = (window.location.hash || '#/').replace(/^#/, '');
        const parts = h.split('/').filter(Boolean);
        if (parts.length === 0) return { name: 'home' };
        if (parts[0] === 'rota' && parts[1]) return { name: 'detail', turno: parts[1], data: parts[2] || getToday() };
        if (parts[0] === 'viagem' && parts[1]) return { name: 'active', turno: parts[1], data: parts[2] || getToday() };
        return { name: 'home' };
    }

    function goto(hash) { window.location.hash = hash; }

    function setView(name) {
        currentView = name;
        el.viewHome().classList.toggle('hidden', name !== 'home');
        el.viewDetail().classList.toggle('hidden', name !== 'detail');
        el.viewActive().classList.toggle('hidden', name !== 'active');
        el.topbar().classList.toggle('show-back', name !== 'home');
        // Acerta topbar
        if (name === 'home') {
            el.topTitle().innerText = 'Rota++ Motorista';
            el.topSub().innerText = 'Selecione uma rota do dia';
        } else if (name === 'detail') {
            el.topTitle().innerText = 'Detalhes da Rota';
            el.topSub().innerText = 'Confira paradas antes de iniciar';
        } else if (name === 'active') {
            el.topTitle().innerText = 'Viagem ativa';
            el.topSub().innerText = 'GPS ativo · Tela ligada';
        }
        // Trigger invalidateSize quando a view vira visível
        setTimeout(() => {
            if (name === 'home' && mapHome) mapHome.invalidateSize();
            if (name === 'detail' && mapDetail) mapDetail.invalidateSize();
            if (name === 'active' && mapActive) mapActive.invalidateSize();
        }, 50);
    }

    function applyRoute() {
        const r = parseRoute();
        currentRouteKey = r.name === 'home' ? null : { turno: r.turno, data: r.data };

        // GPS é mantido ligado em todas as views enquanto o motorista
        // estiver logado — assim o painel de rotas consegue acompanhar
        // o veículo mesmo antes do motorista iniciar a rota. WakeLock,
        // esse sim, só durante a view Active (viagem real em andamento).
        startGpsWatch();

        if (r.name === 'home') {
            setView('home');
            renderHome();
            releaseWakeLock();
        } else if (r.name === 'detail') {
            setView('detail');
            renderDetail(r.turno, r.data);
            releaseWakeLock();
        } else if (r.name === 'active') {
            setView('active');
            renderActive(r.turno, r.data);
            acquireWakeLock();
        }
    }

    // ===== Sincronização =====
    async function syncBackground(opts) {
        opts = opts || {};
        if (syncInFlight || !localStorage.getItem('auth_token')) return;
        syncInFlight = true;
        el.syncPill().classList.remove('ok', 'offline');
        el.syncPill().innerText = '⟳ Sync';

        try {
            const resp = await apiFetch(`/api/coletas/${empresaId}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();

            const mapeadas = data
                .filter((e) => e.status !== 'modelo')
                .map((e) => ({
                    id: Number(e.id),
                    nomeCliente: e.fornecedor,
                    endereco: e.endereco,
                    dataEntrega: e.data_entrega ? e.data_entrega.substring(0, 10) : getToday(),
                    periodo: e.periodo || 'manha',
                    ordem: Number(e.ordem) || null,
                    status: e.status || 'pendente',
                    coords: Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)) ? [Number(e.lng), Number(e.lat)] : null,
                    tempoViagem: e.tempo_viagem,
                    distanciaTrecho: e.distancia_km,
                    corIcone: e.cor_icone,
                    tamanho: e.tamanho,
                    tempoViagemReal: e.tempo_viagem_real,
                    tempoNoLocalReal: e.tempo_no_local_real,
                    horaPartida: e.hora_partida,
                    horaChegada: e.hora_chegada,
                    horaConclusao: e.hora_conclusao,
                    horaPrevista: e.hora_prevista || null,
                    specs: {
                        peso: parseFloat(e.peso) || 0,
                        a: parseFloat(e.altura) || 0,
                        l: parseFloat(e.largura) || 0,
                        c: parseFloat(e.comprimento) || 0,
                        tempoServico: e.tempo_medio || 600
                    }
                }));

            // Detecta paradas inseridas DURANTE a viagem — compara com o set
            // de IDs conhecidos do último sync. Se estamos em Active e uma
            // nova parada caiu na rota ativa, dispara popup + vibração.
            const novosIds = new Set(mapeadas.filter((e) => e.ordem > 0).map((e) => e.id));
            if (idsConhecidos instanceof Set && currentView === 'active' && currentRouteKey) {
                const aparecidas = mapeadas.filter((e) =>
                    e.ordem > 0
                    && e.dataEntrega === currentRouteKey.data
                    && e.periodo === currentRouteKey.turno
                    && e.status !== 'concluida'
                    && !idsConhecidos.has(e.id)
                );
                if (aparecidas.length > 0) {
                    notificarParadasNovas(aparecidas);
                }
            }
            idsConhecidos = novosIds;

            bancoDadosCompleto.entregas = mapeadas;

            el.syncPill().classList.add('ok');
            el.syncPill().innerText = `🟢 ${horaAgoraHHMM()}`;

            // Re-renderiza a view corrente
            if (currentView === 'home') renderHome();
            else if (currentView === 'detail' && currentRouteKey) renderDetail(currentRouteKey.turno, currentRouteKey.data);
            else if (currentView === 'active' && currentRouteKey) renderActive(currentRouteKey.turno, currentRouteKey.data);
        } catch (err) {
            console.warn('[motorista] sync falhou', err);
            el.syncPill().classList.add('offline');
            el.syncPill().innerText = '🔴 Offline';
        } finally {
            syncInFlight = false;
        }
    }

    // ===== Compose rotas do dia =====
    function paradasDaRota(data, turno) {
        return bancoDadosCompleto.entregas
            .filter((p) => p.dataEntrega === data && p.periodo === turno && (p.ordem > 0 || p.status === 'concluida'))
            .sort((a, b) => (a.ordem || 999) - (b.ordem || 999));
    }

    function calcularStatusRota(paradas) {
        if (paradas.length === 0) return 'sem-paradas';
        const todasConcluidas = paradas.every((p) => p.status === 'concluida');
        if (todasConcluidas) return 'concluida';
        const algumaAtiva = paradas.some((p) => p.status === 'em_transito' || p.status === 'em_atendimento');
        if (algumaAtiva) return 'iniciada';
        return 'pendente';
    }

    function rotasDoDia(data) {
        return ['manha', 'tarde']
            .map((turno) => {
                const paradas = paradasDaRota(data, turno);
                const status = calcularStatusRota(paradas);
                if (status === 'sem-paradas') return null;
                const totalPeso = paradas.reduce((acc, p) => acc + (p.specs?.peso || 0), 0);
                const totalKm = paradas.reduce((acc, p) => acc + (parseFloat(p.distanciaTrecho) || 0), 0);
                const totalMin = paradas.reduce((acc, p) => acc + (Number(p.tempoViagem) || 0) + Math.round((p.specs?.tempoServico || 600) / 60), 0);
                return {
                    turno, data, status, paradas,
                    totalPeso, totalKm, totalMin,
                    horaPrimeira: paradas[0]?.horaPrevista || null
                };
            })
            .filter(Boolean);
    }

    // ===== HOME =====
    function initMapHome() {
        if (mapHome) return;
        const defaultCenter = [LOJA_COORDS ? LOJA_COORDS[1] : -14.235, LOJA_COORDS ? LOJA_COORDS[0] : -51.925];
        mapHome = L.map('map-home', { zoomControl: false, attributionControl: false }).setView(defaultCenter, LOJA_COORDS ? 12 : 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapHome);
        document.getElementById('btn-recentrar-home').addEventListener('click', () => centralizarUsuario(mapHome));
    }

    function renderHome() {
        const hoje = getToday();
        const rotas = rotasDoDia(hoje);

        el.sheetTitulo().innerText = `📅 ${formatarDataBr(hoje)} — Rotas do dia`;
        el.sheetSub().innerText = rotas.length === 0
            ? 'Nenhuma rota liberada pela base.'
            : `${rotas.length} rota${rotas.length > 1 ? 's' : ''} liberada${rotas.length > 1 ? 's' : ''}. Toque para ver detalhes.`;

        const listaEl = el.listaRotas();
        if (rotas.length === 0) {
            listaEl.innerHTML = `
                <div class="empty-state">
                    <div style="font-size: 44px;">📭</div>
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">Sem rotas para hoje</div>
                    <div>Aguarde a base liberar a rota do dia.<br>O app atualiza automaticamente a cada 8s.</div>
                </div>`;
        } else {
            listaEl.innerHTML = rotas.map(rotaCardHtml).join('');
            listaEl.querySelectorAll('[data-go]').forEach((btn) => {
                btn.addEventListener('click', () => goto(btn.getAttribute('data-go')));
            });
        }

        initMapHome();
        setTimeout(() => { if (mapHome) mapHome.invalidateSize(); }, 80);
        renderMapaPinsHome(rotas);
    }

    function rotaCardHtml(r) {
        const icone = r.turno === 'manha' ? '☀️' : '🌙';
        const titulo = r.turno === 'manha' ? 'Rota da Manhã' : 'Rota da Tarde';
        const badge = r.status === 'concluida' ? 'Concluída' : r.status === 'iniciada' ? 'Em andamento' : 'Pendente';
        const ctaTexto = r.status === 'iniciada' ? '▶️ Continuar viagem' : r.status === 'concluida' ? '📄 Ver resumo' : '🔍 Ver detalhes';
        const ctaClass = r.status === 'iniciada' ? 'success' : r.status === 'concluida' ? '' : 'primary';
        const destino = r.status === 'iniciada'
            ? `#/viagem/${r.turno}/${r.data}`   // retomar direto
            : `#/rota/${r.turno}/${r.data}`;    // sempre passar por detail pra status pendente
        return `
            <div class="rota-card" data-turno="${r.turno}">
                <div class="rc-head">
                    <div class="rc-titulo">${icone} ${titulo}</div>
                    <span class="rc-badge ${r.status}">${badge}</span>
                </div>
                <div class="rc-stats">
                    <div class="rc-stat"><b>${r.paradas.length}</b><span>Paradas</span></div>
                    <div class="rc-stat"><b>${r.totalKm.toFixed(1)} km</b><span>Distância</span></div>
                    <div class="rc-stat"><b>${r.horaPrimeira || '—'}</b><span>Início</span></div>
                </div>
                <button class="rc-action ${ctaClass}" data-go="${destino}">${ctaTexto}</button>
            </div>
        `;
    }

    function renderMapaPinsHome(rotas) {
        if (!mapHome) return;
        layersHome.forEach((l) => mapHome.removeLayer(l));
        layersHome = [];
        const bounds = new L.LatLngBounds();

        if (LOJA_COORDS) {
            const base = L.marker([LOJA_COORDS[1], LOJA_COORDS[0]], {
                icon: L.divIcon({ className: 'base-pin', html: '<div>🏠</div>', iconSize: [30, 30] })
            }).addTo(mapHome);
            layersHome.push(base);
            bounds.extend([LOJA_COORDS[1], LOJA_COORDS[0]]);
        }

        rotas.forEach((r) => {
            const cor = r.turno === 'manha' ? '#16a34a' : '#2563eb';
            r.paradas.forEach((p) => {
                if (!p.coords) return;
                const marker = L.marker([p.coords[1], p.coords[0]], {
                    icon: L.divIcon({ className: 'custom-pin', html: `<div style="background:${cor};">${p.ordem}</div>`, iconSize: [28, 28] })
                }).addTo(mapHome);
                marker.bindPopup(`<b>${r.turno === 'manha' ? '☀️' : '🌙'} ${p.ordem}º · ${p.nomeCliente}</b><br>${p.endereco || ''}`);
                layersHome.push(marker);
                bounds.extend([p.coords[1], p.coords[0]]);
            });
        });

        if (bounds.isValid()) mapHome.fitBounds(bounds, { padding: [40, 40] });
    }

    // ===== DETAIL =====
    function renderDetail(turno, data) {
        const paradas = paradasDaRota(data, turno);
        const icone = turno === 'manha' ? '☀️' : '🌙';
        const nome = turno === 'manha' ? 'Rota da Manhã' : 'Rota da Tarde';
        el.detailTit().innerText = `${icone} ${nome}`;
        el.detailSub().innerText = `${formatarDataBr(data)} · ${paradas.length} parada${paradas.length !== 1 ? 's' : ''}`;

        if (paradas.length === 0) {
            el.detailParadas().innerHTML = `<div class="empty-state">
                <div style="font-size:44px;">📭</div>
                <div>Esta rota não tem paradas liberadas.</div>
            </div>`;
            el.btnIniciar().disabled = true;
            el.btnIniciar().innerText = 'Sem paradas';
            return;
        }

        el.detailParadas().innerHTML = paradas.map(paradaDetailHtml).join('');

        const status = calcularStatusRota(paradas);
        const btn = el.btnIniciar();
        btn.disabled = false;
        btn.classList.remove('warn', 'danger');
        if (status === 'iniciada') {
            btn.innerText = '▶️ Continuar Viagem';
            btn.classList.add('warn');
        } else if (status === 'concluida') {
            btn.innerText = '✅ Rota concluída';
            btn.disabled = true;
        } else {
            btn.innerText = '🚗 Iniciar Rota';
        }

        btn.onclick = () => iniciarRota(turno, data);
    }

    function paradaDetailHtml(p) {
        const concluida = p.status === 'concluida';
        const eta = p.horaPrevista ? `<span class="eta">🕐 ${p.horaPrevista}</span>` : '';
        const km = p.distanciaTrecho ? `🛣️ ${p.distanciaTrecho} km` : '';
        const peso = p.specs?.peso ? `⚖️ ${p.specs.peso} kg` : '';
        const statusLabel = {
            concluida: '✅ Concluída',
            em_atendimento: '👷 Em atendimento',
            em_transito: '🚚 Em trânsito',
            pendente: '⏳ Pendente'
        }[p.status] || '';
        return `
            <div class="parada-item">
                <div class="parada-ordem ${concluida ? 'concluida' : ''}">${p.ordem || '•'}</div>
                <div class="parada-info">
                    <div class="parada-cliente">${p.nomeCliente || 'Cliente'}</div>
                    <div class="parada-end">${p.endereco || '—'}</div>
                    <div class="parada-meta">
                        ${eta}
                        ${km ? `<span>${km}</span>` : ''}
                        ${peso ? `<span>${peso}</span>` : ''}
                        <span>${statusLabel}</span>
                    </div>
                </div>
            </div>
        `;
    }

    async function iniciarRota(turno, data) {
        // Regra: sempre passa por essa confirmação antes de ir para a viagem ativa.
        const paradas = paradasDaRota(data, turno);
        if (paradas.length === 0) { toast('Nenhuma parada nesta rota.', 'err'); return; }
        const ok = confirm(`Iniciar a rota ${turno === 'manha' ? 'da Manhã' : 'da Tarde'} (${paradas.length} paradas)?\n\nA tela será mantida ligada e o GPS ficará ativo.`);
        if (!ok) return;
        goto(`#/viagem/${turno}/${data}`);
    }

    // ===== ACTIVE =====
    function initMapActive() {
        if (mapActive) return;
        const center = [LOJA_COORDS ? LOJA_COORDS[1] : -14.235, LOJA_COORDS ? LOJA_COORDS[0] : -51.925];
        mapActive = L.map('map-active', { zoomControl: false, attributionControl: false }).setView(center, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapActive);
        document.getElementById('btn-recentrar-active').addEventListener('click', () => centralizarUsuario(mapActive));
    }

    function renderActive(turno, data) {
        const paradas = paradasDaRota(data, turno);
        const icone = turno === 'manha' ? '☀️' : '🌙';
        el.activeTit().innerText = `${icone} ${turno === 'manha' ? 'Rota da Manhã' : 'Rota da Tarde'}`;
        const restantes = paradas.filter((p) => p.status !== 'concluida').length;
        el.activeSub().innerText = `${restantes} parada${restantes !== 1 ? 's' : ''} restante${restantes !== 1 ? 's' : ''} · ${paradas.length} no total`;

        if (paradas.length === 0) {
            el.listaAtivas().innerHTML = `<div class="empty-state" style="color:#475569;">Sem paradas para esta rota.</div>`;
        } else {
            el.listaAtivas().innerHTML = paradas.map(paradaActiveHtml).join('');
            el.listaAtivas().querySelectorAll('[data-action]').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                    if (btn.disabled) return;
                    const acao = btn.getAttribute('data-action');
                    const id = Number(btn.getAttribute('data-id'));
                    if (acao === 'maps') {
                        const endereco = btn.getAttribute('data-endereco') || '';
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}&travelmode=driving`, '_blank');
                        return;
                    }
                    btn.disabled = true;
                    atualizarStatusPacote(id, acao).finally(() => { btn.disabled = false; });
                });
            });
        }

        initMapActive();
        setTimeout(() => { if (mapActive) mapActive.invalidateSize(); }, 80);
        renderMapaActive(paradas);
    }

    function paradaActiveHtml(p) {
        let cardClass = 'pcard pendente';
        let botoes = '';
        let chrono = '';

        if (p.status === 'concluida') {
            cardClass = 'pcard concluida';
            botoes = `<div class="status-ok">✔️ Entregue às ${p.horaConclusao || '--:--'}</div>`;
        } else if (p.status === 'em_atendimento') {
            cardClass = 'pcard em_atendimento';
            if (!localStorage.getItem(`timer_chegada_${p.id}`)) localStorage.setItem(`timer_chegada_${p.id}`, Date.now());
            chrono = `<div class="chrono" data-id="${p.id}" data-tipo="chegada">⏳ Descarga: <span class="tempo-display">00:00</span></div>`;
            botoes = `
                <button class="btn btn-concluir" data-action="concluir" data-id="${p.id}">✔️ 3. Finalizar entrega</button>
                <button class="btn btn-falha" data-action="falha" data-id="${p.id}">❌ Recusa / ausente</button>
            `;
        } else if (p.status === 'em_transito') {
            cardClass = 'pcard em_transito';
            if (!localStorage.getItem(`timer_partida_${p.id}`)) localStorage.setItem(`timer_partida_${p.id}`, Date.now());
            chrono = `<div class="chrono transito" data-id="${p.id}" data-tipo="partida">🛣️ Viagem: <span class="tempo-display">00:00</span></div>`;
            botoes = `
                <button class="btn btn-maps" data-action="maps" data-id="${p.id}" data-endereco="${(p.endereco || '').replace(/"/g, '&quot;')}">🗺️ Navegar (GPS)</button>
                <button class="btn btn-cheguei" data-action="cheguei" data-id="${p.id}">🏁 2. Cheguei</button>
                <button class="btn btn-concluir sec" data-action="concluir" data-id="${p.id}">✔️ Finalizar direto</button>
            `;
        } else {
            const textoPartir = p.ordem === 1 ? '🚗 1. Iniciar (sair da base)' : `🚗 1. Ir para a ${p.ordem}º parada`;
            botoes = `
                <button class="btn btn-partir" data-action="partir" data-id="${p.id}">${textoPartir}</button>
                <button class="btn btn-concluir sec" data-action="concluir" data-id="${p.id}">✔️ Finalizar direto</button>
            `;
        }

        return `
            <div class="${cardClass}">
                <div class="ph">
                    <div class="pord">${p.ordem || '—'}º parada</div>
                    <div class="pwt">${p.specs?.peso || 0} kg</div>
                </div>
                <div class="pcl">👤 ${p.nomeCliente || 'Cliente'}</div>
                <div class="pen">${p.endereco || '—'}</div>
                ${chrono}
                ${botoes}
            </div>
        `;
    }

    async function renderMapaActive(paradas) {
        if (!mapActive) return;
        layersActive.forEach((l) => mapActive.removeLayer(l));
        layersActive = [];
        if (layerLinhaActive) { mapActive.removeLayer(layerLinhaActive); layerLinhaActive = null; }

        const bounds = new L.LatLngBounds();
        if (LOJA_COORDS) {
            const base = L.marker([LOJA_COORDS[1], LOJA_COORDS[0]], {
                icon: L.divIcon({ className: 'base-pin', html: '<div>🏠</div>', iconSize: [30, 30] })
            }).addTo(mapActive);
            layersActive.push(base);
            bounds.extend([LOJA_COORDS[1], LOJA_COORDS[0]]);
        }
        paradas.forEach((p) => {
            if (!p.coords) return;
            const cor = p.status === 'concluida' ? '#16a34a' : (p.status === 'em_atendimento' ? '#f59e0b' : (p.status === 'em_transito' ? '#0ea5e9' : '#3b82f6'));
            const m = L.marker([p.coords[1], p.coords[0]], {
                icon: L.divIcon({ className: 'custom-pin', html: `<div style="background:${cor};">${p.ordem}</div>`, iconSize: [28, 28] })
            }).addTo(mapActive);
            m.bindPopup(`<b>${p.ordem}º · ${p.nomeCliente}</b><br>${p.endereco || ''}`);
            layersActive.push(m);
            bounds.extend([p.coords[1], p.coords[0]]);
        });
        if (bounds.isValid()) mapActive.fitBounds(bounds, { padding: [30, 30] });

        // Linha da rota (ORS) — só se houver chave
        const pendentes = paradas.filter((p) => p.status !== 'concluida' && p.coords);
        if (pendentes.length > 0 && ORS_KEY && LOJA_COORDS) {
            try {
                const coords = [LOJA_COORDS, ...pendentes.map((p) => p.coords)];
                const resp = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
                    method: 'POST',
                    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ coordinates: coords })
                });
                if (resp.ok) {
                    const gj = await resp.json();
                    layerLinhaActive = L.geoJSON(gj, { style: { color: '#2563eb', weight: 5, opacity: 0.85 } }).addTo(mapActive);
                }
            } catch (_) {}
        }
    }

    // ===== Ações (PATCH status) =====
    async function atualizarStatusPacote(id, acao) {
        if (acao === 'falha') {
            if (!confirm('Registrar falha na entrega? O pacote volta para amanhã.')) return;
        }

        const rotulos = {
            partir: 'Iniciando viagem',
            cheguei: 'Registrando chegada',
            concluir: 'Finalizando entrega',
            falha: 'Registrando falha'
        };
        showLoading(`${rotulos[acao] || 'Atualizando'}...`);

        const agora = Date.now();
        const body = { acao };
        try {
            if (acao === 'partir') {
                localStorage.setItem(`timer_partida_${id}`, agora);
            } else if (acao === 'cheguei') {
                const partida = Number(localStorage.getItem(`timer_partida_${id}`));
                body.tempo_viagem_real = partida ? Math.max(1, Math.round((agora - partida) / 60000)) : 1;
                localStorage.setItem(`timer_chegada_${id}`, agora);
            } else if (acao === 'concluir') {
                const chegada = Number(localStorage.getItem(`timer_chegada_${id}`));
                body.tempo_no_local_real = chegada ? Math.max(1, Math.round((agora - chegada) / 60000)) : 1;
                localStorage.removeItem(`timer_partida_${id}`);
                localStorage.removeItem(`timer_chegada_${id}`);
            } else if (acao === 'falha') {
                localStorage.removeItem(`timer_partida_${id}`);
                localStorage.removeItem(`timer_chegada_${id}`);
            }

            await apiFetchJson(`/api/coletas/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            await syncBackground();
            toast(`✔️ ${rotulos[acao] || 'Status atualizado'}`);
        } catch (err) {
            console.error('[motorista] PATCH status falhou', { id, acao, err });
            if (err && err.status === 401) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('tipo_app');
                toast('Sessão expirada.', 'err');
                setTimeout(() => { window.location.href = '/operacao/login.html'; }, 800);
                return;
            }
            toast(`Falha: ${(err && err.message) || 'erro desconhecido'}`, 'err');
        } finally {
            hideLoading();
        }
    }

    // ===== GPS (watchPosition high accuracy, só na view Active) =====
    function startGpsWatch() {
        if (!('geolocation' in navigator) || gpsWatchId !== null) return;
        gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                gpsLastLatLng = [lat, lng];
                gpsLastVelocidade = pos.coords.speed != null && isFinite(pos.coords.speed)
                    ? Math.max(0, pos.coords.speed) : null;
                gpsLastPrecisao = pos.coords.accuracy != null && isFinite(pos.coords.accuracy)
                    ? Math.max(0, pos.coords.accuracy) : null;
                atualizarMarcadorGps(mapActive, (m) => gpsMarkerActive = m, lat, lng);
                atualizarMarcadorGps(mapHome, (m) => gpsMarkerHome = m, lat, lng);
                enviarPosicaoParaBackend();
            },
            (err) => {
                console.warn('[motorista] watchPosition erro', err);
                if (err.code === err.PERMISSION_DENIED) {
                    toast('Permissão de GPS negada. Ative nas configurações do navegador.', 'err');
                }
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
        // Garante envio periódico mesmo que o watchPosition fique quieto
        // (parado no semáforo, por exemplo). A cada 20s reenvia a última.
        if (gpsPostTimer) clearInterval(gpsPostTimer);
        gpsPostTimer = setInterval(() => enviarPosicaoParaBackend(true), 20000);
    }

    function stopGpsWatch() {
        if (gpsWatchId !== null && 'geolocation' in navigator) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
        if (gpsPostTimer) {
            clearInterval(gpsPostTimer);
            gpsPostTimer = null;
        }
    }

    // Throttle: só envia se passaram >10s desde o último POST, pra não
    // inundar o backend quando o watchPosition dispara rápido.
    let ultimoPostMs = 0;
    async function enviarPosicaoParaBackend(forceInterval) {
        if (!gpsLastLatLng) return;
        const agora = Date.now();
        const minMs = forceInterval ? 19000 : 10000;
        if (agora - ultimoPostMs < minMs) return;
        ultimoPostMs = agora;
        try {
            await apiFetchJson('/api/coletas/posicao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: gpsLastLatLng[0],
                    lng: gpsLastLatLng[1],
                    velocidade: gpsLastVelocidade,
                    precisao: gpsLastPrecisao
                })
            });
        } catch (err) {
            console.warn('[motorista] falha ao postar posição', err && err.message);
        }
    }

    function atualizarMarcadorGps(map, setter, lat, lng) {
        if (!map) return;
        // pega a referência atual
        const existing = (map === mapActive) ? gpsMarkerActive : gpsMarkerHome;
        if (existing) {
            existing.setLatLng([lat, lng]);
        } else {
            const m = L.circleMarker([lat, lng], {
                radius: 8, fillColor: '#3b82f6', color: '#fff', weight: 3, fillOpacity: 1
            }).addTo(map);
            setter(m);
        }
    }

    function centralizarUsuario(map) {
        if (!map) return;
        if (gpsLastLatLng) {
            map.setView(gpsLastLatLng, Math.max(14, map.getZoom()));
        } else if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    gpsLastLatLng = [pos.coords.latitude, pos.coords.longitude];
                    map.setView(gpsLastLatLng, 15);
                },
                () => toast('Não foi possível obter sua posição.', 'err'),
                { enableHighAccuracy: true, timeout: 8000 }
            );
        }
    }

    // ===== Wake Lock =====
    async function acquireWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                wakeLockSentinel = await navigator.wakeLock.request('screen');
                wakeLockSentinel.addEventListener('release', () => {
                    // Se perder o lock (ex: abriu outra aba), tenta reaver quando voltar.
                    wakeLockSentinel = null;
                });
            }
        } catch (err) {
            console.warn('[motorista] wakeLock falhou', err);
            toast('Sem Wake Lock — a tela pode apagar durante a viagem.', 'err');
        }
    }

    function releaseWakeLock() {
        try {
            if (wakeLockSentinel) wakeLockSentinel.release();
        } catch (_) {}
        wakeLockSentinel = null;
    }

    // Re-adquire o WakeLock ao voltar da background (comum no Android)
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && currentView === 'active') {
            await acquireWakeLock();
            el.banner().classList.remove('show');
        } else if (currentView === 'active') {
            // minimizou com viagem ativa → aviso claro
            el.banner().classList.add('show');
        }
    });

    // ===== Permissão de localização (foreground) =====
    async function pedirPermissaoLocalizacao() {
        if (!('geolocation' in navigator)) return;
        try {
            // Uma "ping" do getCurrentPosition dispara o prompt de permissão.
            navigator.geolocation.getCurrentPosition(
                (pos) => { gpsLastLatLng = [pos.coords.latitude, pos.coords.longitude]; },
                (err) => {
                    if (err && err.code === err.PERMISSION_DENIED) {
                        toast('Libere o GPS para o app funcionar bem.', 'err');
                    }
                },
                { enableHighAccuracy: true, maximumAge: 30000, timeout: 8000 }
            );
        } catch (_) {}
    }

    // ===== Cronômetros (1s tick) =====
    setInterval(() => {
        const agora = Date.now();
        document.querySelectorAll('.chrono').forEach((node) => {
            const id = node.getAttribute('data-id');
            const tipo = node.getAttribute('data-tipo');
            const inicio = Number(localStorage.getItem(`timer_${tipo}_${id}`));
            if (!inicio || Number.isNaN(inicio)) return;
            const segs = Math.max(0, Math.floor((agora - inicio) / 1000));
            const mm = String(Math.floor(segs / 60)).padStart(2, '0');
            const ss = String(segs % 60).padStart(2, '0');
            const span = node.querySelector('.tempo-display');
            if (span) span.innerText = `${mm}:${ss}`;
        });
    }, 1000);

    // Poll de sincronização
    setInterval(() => { syncBackground().catch(() => {}); }, 8000);

    // ===== Boot =====
    window.addEventListener('hashchange', applyRoute);
    document.getElementById('btn-back').addEventListener('click', () => {
        // Volta para Home sempre — não usamos history API pra preservar
        // tokens/estado; o fluxo é linear Home → Detail → Active.
        goto('#/');
    });

    window.addEventListener('load', async () => {
        const temToken = !!localStorage.getItem('auth_token');
        const ehMotorista = localStorage.getItem('tipo_app') === 'motorista';
        if (!temToken || !ehMotorista) {
            // Protege contra sessões compartilhadas com painel gerencial:
            // se não é motorista, manda pro login dedicado e limpa tokens
            // antigos pra evitar confusão de escopo.
            if (!ehMotorista && temToken) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('tipo_app');
            }
            window.location.replace('/operacao/login.html');
            return;
        }
        prepareConfig();
        await syncEmpresa();
        pedirPermissaoLocalizacao();
        applyRoute();
        syncBackground().catch(() => {});
    });
})();
