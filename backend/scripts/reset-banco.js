// Reset do banco de dados para homologação/testes.
//
// Apaga TODOS os registros das tabelas de negócio mantendo o schema intacto.
// Recria (via INSERT) o super-admin master se MASTER_USER/MASTER_PASS estiverem
// definidos no .env. Exige a flag `--yes` pra evitar execução acidental.
//
// Uso:
//   node backend/scripts/reset-banco.js --yes
//   node backend/scripts/reset-banco.js --yes --keep-empresas   (mantém cadastro de empresas)

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');

// Ordem deliberada: primeiro as que referenciam outras, por último `empresas`.
// TRUNCATE zera AUTO_INCREMENT também (comportamento esperado em homologação).
const TABELAS_ORDEM = [
    'motoristas_posicao',
    'coletas',
    'regras',
    'bases',
    'veiculos',
    'motoristas',
    'usuarios',
    'empresas'
];

function parseArgs() {
    const args = process.argv.slice(2);
    return {
        confirmado: args.includes('--yes') || args.includes('-y'),
        manterEmpresas: args.includes('--keep-empresas')
    };
}

async function existe(tabela) {
    const [rows] = await db.query(
        `SELECT COUNT(*) AS qtd FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tabela]
    );
    return rows[0] && Number(rows[0].qtd) > 0;
}

(async () => {
    const { confirmado, manterEmpresas } = parseArgs();
    if (!confirmado) {
        console.log('⚠  ATENÇÃO: este comando APAGA todos os dados do banco.');
        console.log('   Rode novamente com --yes para confirmar:');
        console.log('   node backend/scripts/reset-banco.js --yes');
        console.log('   (use --keep-empresas para preservar cadastro de empresas)');
        process.exit(1);
    }

    const dbName = process.env.DB_NAME;
    console.log(`→ Resetando banco "${dbName}" (host=${process.env.DB_HOST})`);

    const alvos = manterEmpresas
        ? TABELAS_ORDEM.filter((t) => t !== 'empresas')
        : TABELAS_ORDEM;

    try {
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of alvos) {
            if (!(await existe(t))) {
                console.log(`   · skip ${t} (tabela não existe)`);
                continue;
            }
            await db.query(`TRUNCATE TABLE \`${t}\``);
            console.log(`   · TRUNCATE ${t}`);
        }
        await db.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅ Banco zerado. Estrutura preservada.');
        if (manterEmpresas) {
            console.log('ℹ  Tabela `empresas` foi mantida.');
        }
        console.log('ℹ  Super-admin master continua via variáveis MASTER_USER/MASTER_PASS do .env.');
    } catch (err) {
        console.error('❌ Falha no reset:', err.message);
        process.exitCode = 1;
    } finally {
        await db.end().catch(() => {});
    }
})();
