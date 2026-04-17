(function () {
    if (document.getElementById('rfs-footer')) return;
    var el = document.createElement('div');
    el.id = 'rfs-footer';
    el.setAttribute('role', 'contentinfo');
    el.innerText = 'desenvolvido por RFS';
    el.style.cssText = [
        'position:fixed',
        'right:10px',
        'bottom:6px',
        'z-index:9999',
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
        'font-size:10px',
        'letter-spacing:0.3px',
        'color:#94a3b8',
        'opacity:0.65',
        'pointer-events:none',
        'user-select:none',
        'background:transparent'
    ].join(';');
    var mount = function () {
        if (document.body) document.body.appendChild(el);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
