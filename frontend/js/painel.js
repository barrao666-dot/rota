let mapaInstancia = null;
let marcadorBasePainel = null;
let layersPinos = [];
let layersLinhas = [];
let empresa = null;
const ZOOM_BASE_OPERACIONAL = 17;

// Rastreamento em tempo real: precisa estar DECLARADO no topo porque
// iniciarMapa() pode ser chamada no bootstrap (linha ~77) antes que o
// interpretador alcance a definição do bloco abaixo. Usar const aqui
// daria TDZ ("Cannot access before initialization").
const marcadoresMotoristasPainel = new Map();
let timerMotoristasPainel = null;

let ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjVhYmFhN2RiMGU0MjQ5NWJhMTI3MTEzZWJkNDAyMzc4IiwiaCI6Im11cm11cjY0In0=';
// Default DELIBERADAMENTE null — antes era [-43.945722, -19.882352] (BH/MG),
// que coincide com a base de uma empresa real. Ao trocar de empresa, o
// painel mostrava o pino dessa cidade, dando a falsa sensação de que a
// nova empresa "herdou" a base do cliente anterior. Quem desenhar pino
// precisa checar se LOJA_COORDS está populado.
let LOJA_COORDS = null;

let dbStore = { usuarios: [], motoristas: [], veiculos: [], bases: [], coletas: [], regras: [] };
let editando = { usuario: null, motorista: null, veiculo: null, base: null, coleta: null, regra: null };

function aplicarTemaEmpresaAtual() {
    const corPrimaria = (empresa && empresa.cor1) ? empresa.cor1 : '#0ea5e9';
    const corSecundaria = (empresa && empresa.cor2) ? empresa.cor2 : '#22c55e';
    document.documentElement.style.setProperty('--brand-accent', corPrimaria);
    document.documentElement.style.setProperty('--brand-accent-2', corSecundaria);
}

async function sincronizarEmpresaAtualPainel() {
    try {
        const data = await apiFetchJson('/api/empresas/me');
        if (!data || !data.empresa) return;
        empresa = data.empresa;
        localStorage.setItem('dados_empresa', JSON.stringify(data.empresa));
        if (empresa.api_mapas && empresa.api_mapas.trim() !== '') ORS_KEY = empresa.api_mapas;
    } catch (e) {
        // segue com cache local se falhar
    }
}

function registrarServiceWorkerPainel() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.warn('Falha ao registrar service worker:', err);
    });
}

function getToday() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; }
function formatarDataBR(dataStr) { if(!dataStr) return ''; const p = dataStr.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }

/** Remove tipo de via (Av., Rua, etc.) para comparar se é o mesmo logradouro com nome divergente nos Correios. */
function nucleoLogradouro(str) {
    if (!str || typeof str !== 'string') return '';
    return str.toLowerCase().replace(/^\s+/, '').replace(/^(av\.|avenida|rua|al\.|alameda|trav\.|travessa|rod\.|rodovia|estr\.|estrada|praça|pç\.|pça\.|vic\.|viela)\s+/i, '').trim();
}

// parseEnderecoSalvoPainel, geocodificarEnderecoBrasil, geocodificarBaseOperacional e helpers: /js/endereco-geocode.js

// ---------------------------------------------------
// INICIALIZAÇÃO DA SESSÃO
// ---------------------------------------------------
const dadosSalvos = localStorage.getItem('dados_empresa');
if (!dadosSalvos || !localStorage.getItem('auth_token')) {
    window.location.href = '/index.html';
} else {
    (async () => {
        registrarServiceWorkerPainel();
        empresa = JSON.parse(dadosSalvos);
        if(!empresa.id) { alert("Sessão expirada. Faça login novamente."); sair(); return; }
        document.getElementById('txt-nome').innerText = empresa.nome;
        aplicarTemaEmpresaAtual();
        if (empresa.caminho_logo) {
            const imgLogo = document.getElementById('img-logo');
            imgLogo.src = empresa.caminho_logo;
            imgLogo.style.display = 'block';
        }
        if (empresa.api_mapas && empresa.api_mapas.trim() !== '') { ORS_KEY = empresa.api_mapas; }
        const params = new URLSearchParams(window.location.search);
        const abaInicial = params.get('aba') || 'mapa';
        mudarAba(abaInicial);

        sincronizarEmpresaAtualPainel()
            .then(() => {
                document.getElementById('txt-nome').innerText = empresa.nome;
                aplicarTemaEmpresaAtual();
                if (empresa.caminho_logo) {
                    const imgLogo = document.getElementById('img-logo');
                    imgLogo.src = empresa.caminho_logo;
                    imgLogo.style.display = 'block';
                }
            })
            .catch(() => {});
        
        apiFetch(`/api/bases/${empresa.id}`)
            .then((res) => res.json())
            .then((bases) => {
                if (bases.length > 0 && bases[0].lat != null && bases[0].lng != null) {
                    const lng = parseFloat(bases[0].lng);
                    const lat = parseFloat(bases[0].lat);
                    if (!isNaN(lat) && !isNaN(lng)) {
                        LOJA_COORDS = [lng, lat];
                        focarMapaNaBaseCarregada();
                    }
                }
            })
            .catch(() => {});
    })();
}

function sair() {
    localStorage.removeItem('dados_empresa');
    localStorage.removeItem('dados_operador');
    localStorage.removeItem('auth_token');
    try {
        sessionStorage.removeItem('rota_plus_master_token_backup');
    } catch (e) {}
    window.location.href = '/index.html';
}

// ---------------------------------------------------
// FUNÇÕES DE UTILIDADE (CEP BLINDADO)
// ---------------------------------------------------
async function buscarCep(prefixo) {
    const inputCep = document.getElementById(`${prefixo}-cep`);
    if (!inputCep) return; 
    let cep = inputCep.value.replace(/\D/g, '');
    
    if (cep.length === 8) {
        try {
            let resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            let dados = await resposta.json();
            if (!dados.erro) {
                const inputRua = document.getElementById(`${prefixo}-rua`);
                const inputBairro = document.getElementById(`${prefixo}-bairro`);
                const inputCidade = document.getElementById(`${prefixo}-cidade`);
                const inputUf = document.getElementById(`${prefixo}-uf`);
                const inputNum = document.getElementById(`${prefixo}-numero`);

                if (inputRua) {
                    const novo = (dados.logradouro || '').trim();
                    const atual = inputRua.value.trim();
                    if (!atual) {
                        inputRua.value = novo;
                    } else if (novo && nucleoLogradouro(atual) === nucleoLogradouro(novo)) {
                        // Mesmo “núcleo” do nome: mantém o que você digitou (ex.: Avenida vs Rua nos Correios).
                    } else {
                        inputRua.value = novo;
                    }
                }
                if (inputBairro) inputBairro.value = dados.bairro || '';
                if (inputCidade) inputCidade.value = dados.localidade || '';
                if (inputUf) inputUf.value = dados.uf || '';
                if (inputNum) inputNum.focus();
            } else {
                alert("⚠️ CEP não localizado nos Correios!");
            }
        } catch (e) { console.error("Erro no ViaCEP:", e); alert("⚠️ Erro ao consultar o CEP."); }
    }
}

function toggleSenha(inputId, btn) {
    const campo = document.getElementById(inputId);
    if (campo.type === 'password') { campo.type = 'text'; btn.innerText = '🙈'; } 
    else { campo.type = 'password'; btn.innerText = '👁️'; }
}

function cancelarEdicao(tipo) {
    editando[tipo] = null;
    const titEl = document.getElementById(`tit-form-${tipo}`);
    if (titEl) titEl.innerText = tipo === 'base' ? 'Cadastrar Nova Base (Ponto de Partida)' : 'Cadastrar Novo(a)';
    document.getElementById(`btn-salvar-${tipo}`).innerText = tipo === 'base' ? 'Salvar Base e Localizar no Mapa' : 'Salvar';
    document.getElementById(`btn-salvar-${tipo}`).style.backgroundColor = "#10b981";
    document.getElementById(`btn-cancelar-${tipo}`).style.display = "none";
    if(tipo === 'usuario') { document.getElementById('div-usu-status').style.display = "none"; }
    if(tipo === 'base' || tipo === 'coleta') { 
        const p = tipo === 'base' ? 'base' : 'col'; 
        document.getElementById(`div-complementos-${p}`).style.display = "grid"; 
        document.getElementById(`${p}-cep`).disabled = false; 
        document.getElementById(`${p}-numero`).disabled = false; 
    }
    document.querySelectorAll(`#card-form-${tipo} input, #card-form-${tipo} textarea`).forEach(i => { i.value = ''; });
    document.querySelectorAll(`#card-form-${tipo} select`).forEach(i => { i.value = ''; });
    if (tipo === 'base') {
        const lbl = document.getElementById('base-rua-label');
        if (lbl) lbl.innerText = 'Rua / Avenida / Logradouro';
        const g = document.getElementById('base-grid-cep-log');
        const d = document.getElementById('div-complementos-base');
        if (g) g.style.display = 'grid';
        if (d) d.style.display = 'grid';
    }
}

// ---------------------------------------------------
// NAVEGAÇÃO E RENDERIZAÇÃO DAS TELAS
// ---------------------------------------------------
function mudarAba(abaDestino) {
    document.querySelectorAll('.menu li').forEach(li => li.classList.remove('ativo'));
    document.getElementById(`menu-${abaDestino}`).classList.add('ativo');
    const menuTopo = document.getElementById('menu-lateral');
    if (menuTopo) menuTopo.classList.remove('menu-open');

    const area = document.getElementById('area-conteudo');
    const titulo = document.getElementById('titulo-pagina');

    if (abaDestino === 'mapa') {
        titulo.innerText = "Rastreamento GPS em Tempo Real";
        area.innerHTML = `
            <div style="margin-bottom: 15px; display: flex; justify-content: space-between;">
                <span style="color: #666;">Acompanhe a localização das Bases Operacionais e Veículos.</span>
                <button class="btn-acao" style="padding: 5px 15px; font-size: 13px;" onclick="iniciarMapa()">Atualizar Mapa</button>
            </div>
            <div id="mapa-container" style="height: 500px; width: 100%; border-radius: 8px;"></div>
        `;
        iniciarMapa();
    } 
    else if (abaDestino === 'roteirizador') {
        titulo.innerText = "Visão Gerencial e Auditoria de Rotas";
        area.innerHTML = `
            <div class="caixa-roteirizador">
                <div class="painel-lateral-rota">
                    <h3 style="margin-top: 0; color: #0284c7;">Rotas da Operação</h3>
                    <div class="input-group">
                        <label>Data Operacional</label>
                        <input type="date" id="filtro-data-gestor" onchange="carregarRotasDoGestor()">
                    </div>
                    <div class="input-group">
                        <label>Turno</label>
                        <select id="filtro-turno-gestor" onchange="carregarRotasDoGestor()">
                            <option value="manha">Manhã</option>
                            <option value="tarde">Tarde</option>
                        </select>
                    </div>
                    <button class="btn-acao" style="width: 100%; margin-bottom: 15px; background: #16a34a;" onclick="salvarAlteracaoGerencial()">💾 Salvar Correções na Rota</button>
                    
                    <h4 style="margin-bottom: 5px; border-bottom: 1px solid #eee; padding-bottom: 5px;">📍 Sequência Atual</h4>
                    <div id="lista-rotas-gestor" style="font-size: 12px; color: #64748b;">Selecione a data e aguarde...</div>
                </div>
                <div><div id="mapa-container" style="height: 600px; width: 100%; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1;"></div></div>
            </div>
        `;
        document.getElementById('filtro-data-gestor').value = getToday();
        iniciarMapa(); 
        carregarRotasDoGestor();
    }
    else if (abaDestino === 'ocorrencias') {
        titulo.innerText = "Gestão de Ocorrências e Canhotos (POD)";
        area.innerHTML = `
            <div class="card">
                <h3>Monitoramento de Entregas Finalizadas</h3>
                <table class="tabela-dados" id="tabela-ocorrencias">
                    <thead><tr><th>Data</th><th>Motorista / Veículo</th><th>Status</th><th>Cliente / Local</th><th>Ação</th></tr></thead>
                    <tbody><tr><td colspan="5" style="text-align: center;">Carregando...</td></tr></tbody>
                </table>
            </div>
        `;
        carregarOcorrencias();
    }
    else if (abaDestino === 'coletas') {
        titulo.innerText = "Cadastro de Fornecedores e Locais de Carga";
        area.innerHTML = `
            <div class="card" id="card-form-coleta">
                <h3 id="tit-form-coleta">Cadastrar Novo Fornecedor (Local de Carga)</h3>
                <div class="input-group">
                    <label>Nome do Fornecedor / Fábrica <span style="color:red;">*</span></label>
                    <input type="text" id="col-fornecedor" placeholder="Ex: Cimentos ABC">
                </div>
                <h4 class="sessao-titulo">📍 Endereço de Retirada (Opcional - Ajuda o Operador)</h4>
                <div class="grid-4">
                    <div class="input-group"><label>CEP</label><input type="text" id="col-cep" placeholder="00000-000" onblur="buscarCep('col')"></div>
                    <div class="input-group" style="grid-column: span 2;"><label>Rua / Logradouro</label><input type="text" id="col-rua"></div>
                    <div class="input-group"><label>Número</label><input type="text" id="col-numero"></div>
                </div>
                <div class="grid-4" id="div-complementos-col">
                    <div class="input-group"><label>Complemento</label><input type="text" id="col-complemento"></div>
                    <div class="input-group"><label>Bairro</label><input type="text" id="col-bairro"></div>
                    <div class="input-group"><label>Cidade</label><input type="text" id="col-cidade"></div>
                    <div class="input-group"><label>UF</label><input type="text" id="col-uf" maxlength="2"></div>
                </div>
                <div style="display: flex; margin-top: 15px;">
                    <button id="btn-salvar-coleta" class="btn-acao" onclick="salvarColeta()">Salvar Fornecedor</button>
                    <button id="btn-cancelar-coleta" class="btn-cancelar" onclick="cancelarEdicao('coleta')" style="margin-left: 10px;">Cancelar</button>
                </div>
            </div>
            <div class="card lista-itens">
                <h3>Fornecedores Cadastrados (Modelos)</h3>
                <div id="lista-coletas">Carregando dados...</div>
            </div>
        `;
        carregarColetas();
    }
    else if (abaDestino === 'regras-sla') {
        titulo.innerText = "Configuração de Regras, SLA e Pesos";
        area.innerHTML = `
            <div class="card" id="card-form-regra">
                <h3 id="tit-form-regra">Criar Categoria de Carga & Tempo de Serviço</h3>
                <div class="grid-4">
                    <div class="input-group" style="grid-column: span 2;"><label>Nome da Categoria</label><input type="text" id="regra-nome" placeholder="Ex: Expressa Leve"></div>
                    <div class="input-group"><label>SLA (Minutos de Parada)</label><input type="number" id="regra-sla" placeholder="Ex: 30"></div>
                    <div class="input-group">
                        <label>Prioridade</label>
                        <select id="regra-prioridade"><option value="Alta">Alta</option><option value="Média" selected>Média</option><option value="Baixa">Baixa</option></select>
                    </div>
                </div>
                <h4 style="margin-top: 15px; color: #ea580c; border-bottom: 1px solid #eee; padding-bottom: 5px;">📦 Cubagem Padrão Desta Categoria</h4>
                <div class="grid-4">
                    <div class="input-group"><label>Peso (kg)</label><input type="number" id="regra-peso" placeholder="Obrigatório"></div>
                    <div class="input-group"><label>Altura (cm)</label><input type="number" id="regra-alt" placeholder="Opcional"></div>
                    <div class="input-group"><label>Largura (cm)</label><input type="number" id="regra-larg" placeholder="Opcional"></div>
                    <div class="input-group"><label>Comp. (cm)</label><input type="number" id="regra-comp" placeholder="Opcional"></div>
                </div>
                <div style="display: flex; margin-top: 15px;">
                    <button id="btn-salvar-regra" class="btn-acao" onclick="salvarRegra()">Salvar Regra</button>
                    <button id="btn-cancelar-regra" class="btn-cancelar" onclick="cancelarEdicao('regra')" style="margin-left: 10px;">Cancelar</button>
                </div>
            </div>
            <div class="card lista-itens">
                <h3>Regras Cadastradas</h3>
                <div id="lista-regras">Carregando dados...</div>
            </div>
        `;
        carregarRegras();
    }
    else if (abaDestino === 'relatorios') {
        titulo.innerText = "Relatórios Gerenciais e Histórico";
        area.innerHTML = `
            <div class="card" id="area-pdf" style="background: white; padding: 40px; border: 1px solid #e2e8f0;">
                <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px;">
                    <img id="logo-relatorio" src="${empresa.caminho_logo ? empresa.caminho_logo : ''}" style="max-height: 60px; ${empresa.caminho_logo ? 'display:block; margin:0 auto;' : 'display:none;'}">
                    <h2 style="margin:0; color: #1e293b;">Relatório Geral de Operações</h2>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 6px;">
                    <div style="text-align: center;"><span style="color:#64748b; font-size:12px; font-weight:bold;">Total Entregas</span><br><strong id="rel-total" style="font-size:20px; color:#0f172a;">0</strong></div>
                    <div style="text-align: center;"><span style="color:#64748b; font-size:12px; font-weight:bold;">Média de SLA</span><br><strong id="rel-tempo" style="font-size:20px; color:#10b981;">0 min</strong></div>
                </div>
                <table class="tabela-dados" id="tabela-relatorio-coletas">
                    <thead><tr><th>Data</th><th>Cliente / Endereço</th><th>Previsto (SLA)</th><th>Peso</th><th>Status</th></tr></thead>
                    <tbody><tr><td colspan="5" style="text-align:center;">Buscando dados...</td></tr></tbody>
                </table>
            </div>
        `;
        carregarRelatorio();
    }
    else if (abaDestino === 'usuarios') {
        titulo.innerText = "Gestão de Usuários da Operação";
        area.innerHTML = `
            <div class="card" id="card-form-usuario">
                <h3 id="tit-form-usuario">Cadastrar Novo Operador/Despachante</h3>
                <div class="grid-4">
                    <div class="input-group">
                        <label>Nome Completo</label>
                        <input type="text" id="usu-nome" placeholder="Ex: Maria Santos">
                    </div>
                    <div class="input-group">
                        <label>E-mail</label>
                        <input type="email" id="usu-email" placeholder="maria@empresa.com">
                    </div>
                    <div class="input-group">
                        <label>Login Painel</label>
                        <input type="text" id="usu-login" placeholder="maria.santos">
                    </div>
                    <div class="input-group" style="position: relative;">
                        <label>Senha</label>
                        <input type="password" id="usu-senha" placeholder="Senha segura" style="padding-right: 40px;">
                        <button type="button" onclick="toggleSenha('usu-senha', this)" style="position: absolute; right: 10px; top: 25px; background: none; border: none; cursor: pointer; font-size: 16px;">👁️</button>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="input-group">
                        <label>Perfil</label>
                        <select id="usu-perfil"><option value="operador">Operador (Monta Rotas)</option><option value="motorista">Motorista (App de Campo)</option><option value="admin">Administrador</option></select>
                    </div>
                    <div class="input-group" id="div-usu-status" style="display: none;">
                        <label>Status</label>
                        <select id="usu-status"><option value="ativo">Ativo</option><option value="bloqueado">Bloqueado</option></select>
                    </div>
                </div>
                <div style="display: flex;">
                    <button id="btn-salvar-usuario" class="btn-acao" onclick="salvarUsuario()">Salvar Usuário</button>
                    <button id="btn-cancelar-usuario" class="btn-cancelar" onclick="cancelarEdicao('usuario')" style="margin-left: 10px;">Cancelar</button>
                </div>
            </div>
            <div class="card lista-itens">
                <h3>Usuários Cadastrados (<span id="usu-count" style="color:#0284c7">0</span>)</h3>
                <div id="lista-usuarios">Carregando dados...</div>
            </div>
        `;
        carregarUsuarios();
    }
    else if (abaDestino === 'motoristas') {
        titulo.innerText = "Gestão de Motoristas";
        area.innerHTML = `
            <div class="card" id="card-form-motorista">
                <h3 id="tit-form-motorista">Cadastrar Novo Motorista</h3>
                <div class="grid-4">
                    <div class="input-group"><label>Nome</label><input type="text" id="mot-nome" placeholder="Ex: João Silva"></div>
                    <div class="input-group"><label>E-mail</label><input type="email" id="mot-email"></div>
                    <div class="input-group"><label>Login App</label><input type="text" id="mot-login"></div>
                    <div class="input-group" style="position: relative;">
                        <label>Senha App</label>
                        <input type="password" id="mot-senha" style="padding-right: 40px;">
                        <button type="button" onclick="toggleSenha('mot-senha', this)" style="position: absolute; right: 10px; top: 25px; background: none; border: none; cursor: pointer; font-size: 16px;">👁️</button>
                    </div>
                </div>
                <div style="display: flex;">
                    <button id="btn-salvar-motorista" class="btn-acao" onclick="salvarMotorista()">Salvar Motorista</button>
                    <button id="btn-cancelar-motorista" class="btn-cancelar" onclick="cancelarEdicao('motorista')" style="margin-left: 10px;">Cancelar</button>
                </div>
            </div>
            <div class="card lista-itens">
                <h3>Motoristas Cadastrados (<span id="mot-count" style="color:#0284c7">0</span>)</h3>
                <div id="lista-motoristas">Carregando dados...</div>
            </div>
        `;
        carregarMotoristas();
    }
    else if (abaDestino === 'veiculos') {
        titulo.innerText = "Gestão de Veículos";
        area.innerHTML = `
            <div class="card" id="card-form-veiculo">
                <h3 id="tit-form-veiculo">Cadastrar Novo Veículo</h3>
                <div class="grid-4">
                    <div class="input-group" style="grid-column: span 2;"><label>Modelo / Descrição</label><input type="text" id="vei-modelo" placeholder="Ex: Caminhão Baú"></div>
                    <div class="input-group"><label>Placa</label><input type="text" id="vei-placa" placeholder="ABC-1234"></div>
                    <div class="input-group"><label>Capacidade (kg)</label><input type="number" id="vei-peso" placeholder="1500.00"></div>
                </div>
                <div style="display: flex;">
                    <button id="btn-salvar-veiculo" class="btn-acao" onclick="salvarVeiculo()">Salvar Veículo</button>
                    <button id="btn-cancelar-veiculo" class="btn-cancelar" onclick="cancelarEdicao('veiculo')" style="margin-left: 10px;">Cancelar</button>
                </div>
            </div>
            <div class="card lista-itens">
                <h3>Veículos Cadastrados (<span id="vei-count" style="color:#0284c7">0</span>)</h3>
                <div id="lista-veiculos">Carregando dados...</div>
            </div>
        `;
        carregarVeiculos();
    }
    else if (abaDestino === 'bases') {
        titulo.innerText = "Gestão de Bases Operacionais";
        area.innerHTML = `
            <div class="card" id="card-form-base">
                <h3 id="tit-form-base">Cadastrar Nova Base (Ponto de Partida)</h3>
                <div class="input-group"><label>Nome da Base</label><input type="text" id="base-nome" placeholder="Ex: Galpão Central"></div>
                <h4 class="sessao-titulo">📍 Endereço da Base</h4>
                <div class="grid-4" id="base-grid-cep-log">
                    <div class="input-group"><label>CEP</label><input type="text" id="base-cep" placeholder="00000-000" onblur="buscarCep('base')"></div>
                    <div class="input-group" style="grid-column: span 2;"><label id="base-rua-label">Rua / Avenida / Logradouro</label><input type="text" id="base-rua"></div>
                    <div class="input-group"><label>Número</label><input type="text" id="base-numero" placeholder="Ex: 1500"></div>
                </div>
                <div class="grid-4" id="div-complementos-base">
                    <div class="input-group"><label>Complemento</label><input type="text" id="base-complemento"></div>
                    <div class="input-group"><label>Bairro</label><input type="text" id="base-bairro"></div>
                    <div class="input-group"><label>Cidade</label><input type="text" id="base-cidade"></div>
                    <div class="input-group"><label>UF</label><input type="text" id="base-uf" maxlength="2"></div>
                </div>
                <p class="base-only-address-hint" style="margin:14px 0 0;font-size:13px;color:#64748b;line-height:1.45;">
                    <strong>Horários de turno, corte de expedição e virada do dia</strong> ficam em
                    <strong>Regras de entrega (turnos)</strong> — este cadastro é só o <strong>ponto de partida</strong> no mapa.
                </p>
                <div style="display: flex; margin-top: 10px;">
                    <button id="btn-salvar-base" class="btn-acao" onclick="salvarBase()">Salvar Base</button>
                    <button id="btn-cancelar-base" class="btn-cancelar" onclick="cancelarEdicao('base')" style="margin-left: 10px;">Cancelar</button>
                </div>
            </div>
            <div class="card lista-itens">
                <h3>Bases Cadastradas (<span id="base-count" style="color:#0284c7">0</span>)</h3>
                <div id="lista-bases">Carregando dados...</div>
            </div>
        `;
        carregarBases();
    }
    else if (abaDestino === 'regras-entrega') {
        titulo.innerText = 'Regras de entrega por turno';
        area.innerHTML = `
            <div class="card card--regras-entrega">
                <h3 style="margin-top:0;">Regras de entrega e expedição (por base)</h3>
                <p class="regras-entrega-intro">
                    Por cada <strong>base</strong>, configure quando as rotas <em>saem</em>, até quando cada turno “cabe” no planejamento,
                    os <strong>limites de inserção por turno</strong> (manhã e tarde) e a <strong>virada</strong> do calendário.
                    O endereço da base em si fica só em <strong>Bases operacionais</strong>.
                    Estes horários alimentam o painel <em>Rotas</em>.
                </p>
                <div class="regras-entrega-base-row">
                    <div class="input-group">
                        <label>Base</label>
                        <select id="regras-base-select"></select>
                    </div>
                    <button type="button" class="btn-acao" onclick="salvarRegrasEntregaTurno()">💾 Salvar horários</button>
                </div>
                <h4 class="sessao-titulo" style="margin:8px 0 10px;">Partida (saída da base por turno)</h4>
                <div class="regras-entrega-grid">
                    <div class="input-group"><label>Manhã</label><input type="time" id="regr-corte-manha" value="09:00"></div>
                    <div class="input-group"><label>Tarde</label><input type="time" id="regr-corte-tarde" value="14:00"></div>
                </div>
                <h4 class="sessao-titulo" style="margin:14px 0 10px;">Fim da janela de entrega (turno)</h4>
                <div class="regras-entrega-grid">
                    <div class="input-group"><label>Fim — manhã</label><input type="time" id="regr-fim-manha" value="12:00"></div>
                    <div class="input-group"><label>Fim — tarde</label><input type="time" id="regr-fim-tarde" value="18:00"></div>
                </div>
                <h4 class="sessao-titulo" style="margin:14px 0 10px;">Limite de inserção na rota (por turno)</h4>
                <p style="margin:0 0 10px;font-size:12px;color:#64748b;">Até este horário você ainda pode incluir novos endereços <strong>naquele turno</strong> para o dia atual (digite a hora ou use o seletor). Depois do limite, novas paradas passam para o <strong>dia seguinte</strong>, salvo uso de <em>Forçar na rota</em> no painel Rotas (com confirmação).</p>
                <div class="regras-entrega-grid">
                    <div class="input-group"><label>Limite inserção — manhã</label><input type="time" step="60" id="regr-limite-insercao-manha" value="10:30" inputmode="numeric" title="Ex.: rota pode sair às 08:00 e ainda aceitar inclusões na manhã até este horário."></div>
                    <div class="input-group"><label>Limite inserção — tarde</label><input type="time" step="60" id="regr-limite-insercao-tarde" value="16:00" inputmode="numeric" title="Ex.: turno da tarde pode começar às 14:00 e ainda aceitar inclusões até este horário."></div>
                </div>
                <h4 class="sessao-titulo" style="margin:14px 0 10px;">Fechamento do calendário</h4>
                <div class="regras-entrega-grid">
                    <div class="input-group"><label>Virada do dia (novos pedidos → dia seguinte)</label><input type="time" step="60" id="regr-corte-virada" value="18:30"></div>
                </div>
            </div>
        `;
        carregarRegrasEntregaTurnoUI();
    }
}

function toggleMenuMobile() {
    const menuTopo = document.getElementById('menu-lateral');
    if (!menuTopo) return;
    menuTopo.classList.toggle('menu-open');
}

// ---------------------------------------------------
// MAPA (VISÃO GERAL E AUDITORIA)
// ---------------------------------------------------
/** Imediatamente após o Nominatim retornar coordenadas da base (antes do save). */
function focarMapaAposGeocodeBase(lat, lng) {
    if (!mapaInstancia || lat == null || lng == null) return;
    const la = Number(lat);
    const ln = Number(lng);
    if (!isFinite(la) || !isFinite(ln)) return;
    LOJA_COORDS = [ln, la];
    mapaInstancia.flyTo([la, ln], ZOOM_BASE_OPERACIONAL, { duration: 0.55 });
    if (marcadorBasePainel) {
        marcadorBasePainel.setLatLng([la, ln]);
    } else {
        marcadorBasePainel = L.marker([la, ln])
            .addTo(mapaInstancia)
            .bindPopup('<strong>Base Operacional</strong>')
            .openPopup();
    }
}

/** Atualiza centro/zoom e marcador da base quando LOJA_COORDS já está definido (ex.: API carregou após o mapa). */
function focarMapaNaBaseCarregada() {
    if (!mapaInstancia) return;
    if (!Array.isArray(LOJA_COORDS) || LOJA_COORDS.length < 2) return;
    const lng = Number(LOJA_COORDS[0]);
    const lat = Number(LOJA_COORDS[1]);
    if (!isFinite(lat) || !isFinite(lng)) return;
    mapaInstancia.flyTo([lat, lng], ZOOM_BASE_OPERACIONAL, { duration: 0.55 });
    if (marcadorBasePainel) {
        marcadorBasePainel.setLatLng([lat, lng]);
    } else {
        marcadorBasePainel = L.marker([lat, lng])
            .addTo(mapaInstancia)
            .bindPopup('<strong>Base Operacional</strong>')
            .openPopup();
    }
}

// ===== Rastreamento em tempo real dos motoristas no painel gerencial =====
// Mesmo comportamento do /operacao/rotas.html: polling de 10s em
// /api/coletas/posicao/motoristas desenhando pinos pulsantes no mapa.
// As variáveis marcadoresMotoristasPainel/timerMotoristasPainel estão no
// topo do arquivo para evitar TDZ quando iniciarMapa() roda no bootstrap.
function tempoAtrasPainel(iso) {
    if (!iso) return '-';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '-';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return `há ${s}s`;
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    return `há ${Math.round(m / 60)} h`;
}

async function atualizarMotoristasPainel() {
    if (!mapaInstancia) return;
    let lista;
    try {
        const resp = await apiFetch('/api/coletas/posicao/motoristas');
        if (!resp.ok) return;
        lista = await resp.json();
    } catch (err) { return; }
    if (!Array.isArray(lista)) return;

    const vistos = new Set();
    lista.forEach((m) => {
        const uid = Number(m.usuario_id);
        const lat = parseFloat(m.lat);
        const lng = parseFloat(m.lng);
        if (!uid || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        vistos.add(uid);

        const nome = m.nome || m.login || `Motorista #${uid}`;
        const vel = m.velocidade != null ? `${(Number(m.velocidade) * 3.6).toFixed(1)} km/h` : '-';
        const precisao = m.precisao != null ? `${Math.round(Number(m.precisao))} m` : '-';
        const popupHtml = `
            <div style="min-width:180px">
                <strong style="font-size:14px">🚚 ${nome}</strong><br>
                <span style="color:#475569;font-size:12px">Velocidade: ${vel}</span><br>
                <span style="color:#475569;font-size:12px">Precisão: ${precisao}</span><br>
                <span style="color:#64748b;font-size:11px">Atualizado ${tempoAtrasPainel(m.atualizado_em)}</span>
            </div>`;

        if (marcadoresMotoristasPainel.has(uid)) {
            const mk = marcadoresMotoristasPainel.get(uid);
            mk.setLatLng([lat, lng]);
            if (mk.getPopup()) mk.getPopup().setContent(popupHtml);
        } else {
            const icon = L.divIcon({
                className: 'motorista-live-pin',
                html: '<div class="pulse"></div><div class="dot">🚚</div>',
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            const mk = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
                .addTo(mapaInstancia)
                .bindPopup(popupHtml);
            marcadoresMotoristasPainel.set(uid, mk);
        }
    });

    for (const [uid, mk] of marcadoresMotoristasPainel.entries()) {
        if (!vistos.has(uid)) {
            try { mapaInstancia.removeLayer(mk); } catch (_) {}
            marcadoresMotoristasPainel.delete(uid);
        }
    }
}

function iniciarRastreamentoMotoristasPainel() {
    if (timerMotoristasPainel) clearInterval(timerMotoristasPainel);
    atualizarMotoristasPainel();
    timerMotoristasPainel = setInterval(atualizarMotoristasPainel, 10000);
}

function iniciarMapa() {
    if (mapaInstancia !== null) {
        mapaInstancia.remove();
        mapaInstancia = null;
    }
    // Limpa pinos de motoristas antigos: serão recriados pelo polling em
    // seguida, mas no mapa novo (Leaflet descarta layers do mapa antigo).
    marcadoresMotoristasPainel.clear();
    marcadorBasePainel = null;
    // Sem LOJA_COORDS válidas: abre o mapa centralizado no Brasil (visão larga)
    // e sem pino de base. Quem definir as coords depois (sincronização da
    // base via /api/bases) chama focarMapaNaBaseCarregada e desenha o pino
    // no lugar correto. Antes usava-se um default fixo (BH/MG) que era a
    // base real de outro cliente, dando a sensação de "base errada".
    const temCoords = Array.isArray(LOJA_COORDS) && LOJA_COORDS.length >= 2
        && isFinite(Number(LOJA_COORDS[0])) && isFinite(Number(LOJA_COORDS[1]));
    if (temCoords) {
        const lat = Number(LOJA_COORDS[1]);
        const lng = Number(LOJA_COORDS[0]);
        mapaInstancia = L.map('mapa-container').setView([lat, lng], ZOOM_BASE_OPERACIONAL);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaInstancia);
        marcadorBasePainel = L.marker([lat, lng])
            .addTo(mapaInstancia)
            .bindPopup('<strong>Base Operacional</strong>')
            .openPopup();
    } else {
        mapaInstancia = L.map('mapa-container').setView([-15.78, -47.93], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaInstancia);
    }
    iniciarRastreamentoMotoristasPainel();
}

function limparRotasDoMapa() {
    layersPinos.forEach(l => { if(mapaInstancia) mapaInstancia.removeLayer(l); }); layersPinos = [];
    layersLinhas.forEach(l => { if(mapaInstancia) mapaInstancia.removeLayer(l); }); layersLinhas = [];
}

async function carregarRotasDoGestor() {
    const dataFiltro = document.getElementById('filtro-data-gestor').value;
    const turnoFiltro = document.getElementById('filtro-turno-gestor').value;
    const divLista = document.getElementById('lista-rotas-gestor');
    if(!dataFiltro) return; divLista.innerHTML = '⏳ Buscando rotas do operador...'; limparRotasDoMapa();

    try {
        const res = await apiFetch(`/api/coletas/${empresa.id}`);
        dbStore.coletas = await res.json();
        
        let pacotes = dbStore.coletas.filter(e => e.data_entrega && e.data_entrega.startsWith(dataFiltro) && e.periodo === turnoFiltro && e.ordem > 0 && e.tamanho !== 'Coleta');
        pacotes.sort((a, b) => a.ordem - b.ordem);

        if(pacotes.length === 0) { divLista.innerHTML = '<p style="color:#ef4444; font-weight:bold;">Nenhuma rota criada pelo Operador para este turno.</p>'; return; }

        divLista.innerHTML = '';
        const bounds = new L.LatLngBounds(); bounds.extend([LOJA_COORDS[1], LOJA_COORDS[0]]);
        
        pacotes.forEach(p => {
            const corBorda = p.cor_icone || '#0284c7';
            if(p.lat && p.lng) {
                const marker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'custom-pin', html: `<div style="background:${corBorda}; color:white; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.4); font-size:11px;">${p.ordem}</div>`, iconSize:[26,26] }) }).addTo(mapaInstancia);
                marker.bindPopup(`<b>${p.ordem}º - ${p.fornecedor}</b><br>${p.endereco}`);
                layersPinos.push(marker); bounds.extend([p.lat, p.lng]);
            }
            divLista.innerHTML += `<div style="border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px; margin-bottom: 8px; background: #f8fafc; display:flex; justify-content: space-between; align-items: center; border-left: 4px solid ${corBorda};"><div><strong style="color: #1e293b; font-size: 13px;">${p.ordem}º Parada: ${p.fornecedor}</strong><br><span style="font-size: 10px; color:#64748b;">${p.endereco}</span></div><div style="display:flex; gap: 5px; flex-direction: column;"><button style="background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; cursor:pointer; border-radius:4px; padding: 2px 8px; font-size: 10px; font-weight:bold;" onclick="moverOrdemGestor(${p.id}, -1)">▲</button><button style="background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; cursor:pointer; border-radius:4px; padding: 2px 8px; font-size: 10px; font-weight:bold;" onclick="moverOrdemGestor(${p.id}, 1)">▼</button></div></div>`;
        });
        if (layersPinos.length > 0 && mapaInstancia) { mapaInstancia.fitBounds(bounds, { padding: [30, 30] }); }

        const validCoords = pacotes.filter(p => p.lat && p.lng).map(p => [p.lng, p.lat]);
        if(validCoords.length > 0) {
            try {
                const corLinha = pacotes[0].cor_icone || '#0284c7';
                const r = await apiFetch('/api/ors/directions/driving-car/geojson', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [LOJA_COORDS, ...validCoords, LOJA_COORDS] }) });
                if (r.ok) {
                    const gj = await r.json();
                    // Só desenha se veio GeoJSON válido (evita travar tudo por 4xx do ORS).
                    if (gj && gj.type) {
                        layersLinhas.push(L.geoJSON(gj, { style: { color: corLinha, weight: 6, opacity: 0.6 } }).addTo(mapaInstancia));
                    }
                } else {
                    console.warn('[painel] ORS falhou ao desenhar linha da rota, seguindo sem linha.', r.status);
                }
            } catch (eOrs) {
                console.warn('[painel] erro ao traçar linha da rota (não-fatal)', eOrs && eOrs.message);
            }
        }
    } catch(e) {
        console.error('[painel] carregarRotasDoGestor falhou:', e);
        divLista.innerHTML = '<p style="color:red;">Erro ao buscar rotas.</p>';
    }
}

function moverOrdemGestor(id, direcao) {
    const dataFiltro = document.getElementById('filtro-data-gestor').value; const turnoFiltro = document.getElementById('filtro-turno-gestor').value;
    let pacotesTurno = dbStore.coletas.filter(e => e.data_entrega && e.data_entrega.startsWith(dataFiltro) && e.periodo === turnoFiltro && e.ordem > 0 && e.tamanho !== 'Coleta').sort((a, b) => a.ordem - b.ordem);
    const iAtual = pacotesTurno.findIndex(e => e.id === id); if (iAtual === -1) return; const iAlvo = iAtual + direcao;
    if (iAlvo >= 0 && iAlvo < pacotesTurno.length) { const pAtual = pacotesTurno[iAtual]; const pAlvo = pacotesTurno[iAlvo]; const temp = pAtual.ordem; pAtual.ordem = pAlvo.ordem; pAlvo.ordem = temp; carregarRotasDoGestor(); }
}

async function salvarAlteracaoGerencial() {
    const dataFiltro = document.getElementById('filtro-data-gestor').value; const turnoFiltro = document.getElementById('filtro-turno-gestor').value;
    let pacotesTurno = dbStore.coletas.filter(e => e.data_entrega && e.data_entrega.startsWith(dataFiltro) && e.periodo === turnoFiltro && e.ordem > 0 && e.tamanho !== 'Coleta');
    if(pacotesTurno.length === 0) return alert("Não há rotas para salvar.");

    const validCoords = pacotesTurno.filter(p => p.lat && p.lng).map(p => [p.lng, p.lat]);
    if(validCoords.length > 0) {
        try {
            const r = await apiFetch('/api/ors/directions/driving-car/json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinates: [LOJA_COORDS, ...validCoords] }) });
            const data = await r.json();
            if (data.routes && data.routes.length > 0) { const segments = data.routes[0].segments; pacotesTurno.forEach((p, index) => { if (segments[index]) { p.distancia_km = (segments[index].distance / 1000).toFixed(1); p.tempo_viagem = Math.round(segments[index].duration / 60); } }); }
        } catch(e) {}
    }

    const payloadEnvio = pacotesTurno.map((p) => ({
        id: p.id,
        periodo: p.periodo,
        status: p.status,
        ordem: p.ordem,
        tempo_viagem: p.tempo_viagem,
        distancia_km: p.distancia_km,
        cor_icone: p.cor_icone
    }));
    try {
        await apiFetchJson('/api/coletas/roteamento/lote', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entregas: payloadEnvio })
        });
        alert("✔️ Correção Gerencial salva com sucesso! O Operador já verá a nova ordem."); carregarRotasDoGestor();
    } catch(e) { alert("Erro ao salvar correção."); }
}

// ---------------------------------------------------
// CRUD: REGRAS E SLA (COM CUBAGEM)
// ---------------------------------------------------
async function carregarRegras() {
    const divLista = document.getElementById('lista-regras'); if(!divLista) return;
    try {
        const res = await apiFetch(`/api/regras/${empresa.id}`); dbStore.regras = await res.json(); divLista.innerHTML = '';
        if(dbStore.regras.length === 0) { divLista.innerHTML = '<p style="color:#666;">Nenhuma regra cadastrada.</p>'; return; }
        dbStore.regras.forEach(r => {
            let cor = r.prioridade === 'Alta' ? '#dc2626' : (r.prioridade === 'Média' ? '#f59e0b' : '#16a34a');
            divLista.innerHTML += `<div class="item-linha"><div><strong>${r.nome_categoria}</strong><br><span style="font-size:12px; color:#666;">SLA: ${r.tempo_sla} min | Peso Padrão: <b>${r.peso||0}kg</b> | <strong style="color:${cor}">${r.prioridade}</strong></span></div><div><button class="btn-editar" onclick="editarRegra(${r.id})">✏️ Editar</button><button class="btn-excluir" onclick="excluirRegra(${r.id})">❌ Excluir</button></div></div>`;
        });
    } catch (e) { divLista.innerHTML = '<p style="color:red;">Erro de conexão.</p>'; }
}
function editarRegra(id) {
    const r = dbStore.regras.find(x => x.id === id); if(!r) return; editando.regra = id;
    document.getElementById('regra-nome').value = r.nome_categoria; document.getElementById('regra-sla').value = r.tempo_sla; document.getElementById('regra-prioridade').value = r.prioridade;
    document.getElementById('regra-peso').value = r.peso || ''; document.getElementById('regra-alt').value = r.altura || ''; document.getElementById('regra-larg').value = r.largura || ''; document.getElementById('regra-comp').value = r.comprimento || '';
    document.getElementById('tit-form-regra').innerText = `✏️ Editando Regra`; document.getElementById('btn-salvar-regra').innerText = `💾 Salvar`; document.getElementById('btn-salvar-regra').style.backgroundColor = "#0284c7"; document.getElementById('btn-cancelar-regra').style.display = "block"; window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function salvarRegra() {
    const nome_categoria = document.getElementById('regra-nome').value, tempo_sla = document.getElementById('regra-sla').value, prioridade = document.getElementById('regra-prioridade').value;
    const peso = document.getElementById('regra-peso').value, altura = document.getElementById('regra-alt').value, largura = document.getElementById('regra-larg').value, comprimento = document.getElementById('regra-comp').value;
    if(!nome_categoria || !tempo_sla || !peso) return alert("Preencha Categoria, SLA e Peso!");
    const metodo = editando.regra ? 'PUT' : 'POST'; const url = editando.regra ? `/api/regras/${editando.regra}` : '/api/regras';
    try {
        const res = await apiFetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa_id: empresa.id, nome_categoria, tempo_sla, prioridade, peso, altura, largura, comprimento }) });
        if (res.ok) { cancelarEdicao('regra'); carregarRegras(); } else { alert("Erro ao salvar."); }
    } catch (e) { alert("Erro de conexão."); }
}
async function excluirRegra(id) { if(confirm("Excluir regra?")) { await apiFetch(`/api/regras/${id}`, { method: 'DELETE' }); carregarRegras(); } }

// ---------------------------------------------------
// CRUD: FORNECEDORES (Cargas / Modelos)
// ---------------------------------------------------
async function carregarColetas() {
    const divLista = document.getElementById('lista-coletas'); if(!divLista) return;
    try {
        const res = await apiFetch(`/api/coletas/${empresa.id}`); dbStore.coletas = await res.json(); divLista.innerHTML = '';
        const apenasFornecedores = dbStore.coletas.filter(c => c.status === 'modelo');
        if(apenasFornecedores.length === 0) { divLista.innerHTML = '<p style="color:#666;">Nenhum fornecedor cadastrado.</p>'; return; }
        
        apenasFornecedores.forEach((c) => {
            const cid = Number(c.id);
            const txtEnd = c.endereco ? c.endereco : '<i style="color:#999;">Sem endereço fixo</i>';
            const txtC = c.lat ? `<span style="color:#10b981;">(Com GPS)</span>` : `<span style="color:#dc2626;">(Sem GPS)</span>`;
            divLista.innerHTML += `<div class="item-linha"><div><strong>${c.fornecedor}</strong> ${txtC}<br><span style="font-size:12px; color:#666;">Local: ${txtEnd}</span></div><div><button type="button" class="btn-editar" onclick="editarColeta(${cid})">✏️ Editar</button><button type="button" class="btn-excluir" onclick="excluirColeta(${cid})">❌ Excluir</button></div></div>`;
        });
    } catch (e) { divLista.innerHTML = '<p style="color:red;">Erro de conexão.</p>'; }
}
function editarColeta(id) {
    const cid = Number(id);
    const c = dbStore.coletas.find((x) => Number(x.id) === cid);
    if (!c) return;
    editando.coleta = cid;
    document.getElementById('col-fornecedor').value = c.fornecedor || '';
    document.getElementById('div-complementos-col').style.display = 'grid';
    document.getElementById('col-cep').disabled = false;
    document.getElementById('col-numero').disabled = false;
    const p = parseEnderecoSalvoPainel(c.endereco || '');
    document.getElementById('col-cep').value = p.cep || '';
    document.getElementById('col-rua').value = p.rua || (c.endereco || '');
    document.getElementById('col-numero').value = p.numero || '';
    document.getElementById('col-complemento').value = p.complemento || '';
    document.getElementById('col-bairro').value = p.bairro || '';
    document.getElementById('col-cidade').value = p.cidade || '';
    document.getElementById('col-uf').value = p.uf || '';
    document.getElementById('tit-form-coleta').innerText = '✏️ Editando Fornecedor';
    document.getElementById('btn-salvar-coleta').innerText = '💾 Salvar';
    document.getElementById('btn-salvar-coleta').style.backgroundColor = '#0284c7';
    document.getElementById('btn-cancelar-coleta').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function salvarColeta() {
    const btn = document.getElementById('btn-salvar-coleta');
    const fornecedor = document.getElementById('col-fornecedor').value.trim();
    if (!fornecedor) return alert('O Nome do Fornecedor é obrigatório!');

    const cep = document.getElementById('col-cep').value.replace(/\D/g, '');
    const rua = document.getElementById('col-rua').value.trim();
    const numero = document.getElementById('col-numero').value.trim();
    const complemento = document.getElementById('col-complemento').value.trim();
    const bairro = document.getElementById('col-bairro').value.trim();
    const cidade = document.getElementById('col-cidade').value.trim();
    const uf = document.getElementById('col-uf').value.trim();

    let enderecoFormatado = '';
    let lat = null;
    let lng = null;
    const cAntiga = editando.coleta ? dbStore.coletas.find((x) => Number(x.id) === Number(editando.coleta)) : null;

    if (rua && numero && cidade && uf) {
        const compl = complemento ? ` - ${complemento}` : '';
        const calcCep = cep ? `, CEP: ${cep}` : '';
        enderecoFormatado = `${rua}, ${numero}${compl} - ${bairro}, ${cidade} - ${uf}${calcCep}`;
        if (btn) {
            btn.innerText = 'Localizando...';
            btn.disabled = true;
        }
        try {
            const geo = await geocodificarEnderecoBrasil(`${rua}, ${numero}, ${bairro ? `${bairro}, ` : ''}${cidade} - ${uf}`, cep);
            if (geo.lat != null && geo.lng != null) {
                lat = geo.lat;
                lng = geo.lng;
            }
        } catch (e) {}
        if ((lat == null || lng == null) && cAntiga) {
            lat = cAntiga.lat;
            lng = cAntiga.lng;
        }
    } else if (editando.coleta && cAntiga) {
        enderecoFormatado = (rua || cAntiga.endereco || '').trim();
        if (!enderecoFormatado) return alert('Preencha logradouro e número (e cidade/UF) ou mantenha um endereço válido.');
        lat = cAntiga.lat;
        lng = cAntiga.lng;
    } else if (!editando.coleta) {
        enderecoFormatado = '';
    } else {
        return alert('Preencha logradouro, número, cidade e UF para gravar o endereço estruturado e o mapa.');
    }

    const metodo = editando.coleta ? 'PUT' : 'POST';
    const url = editando.coleta ? `/api/coletas/${editando.coleta}` : '/api/coletas';
    try {
        const res = await apiFetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                empresa_id: empresa.id,
                fornecedor,
                endereco: enderecoFormatado,
                lat,
                lng,
                tamanho: 'ModeloFornecedor',
                status: 'modelo',
            }),
        });
        if (res.ok) {
            cancelarEdicao('coleta');
            carregarColetas();
        } else {
            alert('Erro ao salvar');
        }
    } catch (e) {
        alert('Erro de conexão.');
    }
    if (btn) {
        btn.innerText = 'Salvar Fornecedor';
        btn.disabled = false;
    }
}
async function excluirColeta(id) { if(confirm("Excluir fornecedor?")) { await apiFetch(`/api/coletas/${id}`, { method: 'DELETE' }); carregarColetas(); } }

// ---------------------------------------------------
// CRUD: USUÁRIOS, MOTORISTAS, VEÍCULOS, BASES
// ---------------------------------------------------
async function carregarUsuarios() { const divLista = document.getElementById('lista-usuarios'); if(!divLista) return; try { const res = await apiFetch(`/api/usuarios/${empresa.id}`); dbStore.usuarios = await res.json(); document.getElementById('usu-count').innerText = dbStore.usuarios.length; divLista.innerHTML = ''; if(dbStore.usuarios.length === 0) { divLista.innerHTML = '<p style="color:#666;">Nenhum usuário cadastrado.</p>'; return; } dbStore.usuarios.forEach(u => { const statusCor = u.status === 'ativo' ? '#10b981' : '#dc2626'; divLista.innerHTML += `<div class="item-linha"><div><strong>${u.nome}</strong> (${u.perfil})<br><span style="font-size:12px; color:#666;">Login: ${u.login} | E-mail: ${u.email}</span><br><span style="font-size:12px; color:${statusCor}; font-weight:bold;">${u.status.toUpperCase()}</span></div><div><button class="btn-editar" onclick="editarUsuario(${u.id})">✏️ Editar</button><button class="btn-excluir" onclick="excluirUsuario(${u.id})">❌ Excluir</button></div></div>`; }); } catch (e) {} }
function editarUsuario(id) { const u = dbStore.usuarios.find(x => x.id === id); if(!u) return; editando.usuario = id; document.getElementById('usu-nome').value = u.nome; document.getElementById('usu-email').value = u.email; document.getElementById('usu-login').value = u.login; document.getElementById('usu-senha').value = ''; document.getElementById('usu-perfil').value = u.perfil; document.getElementById('div-usu-status').style.display = "block"; document.getElementById('usu-status').value = u.status; document.getElementById('tit-form-usuario').innerText = `✏️ Editando: ${u.nome}`; document.getElementById('btn-salvar-usuario').innerText = `💾 Salvar`; document.getElementById('btn-salvar-usuario').style.backgroundColor = "#0284c7"; document.getElementById('btn-cancelar-usuario').style.display = "block"; window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function salvarUsuario() { const nome = document.getElementById('usu-nome').value, email = document.getElementById('usu-email').value, login = document.getElementById('usu-login').value, senha = document.getElementById('usu-senha').value, perfil = document.getElementById('usu-perfil').value, status = editando.usuario ? document.getElementById('usu-status').value : 'ativo'; if(!nome || !login || !email) return alert("Preencha todos os campos obrigatórios!"); if(!editando.usuario && !senha) return alert("A senha é obrigatória para novos usuários."); const metodo = editando.usuario ? 'PUT' : 'POST'; const url = editando.usuario ? `/api/usuarios/${editando.usuario}` : '/api/usuarios'; try { const res = await apiFetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa_id: empresa.id, nome, login, senha, email, perfil, status }) }); if (res.ok) { cancelarEdicao('usuario'); carregarUsuarios(); } else { const resp = await res.json(); alert(resp.erro); } } catch (e) { alert("Erro de conexão."); } }
async function excluirUsuario(id) { if(confirm("Excluir?")) { await apiFetch(`/api/usuarios/${id}`, { method: 'DELETE' }); carregarUsuarios(); } }

async function carregarMotoristas() { const divLista = document.getElementById('lista-motoristas'); if(!divLista) return; try { const res = await apiFetch(`/api/motoristas/${empresa.id}`); dbStore.motoristas = await res.json(); document.getElementById('mot-count').innerText = dbStore.motoristas.length; divLista.innerHTML = ''; if(dbStore.motoristas.length === 0) { divLista.innerHTML = '<p style="color:#666;">Nenhum motorista cadastrado ainda.</p>'; return; } dbStore.motoristas.forEach(m => { divLista.innerHTML += `<div class="item-linha"><div><strong>${m.nome}</strong><br><span style="font-size:12px; color:#666;">Login: ${m.login} | E-mail: ${m.email}</span></div><div><button class="btn-editar" onclick="editarMotorista(${m.id})">✏️ Editar</button><button class="btn-excluir" onclick="excluirMotorista(${m.id})">❌ Excluir</button></div></div>`; }); } catch (e) {} }
function editarMotorista(id) { const m = dbStore.motoristas.find(x => x.id === id); if(!m) return; editando.motorista = id; document.getElementById('mot-nome').value = m.nome; document.getElementById('mot-email').value = m.email; document.getElementById('mot-login').value = m.login; document.getElementById('mot-senha').value = ''; document.getElementById('tit-form-motorista').innerText = `✏️ Editando: ${m.nome}`; document.getElementById('btn-salvar-motorista').innerText = `💾 Salvar`; document.getElementById('btn-salvar-motorista').style.backgroundColor = "#0284c7"; document.getElementById('btn-cancelar-motorista').style.display = "block"; window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function salvarMotorista() { const nome = document.getElementById('mot-nome').value, email = document.getElementById('mot-email').value, login = document.getElementById('mot-login').value, senha = document.getElementById('mot-senha').value; if(!nome || !login || !email) return alert("Preencha todos os campos obrigatórios!"); if(!editando.motorista && !senha) return alert("A senha é obrigatória para novos motoristas."); const metodo = editando.motorista ? 'PUT' : 'POST'; const url = editando.motorista ? `/api/motoristas/${editando.motorista}` : '/api/motoristas'; try { const res = await apiFetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa_id: empresa.id, nome, login, senha, email }) }); if (res.ok) { cancelarEdicao('motorista'); carregarMotoristas(); } else { const resposta = await res.json(); alert(resposta.erro); } } catch (e) { alert("Erro de conexão."); } }
async function excluirMotorista(id) { if(confirm("Excluir?")) { await apiFetch(`/api/motoristas/${id}`, { method: 'DELETE' }); carregarMotoristas(); } }

async function carregarVeiculos() { const divLista = document.getElementById('lista-veiculos'); if(!divLista) return; try { const res = await apiFetch(`/api/veiculos/${empresa.id}`); dbStore.veiculos = await res.json(); document.getElementById('vei-count').innerText = dbStore.veiculos.length; divLista.innerHTML = ''; if(dbStore.veiculos.length === 0) { divLista.innerHTML = '<p style="color:#666;">Nenhum veículo cadastrado ainda.</p>'; return; } dbStore.veiculos.forEach(v => { divLista.innerHTML += `<div class="item-linha"><div><strong>${v.modelo}</strong><br><span style="font-size:12px; color:#666;">Placa: ${v.placa} | Capacidade: ${v.capacidade_peso} kg</span></div><div><button class="btn-editar" onclick="editarVeiculo(${v.id})">✏️ Editar</button><button class="btn-excluir" onclick="excluirVeiculo(${v.id})">❌ Excluir</button></div></div>`; }); } catch (e) {} }
function editarVeiculo(id) { const v = dbStore.veiculos.find(x => x.id === id); if(!v) return; editando.veiculo = id; document.getElementById('vei-modelo').value = v.modelo; document.getElementById('vei-placa').value = v.placa; document.getElementById('vei-peso').value = v.capacidade_peso; document.getElementById('tit-form-veiculo').innerText = `✏️ Editando Veículo`; document.getElementById('btn-salvar-veiculo').innerText = `💾 Salvar`; document.getElementById('btn-salvar-veiculo').style.backgroundColor = "#0284c7"; document.getElementById('btn-cancelar-veiculo').style.display = "block"; window.scrollTo({ top: 0, behavior: 'smooth' }); }
async function salvarVeiculo() { const modelo = document.getElementById('vei-modelo').value, placa = document.getElementById('vei-placa').value, capacidade_peso = document.getElementById('vei-peso').value; if(!modelo || !placa || !capacidade_peso) return alert("Preencha todos!"); const metodo = editando.veiculo ? 'PUT' : 'POST'; const url = editando.veiculo ? `/api/veiculos/${editando.veiculo}` : '/api/veiculos'; try { const res = await apiFetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empresa_id: empresa.id, modelo, placa, capacidade_peso }) }); if (res.ok) { cancelarEdicao('veiculo'); carregarVeiculos(); } else { const resposta = await res.json(); alert(resposta.erro); } } catch (e) { alert("Erro de conexão."); } }
async function excluirVeiculo(id) { if(confirm("Excluir?")) { await apiFetch(`/api/veiculos/${id}`, { method: 'DELETE' }); carregarVeiculos(); } }

async function carregarBases() {
    const divLista = document.getElementById('lista-bases');
    if (!divLista) return;
    try {
        const res = await apiFetch(`/api/bases/${empresa.id}`);
        dbStore.bases = await res.json();
        document.getElementById('base-count').innerText = dbStore.bases.length;
        divLista.innerHTML = '';
        if (dbStore.bases.length === 0) {
            divLista.innerHTML = '<p style="color:#666;">Nenhuma base cadastrada.</p>';
            return;
        }
        dbStore.bases.forEach((b) => {
            const bid = Number(b.id);
            const txtC = b.lat && b.lng ? `<span style="color:#10b981;">(No Mapa)</span>` : `<span style="color:#dc2626;">(Sem Mapa)</span>`;
            divLista.innerHTML += `<div class="item-linha"><div><strong>${b.nome}</strong> ${txtC}<br><span style="font-size:12px; color:#666;">Endereço: ${b.endereco}</span></div><div><button type="button" class="btn-editar" onclick="editarBase(${bid})">✏️ Editar</button><button type="button" class="btn-excluir" onclick="excluirBase(${bid})">❌ Excluir</button></div></div>`;
        });
    } catch (e) {}
}
function formatarHoraBase(v) {
    if (!v) return '09:00';
    const s = String(v);
    return s.length >= 5 ? s.slice(0, 5) : s;
}

async function carregarRegrasEntregaTurnoUI(preserveBaseId) {
    const sel = document.getElementById('regras-base-select');
    if (!sel) return;
    try {
        const res = await apiFetch(`/api/bases/${empresa.id}`);
        dbStore.bases = await res.json();
        sel.innerHTML = '';
        if (!dbStore.bases.length) {
            sel.innerHTML = '<option value="">Cadastre uma base em "Bases operacionais"</option>';
            sel.disabled = true;
            return;
        }
        sel.disabled = false;
        dbStore.bases.forEach((b) => {
            sel.innerHTML += `<option value="${b.id}">${b.nome || 'Base ' + b.id}</option>`;
        });
        sel.onchange = () => preencherFormRegrasEntrega(Number(sel.value));
        const candidato = preserveBaseId != null && dbStore.bases.some((x) => Number(x.id) === Number(preserveBaseId))
            ? Number(preserveBaseId)
            : Number(dbStore.bases[0].id);
        sel.value = String(candidato);
        preencherFormRegrasEntrega(candidato);
    } catch (e) {
        sel.innerHTML = '<option value="">Erro ao carregar bases</option>';
        sel.disabled = true;
    }
}

function preencherFormRegrasEntrega(baseId) {
    const b = dbStore.bases.find((x) => Number(x.id) === Number(baseId));
    if (!b) return;
    const set = (id, val, fallback) => {
        const el = document.getElementById(id);
        if (el) el.value = formatarHoraBase(val || fallback);
    };
    set('regr-corte-manha', b.corte_manha, '09:00');
    set('regr-corte-tarde', b.corte_tarde, '14:00');
    set('regr-fim-manha', b.fim_turno_manha, '12:00');
    set('regr-fim-tarde', b.fim_turno_tarde, '18:00');
    set('regr-limite-insercao-manha', b.limite_insercao_manha || b.corte_insercao_rota, '10:30');
    set('regr-limite-insercao-tarde', b.limite_insercao_tarde || b.corte_insercao_rota, '16:00');
    set('regr-corte-virada', b.corte_virada_dia, '18:30');
}

async function salvarRegrasEntregaTurno() {
    const sel = document.getElementById('regras-base-select');
    if (!sel || sel.disabled || !sel.value) {
        return alert('Cadastre uma base em "Bases operacionais" antes de definir os horários.');
    }
    const id = Number(sel.value);
    const b = dbStore.bases.find((x) => Number(x.id) === id);
    if (!b) return alert('Base não encontrada. Recarregue a página.');
    const hhmm = (id, padrao) => {
        const el = document.getElementById(id);
        const v = el && el.value;
        if (!v || typeof v !== 'string') return padrao;
        return v.length >= 5 ? v.slice(0, 5) : v;
    };
    const body = {
        nome: b.nome,
        endereco: b.endereco,
        lat: b.lat,
        lng: b.lng,
        corte_manha: hhmm('regr-corte-manha', '09:00'),
        corte_tarde: hhmm('regr-corte-tarde', '14:00'),
        fim_turno_manha: hhmm('regr-fim-manha', '12:00'),
        fim_turno_tarde: hhmm('regr-fim-tarde', '18:00'),
        limite_insercao_manha: hhmm('regr-limite-insercao-manha', '10:30'),
        limite_insercao_tarde: hhmm('regr-limite-insercao-tarde', '16:00'),
        corte_virada_dia: hhmm('regr-corte-virada', '18:30')
    };
    try {
        const res = await apiFetch(`/api/bases/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            alert('✔️ Horários salvos.');
            await carregarRegrasEntregaTurnoUI(id);
        } else {
            const j = await res.json().catch(() => ({}));
            alert(j.erro || 'Erro ao salvar.');
        }
    } catch (e) {
        alert('Erro de conexão.');
    }
}

function editarBase(id) {
    const bid = Number(id);
    const b = dbStore.bases.find((x) => Number(x.id) === bid);
    if (!b) return;
    editando.base = bid;
    document.getElementById('base-nome').value = b.nome || '';
    const lbl = document.getElementById('base-rua-label');
    if (lbl) lbl.innerText = 'Rua / Avenida / Logradouro';
    const gCep = document.getElementById('base-grid-cep-log');
    const dComp = document.getElementById('div-complementos-base');
    if (gCep) gCep.style.display = 'grid';
    if (dComp) dComp.style.display = 'grid';
    document.getElementById('base-cep').disabled = false;
    document.getElementById('base-numero').disabled = false;
    const p = parseEnderecoSalvoPainel(b.endereco || '');
    document.getElementById('base-cep').value = p.cep || '';
    document.getElementById('base-rua').value = p.rua || (b.endereco || '');
    document.getElementById('base-numero').value = p.numero || '';
    document.getElementById('base-complemento').value = p.complemento || '';
    document.getElementById('base-bairro').value = p.bairro || '';
    document.getElementById('base-cidade').value = p.cidade || '';
    document.getElementById('base-uf').value = p.uf || '';
    document.getElementById('tit-form-base').innerText = '✏️ Editando base operacional';
    document.getElementById('btn-salvar-base').innerText = '💾 Salvar alterações';
    document.getElementById('btn-salvar-base').style.backgroundColor = '#0284c7';
    document.getElementById('btn-cancelar-base').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function salvarBase() {
    const btn = document.getElementById('btn-salvar-base');
    const nome = document.getElementById('base-nome').value.trim();

    let enderecoFinal = '';
    let lat = null;
    let lng = null;

    if (!nome) return alert('Informe o nome da base.');

    if (editando.base) {
        const cep = document.getElementById('base-cep').value.replace(/\D/g, '');
        const rua = document.getElementById('base-rua').value.trim();
        const numero = document.getElementById('base-numero').value.trim();
        const complemento = document.getElementById('base-complemento').value.trim();
        const bairro = document.getElementById('base-bairro').value.trim();
        const cidade = document.getElementById('base-cidade').value.trim();
        const uf = document.getElementById('base-uf').value.trim();
        if (rua && numero && cidade && uf) {
            const compl = complemento ? ` - ${complemento}` : '';
            const calcCep = cep ? `, CEP: ${cep}` : '';
            enderecoFinal = `${rua}, ${numero}${compl} - ${bairro}, ${cidade} - ${uf}${calcCep}`;
        } else {
            enderecoFinal = document.getElementById('base-rua').value.trim();
        }
        if (!enderecoFinal) return alert('Preencha o endereço (logradouro, número, cidade e UF ou texto completo).');
        const bAntiga = dbStore.bases.find((x) => Number(x.id) === Number(editando.base));
        if (btn) {
            btn.innerText = 'Localizando no mapa...';
            btn.disabled = true;
        }
        try {
            let geo = { lat: null, lng: null };
            if (rua && numero && cidade && uf) {
                geo = await geocodificarBaseOperacional({
                    rua,
                    numero,
                    cidade,
                    uf,
                    cep
                });
            } else {
                const pTxt = parseEnderecoSalvoPainel(enderecoFinal);
                if (pTxt.rua && pTxt.numero && pTxt.cidade && pTxt.uf) {
                    geo = await geocodificarBaseOperacional({
                        rua: pTxt.rua,
                        numero: pTxt.numero,
                        cidade: pTxt.cidade,
                        uf: pTxt.uf,
                        cep: pTxt.cep
                    });
                } else {
                    const limpo = higienizarTextoEnderecoParaGeocode(enderecoFinal, pTxt.bairro);
                    geo = await geocodificarEnderecoBrasil(limpo, pTxt.cep);
                }
            }
            if (geo.lat != null && geo.lng != null) {
                lat = geo.lat;
                lng = geo.lng;
                focarMapaAposGeocodeBase(lat, lng);
            } else if (bAntiga) {
                lat = bAntiga.lat;
                lng = bAntiga.lng;
            }
        } catch (e) {
            if (bAntiga) {
                lat = bAntiga.lat;
                lng = bAntiga.lng;
            }
        }
        const metodo = 'PUT';
        const url = `/api/bases/${editando.base}`;
        try {
            const res = await apiFetch(url, {
                method: metodo,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome,
                    endereco: enderecoFinal,
                    lat,
                    lng
                })
            });
            if (res.ok) {
                if (lat != null && lng != null) {
                    LOJA_COORDS = [lng, lat];
                    focarMapaNaBaseCarregada();
                }
                cancelarEdicao('base');
                carregarBases();
            } else {
                const resposta = await res.json();
                alert(resposta.erro || 'Erro ao salvar.');
            }
        } catch (e) { alert('Erro de conexão.'); }
        if (btn) { btn.innerText = '💾 Salvar alterações'; btn.disabled = false; }
        return;
    }

    const cep = document.getElementById('base-cep').value.replace(/\D/g, '');
    const rua = document.getElementById('base-rua').value.trim();
    const numero = document.getElementById('base-numero').value.trim();
    const complemento = document.getElementById('base-complemento').value.trim();
    const bairro = document.getElementById('base-bairro').value.trim();
    const cidade = document.getElementById('base-cidade').value.trim();
    const uf = document.getElementById('base-uf').value.trim();
    if (!enderecoFinal) {
        if (!cep || !rua || !numero) return alert('Preencha CEP, logradouro e número (o endereço para o mapa é montado a partir deles ao salvar).');
        const compl = complemento ? ` - ${complemento}` : '';
        enderecoFinal = `${rua}, ${numero}${compl} - ${bairro}, ${cidade} - ${uf}, CEP: ${cep}`;
    }
    if (btn) { btn.innerText = 'Localizando no mapa...'; btn.disabled = true; }
    try {
        const geo = await geocodificarBaseOperacional({
            rua,
            numero,
            cidade,
            uf,
            cep
        });
        if (geo.lat != null && geo.lng != null) {
            lat = geo.lat;
            lng = geo.lng;
            focarMapaAposGeocodeBase(lat, lng);
        }
    } catch (e) {}

    try {
        const res = await apiFetch('/api/bases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                empresa_id: empresa.id,
                nome,
                endereco: enderecoFinal,
                lat,
                lng
            })
        });
        if (res.ok) {
            if (lat != null && lng != null) {
                LOJA_COORDS = [lng, lat];
                focarMapaNaBaseCarregada();
            }
            cancelarEdicao('base');
            carregarBases();
        } else {
            const resposta = await res.json();
            alert(resposta.erro || 'Erro ao salvar.');
        }
    } catch (e) { alert('Erro de conexão.'); }
    if (btn) { btn.innerText = 'Salvar Base e Localizar no Mapa'; btn.disabled = false; }
}
async function excluirBase(id) { if(confirm("Excluir base?")) { await apiFetch(`/api/bases/${id}`, { method: 'DELETE' }); carregarBases(); } }

// ---------------------------------------------------
// OCORRÊNCIAS & RELATÓRIOS
// ---------------------------------------------------
async function carregarOcorrencias() {
    const tbody = document.querySelector('#tabela-ocorrencias tbody'); if(!tbody) return;
    try {
        const res = await apiFetch(`/api/coletas/${empresa.id}`); const dados = await res.json();
        const concluidas = dados.filter(c => c.status === 'concluida' && c.status !== 'modelo');
        tbody.innerHTML = '';
        if(concluidas.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma entrega finalizada ainda.</td></tr>'; return; }
        concluidas.forEach(c => {
            let dataF = c.data_entrega ? formatarDataBR(c.data_entrega.split('T')[0]) : '-';
            let atrib = c.motorista_nome ? `${c.motorista_nome} <br><small>${c.veiculo_modelo||''}</small>` : 'Não Informado';
            tbody.innerHTML += `<tr><td>${dataF}</td><td>${atrib}</td><td><span style="color:#16a34a; font-weight:bold;">Entregue</span></td><td><strong>${c.fornecedor}</strong><br><small>${c.endereco}</small></td><td><button class="btn-editar">📄 Baixar POD</button></td></tr>`;
        });
    } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao buscar ocorrências.</td></tr>'; }
}

async function carregarRelatorio() {
    const tbody = document.querySelector('#tabela-relatorio-coletas tbody'); if(!tbody) return;
    try {
        const res = await apiFetch(`/api/coletas/${empresa.id}`); const dados = await res.json();
        const entregasReais = dados.filter(c => c.status !== 'modelo');
        document.getElementById('rel-total').innerText = entregasReais.length;
        tbody.innerHTML = '';
        if(entregasReais.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum dado para o relatório.</td></tr>'; return; }
        entregasReais.forEach(c => {
            let dataF = c.data_entrega ? formatarDataBR(c.data_entrega.split('T')[0]) : '-';
            let status = c.status === 'concluida' ? '<span style="color:green">Concluída</span>' : '<span style="color:orange">Pendente</span>';
            tbody.innerHTML += `<tr><td>${dataF}</td><td><strong>${c.fornecedor}</strong><br><small>${c.endereco}</small></td><td>${c.tempo_medio||0}m</td><td>${c.peso||0}kg</td><td>${status}</td></tr>`;
        });
    } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao gerar relatório.</td></tr>'; }
}