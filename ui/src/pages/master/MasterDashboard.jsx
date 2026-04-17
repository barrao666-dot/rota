import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout.jsx';
import { apiFetch, parseJwtPayload } from '../../lib/api.js';
import { Building2, RefreshCw, Truck, Wallet } from 'lucide-react';

function fmtBRL(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function MasterDashboard() {
    const navigate = useNavigate();
    const [metricas, setMetricas] = useState(null);
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
            const res = await apiFetch('/api/empresas/dashboard');
            const data = await res.json();
            if (res.status === 401 || res.status === 403) {
                localStorage.removeItem('auth_token');
                navigate('/master/login', { replace: true });
                return;
            }
            if (!res.ok) throw new Error(data.erro || 'Falha ao carregar métricas.');
            setMetricas(data);
        } catch (e) {
            setErro(e.message || 'Erro ao consultar o banco.');
            setMetricas(null);
        } finally {
            setCarregando(false);
        }
    }, [navigate]);

    useEffect(() => {
        carregar();
    }, [carregar]);

    return (
        <DashboardLayout userRole="master">
            <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f8fafc]/95 px-6 py-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">Dashboard Master</h1>
                        <p className="text-xs text-slate-500">Métricas ao vivo do MySQL (assinaturas e operação)</p>
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
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        {erro}
                    </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Clientes</p>
                                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
                                    {metricas ? metricas.clientes_total : '—'}
                                </p>
                                <p className="mt-1 text-sm text-emerald-700">
                                    {metricas ? `${metricas.clientes_ativos} ativos` : 'assinaturas'}
                                </p>
                            </div>
                            <span className="rounded-xl bg-blue-50 p-3 text-blue-600">
                                <Building2 className="h-6 w-6" aria-hidden />
                            </span>
                        </div>
                    </article>
                    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Receita (planos)</p>
                                <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">
                                    {metricas ? fmtBRL(metricas.receita) : '—'}
                                </p>
                                <p className="mt-1 text-sm text-slate-500">Soma de valor_plano cadastrado</p>
                            </div>
                            <span className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
                                <Wallet className="h-6 w-6" aria-hidden />
                            </span>
                        </div>
                    </article>
                    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ring-1 ring-slate-100 sm:col-span-2 lg:col-span-1">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Operação</p>
                                <p className="mt-2 text-3xl font-bold tabular-nums text-amber-700">
                                    {metricas ? metricas.veiculos_ativos : '—'}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                    veículos ·{' '}
                                    <span className="font-semibold text-slate-800">
                                        {metricas ? metricas.motoristas_ativos : '—'}
                                    </span>{' '}
                                    motoristas
                                </p>
                            </div>
                            <span className="rounded-xl bg-amber-50 p-3 text-amber-600">
                                <Truck className="h-6 w-6" aria-hidden />
                            </span>
                        </div>
                    </article>
                </div>
                <p className="mt-8 text-center text-xs text-slate-400">
                    Cadastro completo de clientes continua disponível em{' '}
                    <a href="/master/dashboard.html" className="font-medium text-emerald-700 underline-offset-2 hover:underline">
                        dashboard.html (legado)
                    </a>{' '}
                    até migração total do formulário.
                </p>
            </main>
        </DashboardLayout>
    );
}
