import React from 'react';
import DashboardLayout from '../../components/DashboardLayout.jsx';
import { AlertTriangle, CheckCircle2, Clock3, Map as MapIcon, Route } from 'lucide-react';

const cardsResumo = [
    { label: 'Rotas Ativas', valor: 8 },
    { label: 'Veiculos', valor: 8 },
    { label: 'Alunos Transportados', valor: 142 },
    { label: 'Taxa de Pontualidade', valor: '94%' },
];

const rotasTempoReal = [
    { nome: 'Rota Centro - Escola Municipal', detalhes: '5 alunos • Saida: 14:15', status: 'Em Rota', eta: '14:28' },
    { nome: 'Rota Norte - Colegio Estadual', detalhes: '12 alunos • Saida: 14:10', status: 'Em Rota', eta: '14:22' },
    { nome: 'Rota Sul - Escola Privada', detalhes: '8 alunos • Saida: 14:20', status: 'Atrasado', eta: '+2 min' },
];

const progressoRotas = [
    { nome: 'Rota Centro - Escola Municipal', progresso: 68, extra: '5/8 embarques', cor: 'bg-emerald-500' },
    { nome: 'Rota Norte - Colegio Estadual', progresso: 83, extra: '10/12 embarques', cor: 'bg-emerald-500' },
    { nome: 'Rota Sul - Escola Privada', progresso: 52, extra: '5/8 embarques', cor: 'bg-amber-500' },
    { nome: 'Rota Leste - Centro de Educação', progresso: 38, extra: '7/7 embarques', cor: 'bg-emerald-500' },
];

const alertas = [
    { texto: 'Rota Sul: Desvio de rota detectado', tipo: 'alerta' },
    { texto: 'Rota Leste: Atraso de 5 minutos', tipo: 'aviso' },
    { texto: '3 nao embarques reportados hoje', tipo: 'critico' },
];

function statusBadge(status) {
    if (status === 'Atrasado') {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {status}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {status}
        </span>
    );
}

export default function TorreControle() {
    return (
        <DashboardLayout userRole="empresa">
            <main className="space-y-4 p-4 md:p-6">
                <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Torre de Controle GeoVan</h1>
                            <p className="mt-1 text-xs text-slate-500">Ativo • Prefeitura de São Paulo - SP</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                Ao vivo
                            </span>
                            <span>12:21</span>
                            <span>Dom, 12 abr</span>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <section className="space-y-4 xl:col-span-1">
                        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Visao geral</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {cardsResumo.map((item) => (
                                    <div key={item.label} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-center">
                                        <p className="text-2xl font-bold text-emerald-700">{item.valor}</p>
                                        <p className="mt-1 text-[11px] font-medium text-slate-500">{item.label}</p>
                                    </div>
                                ))}
                            </div>
                        </article>

                        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <Route className="h-4 w-4" />
                                Rotas em tempo real
                            </h2>
                            <ul className="space-y-2">
                                {rotasTempoReal.map((rota) => (
                                    <li key={rota.nome} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                        <p className="text-sm font-semibold text-slate-800">{rota.nome}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">{rota.detalhes}</p>
                                        <div className="mt-2 flex items-center justify-between">
                                            {statusBadge(rota.status)}
                                            <span className="text-[11px] font-semibold text-slate-500">ETA: {rota.eta}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </article>

                        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Alertas e avisos</h2>
                            <ul className="space-y-2 text-xs">
                                {alertas.map((alerta) => (
                                    <li
                                        key={alerta.texto}
                                        className={`rounded-lg border px-3 py-2 ${
                                            alerta.tipo === 'critico'
                                                ? 'border-red-200 bg-red-50 text-red-700'
                                                : alerta.tipo === 'aviso'
                                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                  : 'border-amber-200 bg-amber-50 text-amber-800'
                                        }`}
                                    >
                                        {alerta.texto}
                                    </li>
                                ))}
                            </ul>
                        </article>
                    </section>

                    <section className="space-y-4 xl:col-span-2">
                        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <MapIcon className="h-4 w-4" />
                                Rastreamento de vans
                            </h2>
                            <div className="relative h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#bae6fd,transparent_45%),radial-gradient(circle_at_80%_80%,#86efac,transparent_45%),linear-gradient(120deg,#e2e8f0,#f8fafc)]" />
                                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:42px_42px]" />
                                <div className="absolute bottom-2 right-3 text-[10px] text-slate-500">Leaflet | OpenStreetMap contributors</div>
                            </div>
                        </article>

                        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <Clock3 className="h-4 w-4" />
                                Progresso das rotas
                            </h2>
                            <div className="space-y-3">
                                {progressoRotas.map((item) => (
                                    <div key={item.nome}>
                                        <div className="mb-1 flex items-center justify-between text-xs">
                                            <p className="font-semibold text-slate-700">{item.nome}</p>
                                            <span className="text-slate-500">{item.extra}</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                            <div className={`h-full rounded-full ${item.cor}`} style={{ width: `${item.progresso}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </article>
                    </section>
                </div>
            </main>
        </DashboardLayout>
    );
}
