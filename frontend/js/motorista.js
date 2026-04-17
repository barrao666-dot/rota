let ORS_KEY = '';
const LOJA_COORDS = [-43.945722, -19.882352];
let empresaId = 1;
let bancoDadosCompleto = { entregas: [] };
let hashAnterior = '';
let map;
let layersPinos = [];
let layerLinhaRota = null;
let marcadorBolinhaAzul = null;
let syncInFlight = false;
let deferredInstallPrompt = null;

const el = {
    indicador: document.getElementById('indicador-nuvem'),
    data: document.getElementById('data-operacao'),
    turno: document.getElementById('turno'),
    statusSync: document.getElementById('status-sync'),
    lista: document.getElementById('lista-entregas'),
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loading-text'),
    rotaCompleta: document.getElementById('btn-rota-completa'),
    btnInstalar: document.getElementById('btn-instalar-app')
};

function getToday() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function getHoraAtualFormatada() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function mostrarLoading(texto) {
    el.loadingText.innerText = texto;
    el.loading.style.display = 'flex';
}

function fecharLoading() {
    el.loading.style.display = 'none';
}

function configurarPwaInstall() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        el.btnInstalar.classList.remove('hidden');
    });

    el.btnInstalar.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        el.btnInstalar.classList.add('hidden');
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/service-worker.js').catch((err) => {
            console.warn('Falha ao registrar service worker:', err);
        });
    }
}

function prepararConfigEmpresa() {
    const dadosEmpresa = localStorage.getItem('dados_empresa');
    if (!dadosEmpresa) return;

    try {
        const emp = JSON.parse(dadosEmpresa);
        empresaId = Number(emp.id || emp.empresa_id || 1);
        ORS_KEY = emp.api_mapas || '';
    } catch (err) {
        console.warn('Falha ao interpretar dados da empresa:', err);
    }
}

async function sincronizarEmpresaAtual() {
    try {
        const data = await apiFetchJson('/api/empresas/me');
        if (!data || !data.empresa) return;
        localStorage.setItem('dados_empresa', JSON.stringify(data.empresa));
        empresaId = Number(data.empresa.id || data.empresa.empresa_id || empresaId);
        ORS_KEY = data.empresa.api_mapas || ORS_KEY;
    } catch (e) {
        // mantém fallback local
    }
}

function iniciarRastreamentoGPS() {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (!marcadorBolinhaAzul) {
                marcadorBolinhaAzul = L.circleMarker([lat, lng], {
                    radius: 8,
                    fillColor: '#3b82f6',
                    color: '#ffffff',
                    weight: 3,
                    opacity: 1,
                    fillOpacity: 1
                }).addTo(map);
            } else {
                marcadorBolinhaAzul.setLatLng([lat, lng]);
            }
        },
        (error) => {
            console.warn('GPS não autorizado.', error);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
}

function bindEventos() {
    el.data.addEventListener('change', () => {
        renderizarTela();
        renderizarMapa();
    });

    el.turno.addEventListener('change', () => {
        renderizarTela();
        renderizarMapa();
    });

    el.rotaCompleta.addEventListener('click', abrirRotaCompletaMaps);

    el.lista.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const id = Number(target.getAttribute('data-id'));
        if (!id) return;

        if (action === 'maps') {
            const endereco = target.getAttribute('data-endereco') || '';
            const urlMaps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}&travelmode=driving`;
            window.open(urlMaps, '_blank');
            return;
        }

        atualizarStatusPacote(id, action).catch((err) => {
            console.error(err);
            alert('Falha ao atualizar o status da entrega.');
        });
    });
}

function abrirRotaCompletaMaps() {
    const dataFiltro = el.data.value;
    const turno = el.turno.value;
    const pacotes = bancoDadosCompleto.entregas
        .filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem > 0 && e.status !== 'concluida')
        .sort((a, b) => a.ordem - b.ordem);

    if (pacotes.length === 0) {
        alert('Não há paradas pendentes para traçar a rota.');
        return;
    }

    const base = 'Av. Cachoeirinha, 585 - Cachoeirinha, Belo Horizonte - MG';
    const waypoints = pacotes.map((p) => encodeURIComponent(p.endereco)).join('/');
    window.open(`https://www.google.com/maps/dir/${encodeURIComponent(base)}/${waypoints}`, '_blank');
}

async function sincronizarFundo() {
    if (syncInFlight || !localStorage.getItem('auth_token')) return;
    syncInFlight = true;
    el.indicador.innerText = '⏳ Sync...';

    try {
        const resp = await apiFetch(`/api/coletas/${empresaId}`);
        if (!resp.ok) throw new Error(`Erro ${resp.status} ao buscar coletas`);
        const data = await resp.json();

        const entregasFormatadas = data
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
                specs: {
                    peso: parseFloat(e.peso) || 0,
                    a: parseFloat(e.altura) || 0,
                    l: parseFloat(e.largura) || 0,
                    c: parseFloat(e.comprimento) || 0,
                    tempoServico: e.tempo_medio || 600
                }
            }));

        const novoHash = JSON.stringify(entregasFormatadas);
        if (novoHash !== hashAnterior) {
            bancoDadosCompleto.entregas = entregasFormatadas;
            hashAnterior = novoHash;
            renderizarTela();
            await renderizarMapa();
        }

        el.indicador.innerText = '🟢 Atualizado';
        const hora = new Date();
        el.statusSync.innerText = `Última sincronização: ${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}`;
    } catch (e) {
        console.error(e);
        el.indicador.innerText = '🔴 Offline';
    } finally {
        syncInFlight = false;
    }
}

async function renderizarMapa() {
    const dataFiltro = el.data.value;
    const turno = el.turno.value;

    layersPinos.forEach((layer) => map.removeLayer(layer));
    layersPinos = [];
    if (layerLinhaRota) {
        map.removeLayer(layerLinhaRota);
        layerLinhaRota = null;
    }

    const pacotes = bancoDadosCompleto.entregas
        .filter((e) => e.dataEntrega === dataFiltro && e.periodo === turno && e.ordem > 0)
        .sort((a, b) => a.ordem - b.ordem);
    if (pacotes.length === 0) return;

    const bounds = new L.LatLngBounds();
    const baseMarker = L.marker([LOJA_COORDS[1], LOJA_COORDS[0]], {
        icon: L.divIcon({ className: 'base-pin', html: '<div>🏠</div>', iconSize: [28, 28] })
    }).addTo(map);
    baseMarker.bindPopup('<b>Base Obralight</b>');
    layersPinos.push(baseMarker);
    bounds.extend([LOJA_COORDS[1], LOJA_COORDS[0]]);

    pacotes.forEach((p) => {
        if (!p.coords || p.coords.length < 2) return;
        const cor = p.status === 'concluida' ? '#16a34a' : (p.status === 'em_atendimento' || p.status === 'em_transito' ? '#f59e0b' : '#3b82f6');
        const marker = L.marker([p.coords[1], p.coords[0]], {
            icon: L.divIcon({ className: 'custom-pin', html: `<div style="background:${cor};">${p.ordem}</div>`, iconSize: [28, 28] })
        }).addTo(map);
        marker.bindPopup(`<b>${p.ordem}º - ${p.nomeCliente}</b><br>${p.endereco}`);
        layersPinos.push(marker);
        bounds.extend([p.coords[1], p.coords[0]]);
    });

    map.fitBounds(bounds, { padding: [30, 30] });

    try {
        const rotasPendentes = pacotes.filter((p) => p.status !== 'concluida' && p.coords && p.coords.length >= 2);
        if (rotasPendentes.length === 0 || !ORS_KEY) return;

        const coordList = [LOJA_COORDS, ...rotasPendentes.map((p) => p.coords)];
        const rotaResp = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            method: 'POST',
            headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ coordinates: coordList })
        });
        if (!rotaResp.ok) return;

        const geojson = await rotaResp.json();
        layerLinhaRota = L.geoJSON(geojson, { style: { color: '#0ea5e9', weight: 5, opacity: 0.8 } }).addTo(map);
    } catch (err) {
        console.warn('Traçado da linha no mapa indisponível.', err);
    }
}

function renderizarTela() {
    const dataFiltro = el.data.value;
    const turno = el.turno.value;
    el.lista.innerHTML = '';

    const pacotesNaRota = bancoDadosCompleto.entregas
        .filter((entrega) => entrega.dataEntrega === dataFiltro && entrega.periodo === turno && (entrega.ordem > 0 || entrega.status === 'concluida'))
        .sort((a, b) => (a.ordem || 999) - (b.ordem || 999));

    if (pacotesNaRota.length === 0) {
        el.lista.innerHTML = '<div class="empty-state">Nenhuma rota validada pela base para este turno.</div>';
        return;
    }

    pacotesNaRota.forEach((p) => {
        let botoes = '';
        let cardClass = 'card pendente';
        let iconeStatus = '📍';

        let htmlMetricas = `
            <div class="metricas">
                <div class="metrica-prevista">Previsto (Viagem)<br><b>${p.tempoViagem || 0} min</b></div>
                <div class="metrica-prevista">Previsto (Obra)<br><b>${p.specs?.tempoServico ? Math.round(p.specs.tempoServico / 60) : 10} min</b></div>
            </div>
        `;

        if (p.status === 'concluida') {
            cardClass = 'card concluida';
            iconeStatus = '✔️';
            htmlMetricas = `
                <div class="metricas realizado">
                    <div>Realizado (Viagem)<br><b>${p.tempoViagemReal || 0} min</b></div>
                    <div>Realizado (Descarga)<br><b>${p.tempoNoLocalReal || 0} min</b></div>
                </div>
            `;
            botoes = '<div class="status-finalizado">✔️ Entrega Finalizada com Sucesso</div>';
        } else if (p.status === 'em_atendimento') {
            cardClass = 'card em_atendimento';
            iconeStatus = '👷';
            if (!localStorage.getItem(`timer_chegada_${p.id}`)) localStorage.setItem(`timer_chegada_${p.id}`, Date.now());
            botoes = `
                <div class="cronometro-ativo atendimento" data-id="${p.id}" data-tipo="chegada">
                    ⏳ Descarga rodando: <span class="tempo-display">00:00</span>
                </div>
                <button data-action="concluir" data-id="${p.id}" class="btn btn-concluir">✔️ 3. Finalizar Entrega</button>
                <button data-action="falha" data-id="${p.id}" class="btn btn-falha">❌ Recusa / Cliente Ausente</button>
            `;
        } else if (p.status === 'em_transito') {
            cardClass = 'card em_transito';
            iconeStatus = '🚚';
            if (!localStorage.getItem(`timer_partida_${p.id}`)) localStorage.setItem(`timer_partida_${p.id}`, Date.now());
            botoes = `
                <div class="cronometro-ativo transito" data-id="${p.id}" data-tipo="partida">
                    🛣️ Viagem rodando: <span class="tempo-display">00:00</span>
                </div>
                <button data-action="maps" data-id="${p.id}" data-endereco="${p.endereco || ''}" class="btn btn-maps">🗺️ Navegar (Esta Parada)</button>
                <button data-action="cheguei" data-id="${p.id}" class="btn btn-cheguei">🏁 2. Cheguei no Cliente</button>
            `;
        } else {
            const textoPartir = p.ordem === 1 ? '🚗 1. Iniciar Rota (Sair da Base)' : `🚗 1. Ir para a ${p.ordem}º Parada`;
            botoes = `<button data-action="partir" data-id="${p.id}" class="btn btn-partir">${textoPartir}</button>`;
        }

        el.lista.innerHTML += `
            <div class="${cardClass}">
                <div class="card-header">
                    <span class="ordem-badge">${iconeStatus} ${p.ordem || '-'}º Parada</span>
                    <span class="peso-badge">${p.specs?.peso || 0} kg</span>
                </div>
                <div class="cliente">👤 ${p.nomeCliente || 'Cliente Obralight'}</div>
                <div class="endereco">${p.endereco || ''}</div>
                ${p.distanciaTrecho ? `<div class="distancia">🛣️ Distância: ${p.distanciaTrecho} km</div>` : ''}
                ${htmlMetricas}
                ${botoes}
            </div>
        `;
    });
}

async function atualizarStatusPacote(id, acao) {
    if (acao === 'falha') {
        const confirmacao = confirm('Tem certeza que a entrega falhou? Ela voltará para a base amanhã.');
        if (!confirmacao) return;
    }

    mostrarLoading('Atualizando Servidor...');

    try {
        const agora = Date.now();
        const body = { acao };

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

        await sincronizarFundo();
    } finally {
        fecharLoading();
    }
}

setInterval(() => {
    const agora = Date.now();
    document.querySelectorAll('.cronometro-ativo').forEach((node) => {
        const pacoteId = node.getAttribute('data-id');
        const tipo = node.getAttribute('data-tipo');
        const inicio = Number(localStorage.getItem(`timer_${tipo}_${pacoteId}`));
        if (!inicio || Number.isNaN(inicio)) return;

        const diffEmSegundos = Math.max(0, Math.floor((agora - inicio) / 1000));
        const minutos = String(Math.floor(diffEmSegundos / 60)).padStart(2, '0');
        const segundos = String(diffEmSegundos % 60).padStart(2, '0');
        const spanDisplay = node.querySelector('.tempo-display');
        if (spanDisplay) spanDisplay.innerText = `${minutos}:${segundos}`;
    });
}, 1000);

setInterval(() => {
    sincronizarFundo().catch((err) => console.error(err));
}, 8000);

window.addEventListener('load', async () => {
    if (!localStorage.getItem('auth_token')) {
        window.location.href = '/index.html';
        return;
    }

    prepararConfigEmpresa();
    await sincronizarEmpresaAtual();
    configurarPwaInstall();

    el.data.value = getToday();
    if (new Date().getHours() >= 12) el.turno.value = 'tarde';
    bindEventos();

    map = L.map('mapa-motorista').setView([LOJA_COORDS[1], LOJA_COORDS[0]], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    iniciarRastreamentoGPS();
    sincronizarFundo().catch((err) => console.error(err));
});
