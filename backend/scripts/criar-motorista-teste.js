/**
 * Script utilitário para teste do rastreamento em tempo real.
 *
 * Uso:
 *   node backend/scripts/criar-motorista-teste.js promover <login>
 *     -> Muda o perfil de um usuário existente para 'motorista'.
 *
 *   node backend/scripts/criar-motorista-teste.js criar <empresa_id> <login> <senha> [nome]
 *     -> Cria um novo usuário com perfil 'motorista'.
 *
 *   node backend/scripts/criar-motorista-teste.js listar
 *     -> Lista todos os usuários e seus perfis.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const db = require('../db');
const bcrypt = require('bcrypt');

async function listar() {
    const [rows] = await db.query(
        'SELECT id, empresa_id, nome, login, email, perfil, status FROM usuarios ORDER BY empresa_id, id'
    );
    console.log(`\n${rows.length} usuários encontrados:`);
    rows.forEach((u) => {
        const badge = u.perfil === 'motorista' ? '🚚' : (u.perfil === 'admin' ? '⭐' : '👤');
        console.log(`  ${badge} [${u.id}] empresa=${u.empresa_id} login=${u.login.padEnd(20)} perfil=${u.perfil.padEnd(10)} status=${u.status}`);
    });
}

async function promover(login) {
    const [rows] = await db.query('SELECT id, nome, perfil FROM usuarios WHERE login = ?', [login]);
    if (rows.length === 0) {
        console.log(`Usuário com login "${login}" não encontrado.`);
        return;
    }
    const u = rows[0];
    if (u.perfil === 'motorista') {
        console.log(`Usuário ${u.nome} (${login}) JÁ É motorista.`);
        return;
    }
    await db.query('UPDATE usuarios SET perfil = ? WHERE id = ?', ['motorista', u.id]);
    console.log(`OK: ${u.nome} (${login}) promovido de "${u.perfil}" para "motorista".`);
    console.log(`   Ele agora entra só em /operacao/login.html.`);
}

async function criar(empresaId, login, senha, nome) {
    const [existe] = await db.query('SELECT id FROM usuarios WHERE login = ?', [login]);
    if (existe.length > 0) {
        console.log(`Login "${login}" já existe. Use o comando "promover" para mudar o perfil.`);
        return;
    }
    const [emp] = await db.query('SELECT id, nome FROM empresas WHERE id = ?', [empresaId]);
    if (emp.length === 0) {
        console.log(`Empresa ${empresaId} não encontrada. Rode "listar" para ver usuários/empresas.`);
        return;
    }
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    const email = `${login}@motorista.local`;
    await db.query(
        `INSERT INTO usuarios (empresa_id, nome, login, senha, email, perfil, status)
         VALUES (?, ?, ?, ?, ?, 'motorista', 'ativo')`,
        [Number(empresaId), nome || login, login, senhaHash, email]
    );
    console.log(`OK: motorista "${login}" criado na empresa "${emp[0].nome}" (id ${empresaId}).`);
    console.log(`   Login: ${login}`);
    console.log(`   Senha: ${senha}`);
    console.log(`   URL:   http://localhost:3000/operacao/login.html`);
}

(async () => {
    const [, , cmd, ...args] = process.argv;
    try {
        if (cmd === 'listar') {
            await listar();
        } else if (cmd === 'promover' && args[0]) {
            await promover(args[0]);
        } else if (cmd === 'criar' && args.length >= 3) {
            await criar(args[0], args[1], args[2], args[3]);
        } else {
            console.log('Uso:');
            console.log('  node backend/scripts/criar-motorista-teste.js listar');
            console.log('  node backend/scripts/criar-motorista-teste.js promover <login>');
            console.log('  node backend/scripts/criar-motorista-teste.js criar <empresa_id> <login> <senha> [nome]');
        }
    } catch (err) {
        console.error('ERRO:', err.message);
    } finally {
        process.exit(0);
    }
})();
