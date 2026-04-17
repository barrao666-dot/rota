import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Radio,
    Map,
    Users,
    Building2,
    Truck,
    Settings,
    Shield,
    BarChart3,
    ListOrdered,
    LogOut,
} from 'lucide-react';

const linkClass =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900';

const activeClass = 'bg-emerald-50 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-800';

function NavItem({ to, icon: Icon, children, end }) {
    return (
        <NavLink to={to} end={end} className={({ isActive }) => `${linkClass} ${isActive ? activeClass : ''}`}>
            {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />}
            <span>{children}</span>
        </NavLink>
    );
}

function SectionTitle({ children }) {
    return <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0">{children}</p>;
}

const menusEmpresa = {
    NAVEGAÇÃO: [
        { to: '/empresa/monitoramento', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/empresa/comunicacao', label: 'Comunicação', icon: Radio },
        { to: '/empresa/rotas', label: 'Rotas', icon: Map },
    ],
    GERENCIAMENTO: [
        { to: '/empresa/usuarios', label: 'Usuários', icon: Users },
        { to: '/empresa/motoristas', label: 'Motoristas', icon: Truck },
        { to: '/empresa/escolas', label: 'Escolas', icon: Building2 },
        { to: '/empresa/veiculos', label: 'Veículos', icon: Truck },
    ],
    SISTEMA: [
        { to: '/empresa/configuracoes', label: 'Configurações', icon: Settings },
        { to: '/empresa/relatorios', label: 'Relatórios', icon: BarChart3 },
        { to: '/empresa/seguranca', label: 'Segurança', icon: Shield },
    ],
};

const menusMaster = {
    NAVEGAÇÃO: [
        { to: '/master', label: 'Dashboard Master', icon: LayoutDashboard },
        { to: '/master/clientes', label: 'Clientes', icon: Building2 },
    ],
    GERENCIAMENTO: [
        { to: '/master/assinaturas', label: 'Assinaturas', icon: ListOrdered },
        { to: '/master/operacao', label: 'Operação', icon: Truck },
    ],
    SISTEMA: [
        { to: '/master/auditoria', label: 'Auditoria', icon: Shield },
        { to: '/master/config', label: 'Configurações', icon: Settings },
    ],
};

export default function Sidebar({ userRole = 'empresa' }) {
    const menus = userRole === 'master' ? menusMaster : menusEmpresa;
    const navigate = useNavigate();

    function handleLogout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('dados_empresa');
        if (userRole === 'master') {
            navigate('/master/login');
        } else {
            window.location.href = '/index.html';
        }
    }

    return (
        <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white font-sans">
            <div className="border-b border-slate-100 px-4 py-5">
                <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-content-center rounded-lg bg-emerald-100 text-sm">🚌</div>
                    <div>
                        <span className="text-sm font-bold text-slate-800">Gestor Principal</span>
                        <p className="mt-0.5 text-[11px] text-slate-400">gestor@exemplo.com</p>
                    </div>
                </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
                {Object.entries(menus).map(([title, items]) => (
                    <div key={title}>
                        <SectionTitle>{title}</SectionTitle>
                        <div className="flex flex-col gap-0.5">
                            {items.map((item) => (
                                <NavItem key={item.to} to={item.to} icon={item.icon} end={item.to === '/empresa' || item.to === '/master'}>
                                    {item.label}
                                </NavItem>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
            <div className="border-t border-slate-100 p-3">
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Sair
                </button>
            </div>
        </aside>
    );
}
