import React from 'react';
import Sidebar from './Sidebar.jsx';

export default function DashboardLayout({ children, userRole = 'empresa' }) {
    return (
        <div className="flex min-h-screen w-full bg-[#f8fafc] font-sans">
            <div className="fixed left-0 top-0 z-40 h-screen w-64 shrink-0">
                <Sidebar userRole={userRole} />
            </div>
            <div className="ml-64 min-h-screen flex-1 overflow-y-auto bg-[#f8fafc]">{children}</div>
        </div>
    );
}
