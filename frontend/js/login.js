/** Não apague sessão ao carregar esta página — isso derrubava gestor/operador em outras abas e gerava erro de API/banco. */

function mudarAba(tipo) {
    document.getElementById('msg-erro').style.display = 'none';
    document.getElementById('msg-sucesso').style.display = 'none';
    document.getElementById('tipo-login').value = tipo;
    document.getElementById('campo-usuario').value = '';
    document.getElementById('campo-senha').value = '';
    
    const hint = document.getElementById('hint-contexto');
    if (tipo === 'empresa') {
        document.getElementById('tab-empresa').classList.add('active');
        document.getElementById('tab-operador').classList.remove('active');
        document.getElementById('lbl-usuario').innerText = 'CNPJ / CPF ou usuário do gestor';
        document.getElementById('btn-submit').innerText = 'Entrar no painel da empresa';
        document.getElementById('btn-submit').style.background = '#0284c7';
        if (hint) {
            hint.innerHTML =
                'Você será direcionado ao <strong>painel da empresa</strong> (cadastros: bases, frota, equipe, fornecedores, regras, relatórios).';
        }
    } else if (tipo === 'operador') {
        document.getElementById('tab-operador').classList.add('active');
        document.getElementById('tab-empresa').classList.remove('active');
        document.getElementById('lbl-usuario').innerText = 'Login do operador de rotas';
        document.getElementById('btn-submit').innerText = 'Entrar nas rotas (operador)';
        document.getElementById('btn-submit').style.background = '#0284c7';
        if (hint) {
            hint.innerHTML =
                'Você será direcionado à <strong>tela de rotas</strong> para inserir entregas, coletas e gerir o despacho do dia.';
        }
    }
}

function toggleSenha(inputId, btn) {
    const campo = document.getElementById(inputId);
    if (campo.type === 'password') { campo.type = 'text'; btn.innerText = '🙈'; } 
    else { campo.type = 'password'; btn.innerText = '👁️'; }
}

async function fazerLogin() {
    const btn = document.getElementById('btn-submit');
    const erroBox = document.getElementById('msg-erro');
    const sucessoBox = document.getElementById('msg-sucesso');
    const tipo = document.getElementById('tipo-login').value; 
    const usuario = document.getElementById('campo-usuario').value;
    const senha = document.getElementById('campo-senha').value;

    erroBox.style.display = 'none'; sucessoBox.style.display = 'none';
    btn.disabled = true; btn.innerText = "Autenticando...";

    const payload = tipo === 'operador' ? { login: usuario, senha: senha } : { usuario: usuario, senha: senha };
    const endpoint = tipo === 'operador' ? '/api/login/operador' : '/api/login/empresa';

    try {
        const resposta = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            if (!dados.token) {
                erroBox.innerText = 'Resposta do servidor sem token. Tente novamente.';
                erroBox.style.display = 'block';
                btn.disabled = false;
                btn.innerText = tipo === 'empresa' ? 'Entrar no painel da empresa' : 'Entrar nas rotas (operador)';
                return;
            }
            localStorage.setItem('auth_token', dados.token);

            if (dados.master) {
                localStorage.removeItem('dados_empresa');
                localStorage.removeItem('dados_operador');
                window.location.href = '/master/dashboard.html';
                return;
            }

            if (tipo === 'empresa') {
                localStorage.removeItem('dados_operador');
                localStorage.setItem('dados_empresa', JSON.stringify(dados.empresa));
                window.location.href = '/empresa/painel.html';
            } else {
                localStorage.setItem('dados_operador', JSON.stringify(dados.operador));
                const fakeEmpresa = {
                    id: dados.operador.empresa_id,
                    nome: dados.operador.empresa_nome,
                    cor1: dados.operador.cor1,
                    caminho_logo: dados.operador.caminho_logo,
                    api_mapas: dados.operador.api_mapas,
                };
                localStorage.setItem('dados_empresa', JSON.stringify(fakeEmpresa));
                window.location.href = '/operacao/rotas.html';
            }
        } else {
            erroBox.innerText = dados.erro || "Falha na autenticação."; erroBox.style.display = 'block';
            btn.disabled = false; btn.innerText = tipo === 'empresa' ? 'Entrar no painel da empresa' : 'Entrar nas rotas (operador)';
        }
    } catch (erro) {
        erroBox.innerText = "Falha ao conectar."; erroBox.style.display = 'block';
        btn.disabled = false; btn.innerText = 'Tentar Novamente';
    }
}

async function recuperarSenha() {
    const usuario = document.getElementById('campo-usuario').value;
    const tipo = document.getElementById('tipo-login').value; 
    const erroBox = document.getElementById('msg-erro');
    const sucessoBox = document.getElementById('msg-sucesso');

    if (!usuario) { erroBox.innerText = "Digite seu usuário no campo acima primeiro!"; erroBox.style.display = 'block'; sucessoBox.style.display = 'none'; return; }

    if (confirm(`Gerar nova senha temporária para o acesso "${usuario}"?`)) {
        try {
            const resposta = await fetch(`/api/login/esqueci-senha`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: usuario, tipo: tipo }) });
            const dados = await resposta.json();

            if (resposta.ok) {
                erroBox.style.display = 'none';
                sucessoBox.innerHTML = dados.mensagem || 'Se a conta existir, use a nova senha com o e-mail cadastrado no sistema.';
                sucessoBox.style.display = 'block';
            } else { sucessoBox.style.display = 'none'; erroBox.innerText = dados.erro; erroBox.style.display = 'block'; }
        } catch (e) { erroBox.innerText = "Erro ao conectar."; erroBox.style.display = 'block'; }
    }
}