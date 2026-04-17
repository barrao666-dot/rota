// Reset rápido da senha de um motorista (usado só em dev/debug).
// Uso: node backend/scripts/reset-senha-motorista.js <login> <nova_senha>
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');
const bcrypt = require('bcrypt');

(async () => {
    const [, , login, senha] = process.argv;
    if (!login || !senha) {
        console.log('Uso: node backend/scripts/reset-senha-motorista.js <login> <nova_senha>');
        process.exit(1);
    }
    try {
        // Motorista agora vive na tabela `motoristas` (cadastro do painel).
        const [rows] = await db.query('SELECT id, nome, empresa_id FROM motoristas WHERE login = ?', [login]);
        if (rows.length === 0) {
            console.log(`Motorista "${login}" não encontrado na tabela motoristas.`);
            process.exit(1);
        }
        const u = rows[0];
        const hash = await bcrypt.hash(senha, 10);
        await db.query('UPDATE motoristas SET senha = ? WHERE id = ?', [hash, u.id]);
        console.log(`OK: senha de ${u.nome} (${login}) redefinida.`);
        console.log(`    login: ${login}`);
        console.log(`    senha: ${senha}`);
        console.log(`    empresa_id: ${u.empresa_id}`);
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        process.exit(0);
    }
})();
