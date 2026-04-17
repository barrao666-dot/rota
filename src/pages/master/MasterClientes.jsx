import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout.jsx';
import { apiFetch, parseJwtPayload } from '../../lib/api.js';
import { ExternalLink, RefreshCw } from 'lucide-react';

function fmtBRL(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function MasterClientes() {
    const navigate = useNavigate();
    const [empresas, setEmpresas] = useState([]);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(true);

    const carregar = useCallback(async () => {
        const token = localStorage.getItem('auth_token');
        const payload = parseJwtPayload(token);
        if (!token || payload?.role !== 'master') {
            navigate('/master/login', { replace: true });
            return;
        }
        setCarregando(true);
        setErro('');
        try {
            const res = await apiFetch('/api/empresas');
            const data = await res.json();
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('auth_token');
                navigate('/master/login', { replace: true });
                return;
            }
            if (!res.ok) throw new Error(data.erro || 'Falha ao listar empresas.');
            setEmpresas(data.empresas || []);
        } catch (e) {
            setErro(e.message || 'Erro ao consultar o banco.');
            setEmpresas([]);
        } finally {
            setCarregando(false);
        }
    }, [navigate]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    async function abrirPainelEmpresa(empresaId) {
        const raw = (localStorage.getItem('auth_token') || '').trim();
        const token = raw.replace(/^bearer\s+/i, '').trim();
        if (!token) {
            navigate('/master/login', { replace: true });
            return;
        }
        setErro('');
        try {
            const res = await fetch('/api/login/emitir-token-empresa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ empresa_id: Number(empresaId) }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErro(data.erro || `Falha (${res.status}). Faça login Master de novo neste mesmo endereço (porta) do servidor.`);
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('auth_token');
                    navigate('/master/login', { replace: true });
                }
                return;
            }
            try {
                sessionStorage.setItem('rota_plus_master_token_backup', token);
            } catch {
                /* ignore */
            }
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('dados_empresa', JSON.stringify(data.empresa));
            const base =
                typeof window !== 'undefined' && window.location.port === '5173'
                    ? `${window.location.protocol}//${window.location.hostname}:3000`
                    : '';
            const urlPainel = `${base}/empresa/painel.html`;
            const pop = window.open(urlPainel, '_blank', 'noopener,noreferrer');
            if (!pop) {
                setErro('Pop-up bloqueado. Abra manualmente: ' + urlPainel);
            }
        } catch {
            setErro('Erro de rede ao emitir token da empresa.');
        }
    }

    return (
        <DashboardLayout userRole="master">
            <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f8fafc]/95 px-6 py-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Clientes</h1>
                        <p className="text-xs text-slate-500">Registros da tabela empresas</p>
                    </div>
                    <button
                        type="button"
                        onClick={carregar}
                        disabled={carregando}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} aria-hidden />
                        Atualizar
                    </button>
                </div>
            </header>
            <main className="p-6">
                {erro && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{erro}</div>
                )}
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-100">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Empresa</th>
                                    <th className="px-4 py-3">Documento</th>
                                    <th className="px-4 py-3">Plano</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {empresas.length === 0 && !carregando && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                            Nenhuma empresa encontrada.
                                        </td>
                                    </tr>
                                )}
                                {empresas.map((e) => (
                                    <tr key={e.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-3 font-medium text-slate-900">{e.nome}</td>
                                        <td className="px-4 py-3 text-slate-600">{e.documento}</td>
                                        <td className="px-4 py-3 tabular-nums text-slate-700">{fmtBRL(e.valor_plano)}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                    e.status === 'ativo'
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-red-100 text-red-800'
                                                }`}
                                            >
                                                {e.status || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                onClick={() => abrirPainelEmpresa(e.id)}
                                                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                                Painel empresa
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </DashboardLayout>
    );
}
