/**
 * Cliente HTTP alinhado ao legado (`frontend/js/api-client.js`): envia Bearer do localStorage.
 * Em dev (Vite) use proxy `/api`; em produção no Express, mesmo host.
 */
function normalizarTokenBruto() {
    let t = (localStorage.getItem('auth_token') || '').trim();
    if (!t) return '';
    if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
    return t;
}

export async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const t = normalizarTokenBruto();
    if (t && !headers.Authorization) headers.Authorization = `Bearer ${t}`;
    return fetch(url, { ...options, headers });
}

export function parseJwtPayload(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const b64 = token.split('.')[1];
        const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(json);
    } catch {
        return null;
    }
}
