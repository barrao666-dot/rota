require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { aplicarMigracoes } = require('./migrate-schema');

(async () => {
    try {
        await aplicarMigracoes();
        console.log('[Rota++] migrações concluídas.');
    } catch (err) {
        console.error('[Rota++] erro na migração:', err);
    } finally {
        process.exit(0);
    }
})();
