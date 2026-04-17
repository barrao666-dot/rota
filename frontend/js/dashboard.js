let empresasCarregadas = []; 
let idEmpresaEditando = null; 

function getPayloadDoToken(token) {
    try {
        const raw = (token || '').replace(/^bearer\s+/i, '').trim();
        if (!raw || raw.split('.').length < 2) return null;
        return JSON.parse(atob(raw.split('.')[1]));
    } catch (e) {
        return null;
    }
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
    carregarMetricas();
    carregarEmpresas();
}

function toggleSenha(inputId, btn) {
    const campo = document.getElementById(inputId);
    if(!campo) return;
    if (campo.type === 'password') { campo.type = 'text'; btn.innerText = '🙈'; } 
    else { campo.type = 'password'; btn.innerText = '👁️'; }
}

async function carregarMetricas() {
    try {
        const res = await apiFetch('/api/empresas/dashboard');
        const dados = await res.json();
        const mCli = document.getElementById('metric-clientes');
        if(mCli) mCli.innerHTML = `${dados.clientes_total} <span style="font-size: 14px; color: #64748b;">(${dados.clientes_ativos} ativos)</span>`;
        const mRec = document.getElementById('metric-receita');
        if(mRec) mRec.innerText = parseFloat(dados.receita).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const mOpe = document.getElementById('metric-operacao');
        if(mOpe) mOpe.innerHTML = `${dados.veiculos_ativos} <span style="font-size: 14px; color: #64748b;">veículos / ${dados.motoristas_ativos} motoristas</span>`;
    } catch (e) { }
}

async function buscarCep() {
    const el = document.getElementById('emp-cep'); if(!el) return;
    let cep = el.value.replace(/\D/g, '');
    if (cep.length === 8) {
        try {
            let resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`); let dados = await resposta.json();
            if (!dados.erro) {
                const setV = (id, v) => { const e = document.getElementById(id); if(e) e.value = v; };
                setV('emp-rua', dados.logradouro || ''); setV('emp-bairro', dados.bairro || '');
                setV('emp-cidade', dados.localidade || ''); setV('emp-uf', dados.uf || '');
                const num = document.getElementById('emp-numero'); if(num) num.focus();
            }
        } catch (e) { }
    }
}

async function buscarDocumento() {
    const el = document.getElementById('emp-documento'); if(!el) return;
    let doc = el.value.replace(/\D/g, '');
    if(doc.length === 14) {
        try {
            let resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
            if(resposta.ok) {
                let dados = await resposta.json();
                const elNome = document.getElementById('emp-nome'); if(elNome) elNome.value = dados.razao_social || dados.nome_fantasia || '';
                if(dados.cep) {
                    const elCep = document.getElementById('emp-cep'); 
                    if(elCep) { elCep.value = dados.cep.toString().replace(/\D/g, ''); buscarCep(); }
                }
            }
        } catch(e) { }
    }
}

async function carregarEmpresas() {
    try {
        const resposta = await apiFetch('/api/empresas');
        const dados = await resposta.json();
        if (!resposta.ok) {
            throw new Error(dados?.erro || `Falha HTTP ${resposta.status}`);
        }
        empresasCarregadas = dados.empresas; 
        const tbody = document.getElementById('lista-empresas'); if(!tbody) return;
        tbody.innerHTML = ''; 
        if(!empresasCarregadas || empresasCarregadas.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Nenhuma conta cadastrada.</td></tr>'; return; }
        
        empresasCarregadas.forEach(emp => {
            const isAtivo = emp.status === 'ativo';
            const corStatus = isAtivo ? '#16a34a' : '#dc2626';
            const textoStatus = isAtivo ? '🟢 Ativa' : '🔴 Bloqueada';
            const btnStatus = isAtivo ? `<button class="btn-pequeno" onclick="alterarStatus(${emp.id}, 'bloqueado')" style="background:#fee2e2; color:#991b1b; border-color:#fecaca;">Bloquear</button>` : `<button class="btn-pequeno" onclick="alterarStatus(${emp.id}, 'ativo')" style="background:#dcfce7; color:#166534; border-color:#bbf7d0;">Reativar</button>`;
            const btnEditar = `<button class="btn-pequeno" onclick="iniciarEdicao(${emp.id})" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd;">✏️ Editar</button>`;
            const btnAcessar = `<button class="btn-pequeno" onclick="logarComoCliente(${emp.id})" style="background: #fef08a; color: #9a3412; border-color: #fde047;">👁️ Painel</button>`;
            let dataVenc = emp.data_vencimento ? new Date(emp.data_vencimento).toLocaleDateString('pt-BR') : 'S/ Data';
            let valorPlano = emp.valor_plano ? parseFloat(emp.valor_plano).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';

            tbody.innerHTML += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>${emp.nome}</strong><br><span style="font-size:11px; color:#666;">Doc: ${emp.documento}</span></td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${valorPlano}<br><span style="font-size:11px; color:#666;">Venc: ${dataVenc}</span></td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; color: ${corStatus}; font-weight: bold;">${textoStatus}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #eee;">${btnAcessar} ${btnEditar} ${btnStatus}</td>
                </tr>
            `;
        });
    } catch (erro) { 
        const tbody = document.getElementById('lista-empresas');
        if(tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">${erro?.message || 'Erro de conexão.'}</td></tr>`; 
    }
}

async function logarComoCliente(id) {
    const empresaId = Number(id);
    if (!empresaId || Number.isNaN(empresaId)) {
        alert('ID da empresa inválido.');
        return;
    }
    let t = (localStorage.getItem('auth_token') || '').trim();
    if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
    if (!t) {
        alert('Sessão Master não encontrada. Faça login em /master/index.html e abra o dashboard novamente.');
        window.location.href = '/master/index.html';
        return;
    }
    const tokenMasterBackup = t;
    try {
        const res = await fetch('/api/login/emitir-token-empresa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + t,
            },
            body: JSON.stringify({ empresa_id: empresaId }),
        });
        const dados = await res.json();
        if (!res.ok) {
            if (res.status === 401) {
                alert(
                    (dados.erro || 'Não autenticado.') +
                        ' Abra o Master sempre pelo mesmo endereço do servidor (ex.: http://localhost:3000) e faça login de novo.'
                );
            } else {
                alert(dados.erro || 'Não foi possível abrir o painel do cliente.');
            }
            return;
        }
        try {
            sessionStorage.setItem('rota_plus_master_token_backup', tokenMasterBackup);
        } catch (e) {}
        localStorage.setItem('auth_token', dados.token);
        localStorage.setItem('dados_empresa', JSON.stringify(dados.empresa));
        const pop = window.open('/empresa/painel.html', '_blank');
        if (!pop || pop.closed) {
            alert(
                'O navegador bloqueou a nova aba. O acesso da empresa já foi aplicado nesta aba: abra manualmente /empresa/painel.html ou permita pop-ups para este site.'
            );
        }
    } catch (e) {
        alert('Erro de conexão.');
    }
}

async function alterarStatus(id, novoStatus) {
    if(confirm(`Mudar status?`)) {
        try { await apiFetch(`/api/empresas/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: novoStatus }) }); iniciarPainel(); } catch(e){}
    }
}

function iniciarEdicao(id) {
    const emp = empresasCarregadas.find(e => e.id === id);
    if (!emp) return;
    idEmpresaEditando = id;
    
    // Função blindada: Se não achar o ID no HTML, ele ignora sem travar a tela
    const setVal = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val; };
    
    const tit = document.getElementById('titulo-form'); if(tit) tit.innerText = "✏️ Editando Conta: " + emp.nome;
    
    setVal('emp-documento', emp.documento);
    const docEl = document.getElementById('emp-documento'); if(docEl) docEl.disabled = true;
    
    setVal('emp-nome', emp.nome); setVal('emp-cep', emp.cep || ''); setVal('emp-rua', emp.rua || '');
    setVal('emp-numero', emp.numero || ''); setVal('emp-complemento', emp.complemento || '');
    setVal('emp-bairro', emp.bairro || ''); setVal('emp-cidade', emp.cidade || ''); setVal('emp-uf', emp.uf || '');
    
    setVal('emp-limite-usuarios', emp.limite_usuarios || 3); setVal('emp-limite-motoristas', emp.limite_motoristas || 5);
    setVal('emp-limite-veiculos', emp.limite_veiculos || 5); setVal('emp-limite-bases', emp.limite_bases || 1);
    
    setVal('emp-valor-plano', emp.valor_plano || ''); 
    setVal('emp-vencimento', emp.data_vencimento ? emp.data_vencimento.split('T')[0] : '');
    
    setVal('emp-cor1', emp.cor1 || '#333333'); setVal('emp-cor2', emp.cor2 || '#F9801A');
    
    const aviso = document.getElementById('aviso-logo'); if(aviso) aviso.style.display = 'block';
    
    setVal('emp-usuario', emp.acesso_usuario || ''); setVal('emp-email', emp.acesso_email || '');
    setVal('emp-senha', ''); setVal('emp-status', emp.status || 'ativo');
    setVal('emp-programa-parceiros', emp.programa_parceiros || 'inativo'); setVal('emp-auditoria-peso', emp.auditoria_cargas || 'sim');
    setVal('emp-api-mapas', emp.api_mapas || '');
    
    const btnS = document.getElementById('btn-salvar'); if(btnS) { btnS.innerText = "💾 Salvar Alterações"; btnS.style.backgroundColor = "#0284c7"; }
    const btnC = document.getElementById('btn-cancelar'); if(btnC) btnC.style.display = "block";
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicao() {
    idEmpresaEditando = null; 
    const form = document.getElementById('form-empresa'); if(form) form.reset();
    
    const tit = document.getElementById('titulo-form'); if(tit) tit.innerText = "🏢 Cadastrar Cliente"; 
    const docEl = document.getElementById('emp-documento'); if(docEl) docEl.disabled = false; 
    const aviso = document.getElementById('aviso-logo'); if(aviso) aviso.style.display = 'none';
    
    const btnS = document.getElementById('btn-salvar'); if(btnS) { btnS.innerText = "💾 Registrar Cliente"; btnS.style.backgroundColor = "#16a34a"; }
    const btnC = document.getElementById('btn-cancelar'); if(btnC) btnC.style.display = "none";
}

async function salvarEmpresa() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const formData = new FormData();
    
    formData.append('nome', getVal('emp-nome')); formData.append('documento', getVal('emp-documento'));
    formData.append('cep', getVal('emp-cep')); formData.append('rua', getVal('emp-rua'));
    formData.append('numero', getVal('emp-numero')); formData.append('complemento', getVal('emp-complemento'));
    formData.append('bairro', getVal('emp-bairro')); formData.append('cidade', getVal('emp-cidade'));
    formData.append('uf', getVal('emp-uf')); formData.append('cor1', getVal('emp-cor1'));
    formData.append('cor2', getVal('emp-cor2')); formData.append('acesso_usuario', getVal('emp-usuario'));
    formData.append('acesso_email', getVal('emp-email')); formData.append('acesso_senha', getVal('emp-senha'));
    formData.append('status', getVal('emp-status')); formData.append('programa_parceiros', getVal('emp-programa-parceiros'));
    formData.append('exigir_peso', getVal('emp-auditoria-peso'));
    formData.append('limite_usuarios', getVal('emp-limite-usuarios') || 3);
    formData.append('limite_motoristas', getVal('emp-limite-motoristas') || 5);
    formData.append('limite_veiculos', getVal('emp-limite-veiculos') || 5);
    formData.append('limite_bases', getVal('emp-limite-bases') || 1);
    formData.append('valor_plano', getVal('emp-valor-plano') || 0);
    const venc = getVal('emp-vencimento');
    if (venc) formData.append('data_vencimento', venc);
    else formData.append('data_vencimento', '');
    formData.append('api_mapas', getVal('emp-api-mapas'));

    const inputArquivo = document.getElementById('emp-logo');
    if (inputArquivo && inputArquivo.files.length > 0) { formData.append('logo', inputArquivo.files[0]); }

    const idNum = idEmpresaEditando != null ? Number(idEmpresaEditando) : null;
    const urlFinal = idNum ? `/api/empresas/${idNum}` : '/api/empresas';
    const metodoFinal = idNum ? 'PUT' : 'POST';

    try {
        const resposta = await apiFetch(urlFinal, { method: metodoFinal, body: formData });
        if (resposta.ok) {
            alert('Sucesso!');
            cancelarEdicao();
            iniciarPainel();
            return;
        }
        let msg = 'Erro ao salvar.';
        try {
            const j = await resposta.json();
            if (j.erro) msg = j.erro;
        } catch (e) {
            msg = `Erro HTTP ${resposta.status}`;
        }
        alert(msg);
    } catch (erro) {
        alert('Erro de conexão ao salvar.');
    }
}