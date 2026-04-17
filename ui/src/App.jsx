import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TorreControle from './pages/empresa/TorreControle.jsx';
import MasterLogin from './pages/master/MasterLogin.jsx';
import MasterDashboard from './pages/master/MasterDashboard.jsx';
import MasterClientes from './pages/master/MasterClientes.jsx';

function Placeholder({ titulo }) {
    return (
        <div className="flex min-h-[50vh] items-center justify-center bg-[#f8fafc] p-8 font-sans text-slate-600">
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-4 text-sm shadow-sm">{titulo}</p>
        </div>
    );
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/empresa/monitoramento" replace />} />
            <Route path="/empresa/monitoramento" element={<TorreControle />} />
            <Route path="/empresa" element={<Placeholder titulo="Painel empresa (conecte ao legado ou migre telas)" />} />
            <Route path="/empresa/comunicacao" element={<Placeholder titulo="Comunicação" />} />
            <Route path="/empresa/rotas" element={<Placeholder titulo="Rotas" />} />
            <Route path="/empresa/usuarios" element={<Placeholder titulo="Usuários" />} />
            <Route path="/empresa/motoristas" element={<Placeholder titulo="Motoristas" />} />
            <Route path="/empresa/escolas" element={<Placeholder titulo="Escolas" />} />
            <Route path="/empresa/veiculos" element={<Placeholder titulo="Veículos" />} />
            <Route path="/empresa/relatorios" element={<Placeholder titulo="Relatórios" />} />
            <Route path="/empresa/configuracoes" element={<Placeholder titulo="Configurações" />} />
            <Route path="/empresa/seguranca" element={<Placeholder titulo="Segurança" />} />
            <Route path="/master/login" element={<MasterLogin />} />
            <Route path="/master" element={<MasterDashboard />} />
            <Route path="/master/clientes" element={<MasterClientes />} />
            <Route path="/master/assinaturas" element={<Placeholder titulo="Assinaturas" />} />
            <Route path="/master/operacao" element={<Placeholder titulo="Operação" />} />
            <Route path="/master/auditoria" element={<Placeholder titulo="Auditoria" />} />
            <Route path="/master/config" element={<Placeholder titulo="Configurações Master" />} />
            <Route path="*" element={<Navigate to="/empresa/monitoramento" replace />} />
        </Routes>
    );
}
