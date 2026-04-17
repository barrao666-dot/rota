/**
 * Regras compartilhadas de endereço + geocoding (Nominatim) entre Painel da empresa e Rotas.
 * Deve ser carregado antes de painel.js / rotas.js.
 */

/**
 * Reverte o formato gravado pelo painel: "rua, número [- compl] - bairro, cidade - UF[, CEP: ...]"
 * para os campos do formulário (base, fornecedor, rotas).
 */
function parseEnderecoSalvoPainel(endereco) {
    const o = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' };
    if (!endereco || typeof endereco !== 'string') return o;
    let s = endereco.trim();
    const cepM = s.match(/\s*,?\s*CEP:\s*([\d.-]+)\s*$/i);
    if (cepM) {
        o.cep = cepM[1].replace(/\D/g, '');
        s = s.slice(0, cepM.index).trim();
    }
    const reTail = /^(.+)\s-\s([^,]+),\s([^-]+)\s-\s([A-Za-z]{2})$/;
    const m = s.match(reTail);
    if (m) {
        o.bairro = m[2].trim();
        o.cidade = m[3].trim();
        o.uf = m[4].trim().toUpperCase();
        const head = m[1];
        const fc = head.indexOf(',');
        if (fc === -1) {
            o.rua = head.trim();
        } else {
            o.rua = head.slice(0, fc).trim();
            const after = head.slice(fc + 1).trim();
            const aparts = after.split(/\s-\s/);
            o.numero = (aparts[0] || '').trim();
            if (aparts.length > 1) o.complemento = aparts.slice(1).join(' - ').trim();
        }
        return o;
    }
    o.rua = s;
    return o;
}

function normalizarCepSoDigitos(cep) {
    if (!cep) return '';
    return String(cep).replace(/\D/g, '');
}

function cepNominatimCoincide(addr, cepDigitos8) {
    if (!cepDigitos8 || cepDigitos8.length !== 8) return false;
    const pc = addr && addr.postcode ? normalizarCepSoDigitos(addr.postcode) : '';
    return pc === cepDigitos8;
}

function escolherMelhorResultadoNominatim(resultados, textoReferencia, cepDigitosOpcional) {
    if (!resultados || !resultados.length) return null;
    const ref = (textoReferencia || '').toLowerCase();
    const cepOk = normalizarCepSoDigitos(cepDigitosOpcional);
    const querAv = /\b(av\.|avenida)\b/i.test(ref);
    const querRua = /\brua\b/i.test(ref) && !querAv;
    const querAlameda = /\b(al\.|alameda)\b/i.test(ref);
    const querRodovia = /\b(rod\.|rodovia)\b/i.test(ref);
    let melhor = resultados[0];
    let melhorScore = -Infinity;
    for (const c of resultados) {
        const dn = (c.display_name || '').toLowerCase();
        let s = 0;
        const imp = parseFloat(c.importance);
        if (!isNaN(imp)) s += imp * 15;
        if (cepOk.length === 8 && c.address && cepNominatimCoincide(c.address, cepOk)) s += 120;
        if (querAv) {
            if (/avenida|\bav\.?\b/.test(dn)) s += 100;
            if (/\brua\b/.test(dn) && !/avenida|\bav\.?\b/.test(dn)) s -= 70;
        }
        if (querRua) {
            if (/\brua\b/.test(dn)) s += 70;
            if ((/avenida|\bav\.?\b/.test(dn)) && !/\brua\b/.test(dn)) s -= 35;
        }
        if (querAlameda && (/alameda|\bal\.?\b/.test(dn))) s += 85;
        if (querRodovia && (/rodovia|\bbr-|\brod\.?\b/.test(dn))) s += 85;
        if (s > melhorScore) {
            melhorScore = s;
            melhor = c;
        }
    }
    return melhor;
}

const NOMINATIM_HEADERS_ENDERECO = {
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'User-Agent': 'RotaPlusEndereco/1.0 (https://github.com/)'
};

const UF_PARA_NOME_ESTADO_BR = {
    AC: 'Acre',
    AL: 'Alagoas',
    AP: 'Amapá',
    AM: 'Amazonas',
    BA: 'Bahia',
    CE: 'Ceará',
    DF: 'Distrito Federal',
    ES: 'Espírito Santo',
    GO: 'Goiás',
    MA: 'Maranhão',
    MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais',
    PA: 'Pará',
    PB: 'Paraíba',
    PR: 'Paraná',
    PE: 'Pernambuco',
    PI: 'Piauí',
    RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul',
    RO: 'Rondônia',
    RR: 'Roraima',
    SC: 'Santa Catarina',
    SP: 'São Paulo',
    SE: 'Sergipe',
    TO: 'Tocantins'
};

function nomeEstadoBrasilPorUf(uf) {
    if (!uf) return '';
    const k = String(uf).trim().toUpperCase();
    return UF_PARA_NOME_ESTADO_BR[k] || String(uf).trim();
}

function higienizarTextoEnderecoParaGeocode(textoBruto, bairroParaRemover) {
    let s = (textoBruto || '').trim();
    s = s.replace(/\s*,?\s*CEP\s*:?\s*[\d.-]+\s*$/i, '');
    s = s.replace(/\b\d{2}\.?\d{3}-?\d{3}\b/g, ' ');
    s = s.replace(/\b\d{5}-?\d{3}\b/g, ' ');
    s = s.replace(/\bCEP\s*:?\s*[\d.-]+\b/gi, ' ');
    const b = (bairroParaRemover || '').trim();
    if (b.length >= 2) {
        const esc = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp(`\\s-\\s${esc}\\s*,`, 'gi'), ', ');
        s = s.replace(new RegExp(`,\\s*${esc}\\s*,`, 'gi'), ', ');
        s = s.replace(new RegExp(`^${esc}\\s*,`, 'gi'), '');
    }
    return s.replace(/\s*,\s*,/g, ',').replace(/\s+/g, ' ').replace(/^\s*,|,\s*$/g, '').trim();
}

function montarQueryGeocodeBaseEstrita(logradouro, numero, cidade, uf) {
    const estado = nomeEstadoBrasilPorUf(uf);
    const parts = [logradouro, numero, cidade, estado].map((x) => String(x || '').trim()).filter(Boolean);
    return parts.join(', ');
}

async function geocodificarEnderecoBrasil(textoEndereco, cepDigitosOpcional) {
    const q = encodeURIComponent(`${textoEndereco}, Brasil`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=8&addressdetails=1&countrycodes=br`;
    const geo = await fetch(url, {
        headers: NOMINATIM_HEADERS_ENDERECO
    });
    const gd = await geo.json();
    if (!gd || !gd.length) return { lat: null, lng: null };
    const escolhido = escolherMelhorResultadoNominatim(gd, textoEndereco, cepDigitosOpcional);
    if (!escolhido) return { lat: null, lng: null };
    return { lat: parseFloat(escolhido.lat), lng: parseFloat(escolhido.lon) };
}

async function geocodificarBaseOperacional({ rua, numero, cidade, uf, cep }) {
    const cepDigits = normalizarCepSoDigitos(cep);
    const ruaT = (rua || '').trim();
    const numT = (numero || '').trim();
    const cidadeT = (cidade || '').trim();
    const ufT = (uf || '').trim();
    const estadoNome = nomeEstadoBrasilPorUf(ufT);
    const streetLinha = [ruaT, numT].filter(Boolean).join(', ');

    const fetchNominatim = async (url) => {
        const g = await fetch(url, { headers: NOMINATIM_HEADERS_ENDERECO });
        return g.json();
    };

    const pick = (arr, refLog) => {
        if (!arr || !arr.length) return null;
        const escolhido = escolherMelhorResultadoNominatim(arr, refLog || ruaT, cepDigits);
        if (!escolhido) return null;
        return { lat: parseFloat(escolhido.lat), lng: parseFloat(escolhido.lon) };
    };

    const queryEstrita = montarQueryGeocodeBaseEstrita(ruaT, numT, cidadeT, ufT);
    if (queryEstrita.split(',').length >= 4) {
        const enc = encodeURIComponent(`${queryEstrita}, Brasil`);
        const gd = await fetchNominatim(
            `https://nominatim.openstreetmap.org/search?format=json&q=${enc}&limit=10&addressdetails=1&countrycodes=br`
        );
        const hit = pick(gd, ruaT);
        if (hit && hit.lat != null && !isNaN(hit.lat)) return hit;
    }

    if (streetLinha && cidadeT && estadoNome) {
        const params = new URLSearchParams({
            format: 'json',
            addressdetails: '1',
            countrycodes: 'br',
            limit: '10',
            street: streetLinha,
            city: cidadeT,
            state: estadoNome
        });
        let gd = await fetchNominatim(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
        let hit = pick(gd, ruaT);
        if (hit && hit.lat != null && !isNaN(hit.lat)) return hit;
        if (ufT.length === 2) {
            params.set('state', ufT);
            gd = await fetchNominatim(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
            hit = pick(gd, ruaT);
            if (hit && hit.lat != null && !isNaN(hit.lat)) return hit;
        }
    }

    if (cidadeT && estadoNome) {
        const enc = encodeURIComponent(`${cidadeT}, ${estadoNome}, Brasil`);
        const gd = await fetchNominatim(
            `https://nominatim.openstreetmap.org/search?format=json&q=${enc}&limit=6&addressdetails=1&countrycodes=br`
        );
        const hit = pick(gd, ruaT);
        if (hit && hit.lat != null && !isNaN(hit.lat)) return hit;
    }

    return { lat: null, lng: null };
}

/**
 * Mesma sequência do painel ao salvar fornecedor (texto livre + CEP no score),
 * com fallback à busca estruturada da base (sem bairro na query) e higienização.
 * Retorno para rotas: { lat, lon } ou null.
 */
async function geocodificarEntregaMesmaRegraPainel({ rua, numero, bairro, cidade, uf, cep }) {
    const cepDigits = normalizarCepSoDigitos(cep);
    const ruaT = (rua || '').trim();
    const numT = (numero != null ? String(numero) : '').trim();
    const bairroT = (bairro || '').trim();
    const cidadeT = (cidade || '').trim();
    const ufT = (uf || '').trim();

    const textoColeta = `${ruaT}, ${numT}, ${bairroT ? `${bairroT}, ` : ''}${cidadeT} - ${ufT}`;
    let g = await geocodificarEnderecoBrasil(textoColeta, cepDigits);
    if (g.lat != null && g.lng != null && !isNaN(g.lat) && !isNaN(g.lng)) {
        return { lat: g.lat, lon: g.lng };
    }

    if (ruaT && numT && cidadeT && ufT) {
        g = await geocodificarBaseOperacional({ rua: ruaT, numero: numT, cidade: cidadeT, uf: ufT, cep: cepDigits });
        if (g.lat != null && g.lng != null && !isNaN(g.lat) && !isNaN(g.lng)) {
            return { lat: g.lat, lon: g.lng };
        }
    }

    const full = `${ruaT}, ${numT} - ${bairroT}, ${cidadeT} - ${ufT}`;
    const limpo = higienizarTextoEnderecoParaGeocode(full, bairroT);
    if (limpo) {
        g = await geocodificarEnderecoBrasil(limpo, cepDigits);
        if (g.lat != null && g.lng != null && !isNaN(g.lat) && !isNaN(g.lng)) {
            return { lat: g.lat, lon: g.lng };
        }
    }

    return null;
}
