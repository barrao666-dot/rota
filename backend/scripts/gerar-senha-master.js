/**
 * Gera uma nova senha forte para o login Master (variável MASTER_PASS no backend/.env).
 * O login Master compara texto plano com process.env.MASTER_PASS — não há hash no banco.
 *
 * Uso: na raiz do projeto → npm run senha-master
 */
const crypto = require('crypto');

const senha = crypto.randomBytes(24).toString('base64url');

console.log('');
console.log('=== Nova senha Master (guarde em local seguro) ===');
console.log('');
console.log(senha);
console.log('');
console.log('No arquivo backend/.env defina ou atualize:');
console.log('');
console.log(`MASTER_PASS=${senha}`);
console.log('');
console.log('Mantenha MASTER_USER como já está (ou altere na mesma hora).');
console.log('Reinicie o servidor (npm start) após salvar o .env.');
console.log('');
