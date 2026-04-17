const db = require('../db');

// Migrações idempotentes executadas no boot. Mantém o schema compatível com o
// código atual sem exigir migrations externas.
async function aplicarMigracoes() {
    await garantirColunaColetaVinculada();
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

module.exports = { aplicarMigracoes };
