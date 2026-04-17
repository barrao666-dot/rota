/**
 * Simula o motorista enviando uma posição — útil pra testar o mapa do
 * painel sem precisar de um celular físico. Pega o primeiro usuário de
 * perfil 'motorista' e insere uma linha em motoristas_posicao.
 *
 * Uso: node backend/scripts/simular-posicao.js [lat] [lng]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');

(async () => {
    try {
        const [rows] = await db.query(
            "SELECT id, empresa_id, nome, login FROM usuarios WHERE perfil = 'motorista' LIMIT 1"
        );
        if (rows.length === 0) {
            console.log('Nenhum motorista cadastrado. Rode:');
            console.log('  node backend/scripts/criar-motorista-teste.js criar 1 motorista1 123456');
            return;
        }
        const m = rows[0];
        const lat = parseFloat(process.argv[2]) || -19.9167;
        const lng = parseFloat(process.argv[3]) || -43.9345;
        await db.query(
            `INSERT INTO motoristas_posicao (empresa_id, usuario_id, lat, lng, velocidade, precisao, atualizado_em)
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), velocidade=VALUES(velocidade), precisao=VALUES(precisao), atualizado_em=NOW()`,
            [m.empresa_id, m.id, lat, lng, 8.3, 10]
        );
        console.log(`OK: posição simulada para ${m.nome} (${m.login}) @ [${lat}, ${lng}]`);
        console.log('   Abra /operacao/rotas.html ou /empresa/painel.html (aba Rastreamento) e veja o pino 🚚.');
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        process.exit(0);
    }
})();
