(function () {
    const DEFAULT_TIMEOUT_MS = 15000;

    function normalizarTokenBruto() {
        let t = (localStorage.getItem('auth_token') || '').trim();
        if (!t) return '';
        if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
        return t;
    }

    function criarTimeoutSignal(timeoutMs, externalSignal) {
        const controller = new AbortController();
        const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
        const timer = setTimeout(() => controller.abort(new Error('timeout')), ms);

        if (externalSignal) {
            if (externalSignal.aborted) controller.abort(externalSignal.reason);
            else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
        }

        return { signal: controller.signal, clear: () => clearTimeout(timer) };
    }

    window.apiFetch = async function (url, options) {
        options = options || {};
        const headers = Object.assign({}, options.headers || {});
        const t = normalizarTokenBruto();
        if (t && !headers.Authorization) headers.Authorization = 'Bearer ' + t;
        if (!headers.Accept) headers.Accept = 'application/json';
        options.headers = headers;
        if (options.timeout_ms == null) options.timeout_ms = DEFAULT_TIMEOUT_MS;

        const { signal, clear } = criarTimeoutSignal(options.timeout_ms, options.signal);
        const fetchOptions = Object.assign({}, options, { signal });
        delete fetchOptions.timeout_ms;

        try {
            return await fetch(url, fetchOptions);
        } finally {
            clear();
        }
    };

    window.apiFetchJson = async function (url, options) {
        const resp = await window.apiFetch(url, options);
        let payload = null;

        try {
            payload = await resp.clone().json();
        } catch (err) {
            payload = null;
        }

        if (!resp.ok) {
            const msg = (payload && (payload.erro || payload.error || payload.message)) || `Erro HTTP ${resp.status}`;
            const e = new Error(msg);
            e.status = resp.status;
            e.payload = payload;
            throw e;
        }

        return payload;
    };
})();
