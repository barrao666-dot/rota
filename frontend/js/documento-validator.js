// Espelho exato do backend/utils/documento-validator.js. Mantido sincronizado
// manualmente — qualquer alteração no algoritmo precisa ir nos dois arquivos.
// Exposto em window.* pra uso em telas que não usam módulos ES.

(function () {
    function somenteDigitos(valor) {
        return String(valor || '').replace(/\D/g, '');
    }

    function validarCPF(valor) {
        const cpf = somenteDigitos(valor);
        if (cpf.length !== 11) return false;
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

    function validarDocumento(valor) {
        const d = somenteDigitos(valor);
        if (!d) return { ok: false, tipo: null, msg: 'Documento (CPF/CNPJ) é obrigatório.' };
        if (d.length === 11) return { ok: validarCPF(d), tipo: 'CPF', msg: validarCPF(d) ? '' : 'CPF inválido. Verifique os dígitos.' };
        if (d.length === 14) return { ok: validarCNPJ(d), tipo: 'CNPJ', msg: validarCNPJ(d) ? '' : 'CNPJ inválido. Verifique os dígitos.' };
        return { ok: false, tipo: null, msg: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ).' };
    }

    // Formatação visual para exibição (não muda o valor enviado ao servidor).
    function formatarDocumento(valor) {
        const d = somenteDigitos(valor);
        if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
        if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, '$1.$2.$3/$4-$5');
        return d;
    }

    window.DocValidator = { somenteDigitos, validarCPF, validarCNPJ, validarDocumento, formatarDocumento };
})();
