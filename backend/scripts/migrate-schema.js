const db = require('../db');

// Migrações idempotentes executadas no boot. Mantém o schema compatível com o
// código atual sem exigir migrations externas.
async function aplicarMigracoes() {
    await garantirColunaColetaVinculada();
    await garantirUniqueEmpresasDocumento();
    await garantirColunaHoraPrevista();
}

// ETA calculado pelo otimizador (hora absoluta de chegada na parada).
// Persistir pra mostrar no card mesmo após refresh — sem isso, o ETA se
// perderia ao recarregar a página.
async function garantirColunaHoraPrevista() {
    try {
        const existe = await colunaExiste('coletas', 'hora_prevista');
        if (existe) return;
        await db.query('ALTER TABLE coletas ADD COLUMN hora_prevista VARCHAR(5) NULL');
        console.log('[Rota++] migração: coluna coletas.hora_prevista criada.');
    } catch (erro) {
        console.warn('[Rota++] falha ao aplicar migração hora_prevista:', erro.message);
    }
}

async function colunaExiste(tabela, coluna) {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS qtd
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?`,
        [tabela, coluna]
    );
    return rows && rows[0] && Number(rows[0].qtd) > 0;
}

async function indiceExiste(tabela, indice) {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS qtd
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND INDEX_NAME = ?`,
        [tabela, indice]
    );
    return rows && rows[0] && Number(rows[0].qtd) > 0;
}

async function garantirColunaColetaVinculada() {
    try {
        const existe = await colunaExiste('coletas', 'coleta_vinculada_id');
        if (existe) return;
        await db.query(
            'ALTER TABLE coletas ADD COLUMN coleta_vinculada_id INT NULL, ADD INDEX idx_coletas_vinc (coleta_vinculada_id)'
        );
        console.log('[Rota++] migração: coluna coletas.coleta_vinculada_id criada.');
    } catch (erro) {
        console.warn('[Rota++] falha ao aplicar migração coleta_vinculada_id:', erro.message);
    }
}

// Garante UNIQUE em empresas.documento. Sem isso, o cadastro permite o mesmo
// CPF/CNPJ ser registrado em N contas diferentes, gerando duplicidade que
// quebra relatórios de faturamento e cobrança.
async function garantirUniqueEmpresasDocumento() {
    try {
        const jaTem = await indiceExiste('empresas', 'uk_empresas_documento');
        if (jaTem) return;
        try {
            await db.query(
                'ALTER TABLE empresas ADD UNIQUE KEY uk_empresas_documento (documento)'
            );
            console.log('[Rota++] migração: UNIQUE em empresas.documento aplicada.');
        } catch (erro) {
            // ER_DUP_ENTRY (1062) significa que já existem documentos repetidos
            // no banco — a regra atual de negócio é "ambiente sem duplicados",
            // mas se um deslize entrou, NÃO derrubamos o boot; logamos pra
            // o operador limpar manualmente e reaplicar depois.
            if (erro && (erro.code === 'ER_DUP_ENTRY' || erro.errno === 1062)) {
                console.warn(
                    '[Rota++] UNIQUE em empresas.documento NÃO aplicada: existem registros com documento duplicado. ' +
                    'Resolva os duplicados (SELECT documento, COUNT(*) FROM empresas GROUP BY documento HAVING COUNT(*) > 1) ' +
                    'e reinicie para a constraint subir.'
                );
                return;
            }
            throw erro;
        }
    } catch (erro) {
        console.warn('[Rota++] falha ao aplicar UNIQUE empresas.documento:', erro && erro.message);
    }
}

module.exports = { aplicarMigracoes };
