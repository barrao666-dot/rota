require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');

(async () => {
    try {
        const [rows] = await db.query('SELECT * FROM motoristas_posicao ORDER BY atualizado_em DESC LIMIT 10');
        console.log('linhas:', rows.length);
        rows.forEach(r => console.log(r));
        const [us] = await db.query("SELECT id, nome, login, perfil, empresa_id, status FROM usuarios ORDER BY id DESC LIMIT 20");
        console.log('\nUsuários recentes:');
        us.forEach(u => console.log(u));
    } catch (err) {
        console.error('ERRO:', err);
    } finally {
        process.exit(0);
    }
})();
