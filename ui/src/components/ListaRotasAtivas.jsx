import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Route, Clock, MapPin } from 'lucide-react';

/**
 * REGRA DE NEGÓCIO — TRAVA DE TEMPORIZADORES
 * ------------------------------------------
 * Quando um novo endereço é injetado no trajeto (reordenação, nova parada, etc.),
 * o estado da lista de entregas pode ser substituído por um novo array vindo da API.
 *
 * NUNCA podemos resetar ou sobrescrever o contador de tempo de uma entrega que já
 * está "ativa" na tela (ex.: em_transito, em_atendimento), pois isso quebraria SLA
 * e métricas de campo.
 *
 * Implementação:
 * - `timerStartByEntregaId` (useRef<Map>) guarda o timestamp de início por id de entrega.
 * - Ao aplicar atualização da lista (setRotas), fazemos MERGE: para ids que já existem
 *   com status ativo, preservamos o timestamp original do ref.
 * - Novos ids recebem start só quando entrarem em status ativo.
 * - Injetar parada no meio do trajeto NÃO chama clear() no Map — apenas merge por id.
 */
const STATUS_ATIVO = new Set(['em_transito', 'em_atendimento']);

function useEntregaTimers() {
    const timerStartByEntregaId = useRef(new Map());

    const registrarOuPreservarTimers = useCallback((listaAnterior, listaNova) => {
        const anteriorPorId = new Map((listaAnterior || []).map((e) => [e.id, e]));
        for (const ent of listaNova) {
            const eraAtivo = STATUS_ATIVO.has(anteriorPorId.get(ent.id)?.status);
            const ehAtivo = STATUS_ATIVO.has(ent.status);
            if (ehAtivo) {
                if (!timerStartByEntregaId.current.has(ent.id)) {
                    timerStartByEntregaId.current.set(ent.id, Date.now());
                } else if (eraAtivo && timerStartByEntregaId.current.has(ent.id)) {
                    // mantém o mesmo timestamp — não reseta por mudança de ordem / novo endereço no trajeto
                }
            }
        }
    }, []);

    const segundosDecorridos = useCallback((entregaId) => {
        const t0 = timerStartByEntregaId.current.get(entregaId);
        if (!t0) return 0;
        return Math.max(0, Math.floor((Date.now() - t0) / 1000));
    }, []);

    return { timerStartByEntregaId, registrarOuPreservarTimers, segundosDecorridos };
}

export default function ListaRotasAtivas({ className = '' }) {
    const { registrarOuPreservarTimers, segundosDecorridos } = useEntregaTimers();
    const [tick, setTick] = useState(0);

    const [rotas, setRotas] = useState([
        { id: 101, nome: 'Entrega Centro', endereco: 'Av. Afonso Pena, 1000', status: 'em_transito', ordem: 1 },
        { id: 102, nome: 'Coleta Zona Sul', endereco: 'Rua X, 50', status: 'pendente', ordem: 2 },
    ]);

    React.useEffect(() => {
        registrarOuPreservarTimers([], rotas);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- seed único para timers de entregas já ativas no carregamento
    }, []);

    const aplicarAtualizacaoListaPreservandoTimers = useCallback(
        (novaLista) => {
            setRotas((prev) => {
                registrarOuPreservarTimers(prev, novaLista);
                return novaLista;
            });
        },
        [registrarOuPreservarTimers]
    );

    /** Simula injeção de novo endereço no trajeto: reordena / insere item sem zerar timers ativos. */
    const simularInjetarParadaNoTrajeto = useCallback(() => {
        aplicarAtualizacaoListaPreservandoTimers([
            { id: 100, nome: 'Nova parada (injetada)', endereco: 'Rua Nova, 1', status: 'pendente', ordem: 0 },
            { id: 101, nome: 'Entrega Centro', endereco: 'Av. Afonso Pena, 1000', status: 'em_transito', ordem: 1 },
            { id: 102, nome: 'Coleta Zona Sul', endereco: 'Rua X, 50', status: 'pendente', ordem: 2 },
        ]);
    }, [aplicarAtualizacaoListaPreservandoTimers]);

    React.useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const listaOrdenada = useMemo(() => [...rotas].sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)), [rotas]);

    return (
        <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Route className="h-4 w-4 text-emerald-600" />
                    Rotas em tempo real
                </h3>
                <button
                    type="button"
                    onClick={simularInjetarParadaNoTrajeto}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                >
                    Simular injeção no trajeto
                </button>
            </div>
            <p className="mb-3 text-[11px] leading-snug text-slate-500">
                Trava: timers de entregas ativas não são zerados ao atualizar a lista (merge por <code className="rounded bg-slate-100 px-0.5">id</code>).
            </p>
            <ul className="flex flex-col gap-2">
                {listaOrdenada.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{e.nome}</p>
                            <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                <span className="line-clamp-2">{e.endereco}</span>
                            </p>
                            <p className="mt-1 text-[11px] uppercase text-slate-400">{e.status.replace('_', ' ')}</p>
                        </div>
                        {STATUS_ATIVO.has(e.status) && (
                            <div className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                <Clock className="h-3.5 w-3.5" />
                                {Math.floor(segundosDecorridos(e.id) / 60)
                                    .toString()
                                    .padStart(2, '0')}
                                :
                                {(segundosDecorridos(e.id) % 60).toString().padStart(2, '0')}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            <span className="sr-only" aria-live="polite">
                {tick}
            </span>
        </div>
    );
}
