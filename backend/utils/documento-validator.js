// Validação de CPF/CNPJ usada no backend (única fonte da verdade) e
// reaproveitada no frontend via espelho em /js/documento-validator.js.
// Mantém os dois arquivos sincronizados — qualquer mudança aqui precisa
// refletir lá. O algoritmo segue a Receita Federal (módulo 11 com pesos
// decrescentes e dois dígitos verificadores).

function somenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function validarCPF(valor) {
    const cpf = somenteDigitos(valor);
    if (cpf.length !== 11) return false;
    // CPFs com todos os dígitos iguais (000... 999...) passam pela aritmética
    // mas são inválidos por convenção da Receita.
    if (/^(\d)\1{10}$/.test(cpf)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i), 10) * (10 - i);
    let dv1 = 11 - (soma % 11);
    if (dv1 >= 10) dv1 = 0;
    if (dv1 !== parseInt(cpf.charAt(9), 10)) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i), 10) * (11 - i);
    let dv2 = 11 - (soma % 11);
    if (dv2 >= 10) dv2 = 0;
    return dv2 === parseInt(cpf.charAt(10), 10);
}

function validarCNPJ(valor) {
    const cnpj = somenteDigitos(valor);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj)) return false;

    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let soma = 0;
    for (let i = 0; i < 12; i++) soma += parseInt(cnpj.charAt(i), 10) * pesos1[i];
    let dv1 = soma % 11;
    dv1 = dv1 < 2 ? 0 : 11 - dv1;
    if (dv1 !== parseInt(cnpj.charAt(12), 10)) return false;

    soma = 0;
    for (let i = 0; i < 13; i++) soma += parseInt(cnpj.charAt(i), 10) * pesos2[i];
    let dv2 = soma % 11;
    dv2 = dv2 < 2 ? 0 : 11 - dv2;
    return dv2 === parseInt(cnpj.charAt(13), 10);
}

// Decide automaticamente qual validar pelo tamanho. Retorna {ok, tipo, msg}
// pra o caller decidir se devolve 400 com mensagem amigável.
function validarDocumento(valor) {
    const d = somenteDigitos(valor);
    if (!d) return { ok: false, tipo: null, msg: 'Documento (CPF/CNPJ) é obrigatório.' };
    if (d.length === 11) {
        return { ok: validarCPF(d), tipo: 'CPF', msg: validarCPF(d) ? '' : 'CPF inválido. Verifique os dígitos.' };
    }
    if (d.length === 14) {
        return { ok: validarCNPJ(d), tipo: 'CNPJ', msg: validarCNPJ(d) ? '' : 'CNPJ inválido. Verifique os dígitos.' };
    }
    return { ok: false, tipo: null, msg: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).' };
}

module.exports = { somenteDigitos, validarCPF, validarCNPJ, validarDocumento };
