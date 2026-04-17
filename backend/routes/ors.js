// Proxy para a OpenRouteService.
//
// Motivação: ORS está bloqueando chamadas direto do navegador por CORS
// (sem 'Access-Control-Allow-Origin' em algumas respostas/erros), o que
// quebra toda a geração de rotas e desenho de linhas no painel. Além disso,
// expor a chave da API no front não é seguro. Centralizando no backend a
// gente usa a api_mapas da própria empresa (ou a env ORS_KEY como
// fallback) e nunca vaza a chave pro cliente.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const ORS_BASE = 'https://api.openrouteservice.org';
// Node 18+ tem fetch global. Caso esteja em 16, exigir node-fetch.
const fetchFn = typeof fetch === 'function'
    ? fetch
    : ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

async function obterChaveORS(empresaId) {
    if (empresaId) {
        try {
            // mysql2/promise: db.query retorna [rows, fields]. Desestruturar
            // pra obter o array de registros; rows[0] é a primeira linha.
            const [rows] = await db.query('SELECT api_mapas FROM empresas WHERE id = ?', [empresaId]);
            const chave = rows && rows[0] && String(rows[0].api_mapas || '').trim();
            if (chave) return chave;
        } catch (e) {
            console.warn('[ors] falha ao ler api_mapas:', e.message);
        }
    }
    return String(process.env.ORS_KEY || '').trim();
}

async function encaminharParaORS(req, res, caminhoORS, { aceitarGeoJSON = false } = {}) {
    try {
        const empresaId = Number(req.auth && req.auth.empresaId) || null;
        const chave = await obterChaveORS(empresaId);
        if (!chave) {
            return res.status(400).json({ erro: 'Chave da OpenRouteService não configurada para esta empresa.' });
        }
        const url = `${ORS_BASE}${caminhoORS}`;
        const resp = await fetchFn(url, {
            method: 'POST',
            headers: {
                'Authorization': chave,
                'Content-Type': 'application/json',
                'Accept': aceitarGeoJSON ? 'application/geo+json' : 'application/json'
            },
            body: JSON.stringify(req.body || {})
        });
        const texto = await resp.text();
        const tipoConteudo = resp.headers.get('content-type') || 'application/json';
        res.status(resp.status).set('Content-Type', tipoConteudo).send(texto);
    } catch (erro) {
        console.error('[ors] erro no proxy para', caminhoORS, erro && erro.message);
        res.status(502).json({ erro: 'Falha ao consultar OpenRouteService.', detalhe: erro && erro.message });
    }
}

// Directions (JSON com segments/durations) — usado para distância trecho-a-trecho.
router.post('/directions/:profile/json', requireAuth, (req, res) => {
    const profile = encodeURIComponent(req.params.profile || 'driving-car');
    return encaminharParaORS(req, res, `/v2/directions/${profile}/json`);
});

// Directions (GeoJSON) — usado para desenhar a linha da rota no mapa.
router.post('/directions/:profile/geojson', requireAuth, (req, res) => {
    const profile = encodeURIComponent(req.params.profile || 'driving-car');
    return encaminharParaORS(req, res, `/v2/directions/${profile}/geojson`, { aceitarGeoJSON: true });
});

// Optimization — usado para gerar/otimizar a rota com shifts (VROOM).
router.post('/optimization', requireAuth, (req, res) => {
    return encaminharParaORS(req, res, '/optimization');
});

module.exports = router;
