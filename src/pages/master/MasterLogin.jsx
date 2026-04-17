import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

export default function MasterLogin() {
    const navigate = useNavigate();
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setErro('');
        setCarregando(true);
        try {
            const res = await fetch('/api/login/empresa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, senha }),
            });
            const dados = await res.json();
            if (res.ok && dados.master && dados.token) {
                localStorage.removeItem('dados_empresa');
                localStorage.removeItem('dados_operador');
                localStorage.setItem('auth_token', dados.token);
                navigate('/master', { replace: true });
                return;
            }
            setErro(dados.erro || 'Usuário ou senha incorretos.');
        } catch {
            setErro('Erro de conexão. O backend está rodando na porta 3000?');
        } finally {
            setCarregando(false);
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 font-sans">
            <div className="w-full max-w-md rounded-2xl border border-slate-600/40 bg-white/95 p-8 shadow-2xl backdrop-blur">
                <div className="mb-6 flex flex-col items-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/30">
                        <Shield className="h-6 w-6" aria-hidden />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">Rota++ Master</h1>
                    <p className="mt-1 text-sm text-slate-500">Acesso restrito ao painel SaaS</p>
                </div>
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Usuário</label>
                        <input
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2"
                            value={usuario}
                            onChange={(e) => setUsuario(e.target.value)}
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Senha</label>
                        <input
                            type="password"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2"
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    {erro && (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                            {erro}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={carregando}
                        className="mt-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {carregando ? 'Entrando…' : 'Entrar'}
                    </button>
                </form>
                <p className="mt-6 text-center text-xs text-slate-500">
                    <Link to="/empresa/monitoramento" className="text-emerald-700 underline-offset-2 hover:underline">
                        Ir para Torre (empresa)
                    </Link>
                    <span className="mx-2 text-slate-300">·</span>
                    <a href="/master/index.html" className="text-slate-600 underline-offset-2 hover:underline">
                        Login HTML legado
                    </a>
                </p>
            </div>
        </div>
    );
}
