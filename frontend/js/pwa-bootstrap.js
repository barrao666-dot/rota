(function () {
    // Idempotente: se já rodou, sai. Importante porque algumas páginas
    // têm seus próprios registradores de SW + <link rel="manifest">.
    if (window.__rotaPwaBootstrapped) return;
    window.__rotaPwaBootstrapped = true;

    var head = document.head || document.getElementsByTagName('head')[0];

    function ensureLink(attrs) {
        if (!head) return;
        var seletor = 'link[rel="' + attrs.rel + '"]' + (attrs.sizes ? '[sizes="' + attrs.sizes + '"]' : '');
        if (document.querySelector(seletor)) return;
        var el = document.createElement('link');
        Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
        head.appendChild(el);
    }

    function ensureMeta(name, content) {
        if (!head) return;
        if (document.querySelector('meta[name="' + name + '"]')) return;
        var el = document.createElement('meta');
        el.setAttribute('name', name);
        el.setAttribute('content', content);
        head.appendChild(el);
    }

    // Manifest, cores e ícones pra instalação no Android/iOS/Desktop.
    ensureLink({ rel: 'manifest', href: '/manifest.json' });
    ensureLink({ rel: 'icon', type: 'image/svg+xml', href: '/icons/icon-192.svg' });
    ensureLink({ rel: 'apple-touch-icon', href: '/icons/icon-192.svg' });
    ensureLink({ rel: 'mask-icon', href: '/icons/icon-192.svg', color: '#0284c7' });

    ensureMeta('theme-color', '#0284c7');
    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    ensureMeta('apple-mobile-web-app-title', 'Rota++');
    ensureMeta('application-name', 'Rota++');
    ensureMeta('mobile-web-app-capable', 'yes');
    ensureMeta('msapplication-TileColor', '#0284c7');

    // Registra service worker (scope "/"). Idempotente: se outra página
    // já registrou, o navegador só atualiza a mesma instância.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/service-worker.js').then(function (reg) {
                // Puxa atualização em background; deploy novo → usuário pega na
                // próxima navegação sem precisar limpar cache manualmente.
                try { reg.update(); } catch (_) {}
            }).catch(function (err) {
                console.warn('[PWA] falha ao registrar service worker:', err && err.message);
            });
        });
    }

    // Botão discreto "Instalar app" que só aparece em navegadores que
    // suportam a instalação nativa (Chrome/Edge Android/Desktop).
    var promptEvt = null;

    function criarBotaoInstalar() {
        if (document.getElementById('rfs-pwa-install')) return document.getElementById('rfs-pwa-install');
        var b = document.createElement('button');
        b.id = 'rfs-pwa-install';
        b.type = 'button';
        b.innerText = '⬇ Instalar Rota++';
        b.style.cssText = [
            'position:fixed',
            'left:10px',
            'bottom:6px',
            'z-index:9999',
            'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
            'font-size:11px',
            'font-weight:600',
            'letter-spacing:0.2px',
            'color:#0369a1',
            'background:#f0f9ff',
            'border:1px solid #bae6fd',
            'border-radius:6px',
            'padding:4px 8px',
            'cursor:pointer',
            'box-shadow:0 1px 2px rgba(0,0,0,0.06)',
            'opacity:0.9'
        ].join(';');
        b.addEventListener('click', async function () {
            if (!promptEvt) return;
            b.disabled = true;
            try {
                promptEvt.prompt();
                await promptEvt.userChoice;
            } catch (_) {}
            promptEvt = null;
            if (b.parentNode) b.parentNode.removeChild(b);
        });
        if (document.body) document.body.appendChild(b);
        return b;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
        // Intercepta o prompt padrão pra oferecer via botão custom
        // (regra da Play Store/Chrome: precisa gesto do usuário).
        e.preventDefault();
        promptEvt = e;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', criarBotaoInstalar);
        } else {
            criarBotaoInstalar();
        }
    });

    window.addEventListener('appinstalled', function () {
        var b = document.getElementById('rfs-pwa-install');
        if (b && b.parentNode) b.parentNode.removeChild(b);
        promptEvt = null;
    });
})();
