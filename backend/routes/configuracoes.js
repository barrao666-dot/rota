const express = require('express');
const router = express.Router();

// Rota GET: Envia as configurações atuais para preencher a tela HTML
router.get('/', async (req, res) => {
    try {
        const configDoBanco = {
            nome: "Obralight Logística",
            cor1: "#333333",
            cor2: "#F9801A",
            baseEnd: "Av. Cachoeirinha, 585 - Belo Horizonte, MG",
            baseLat: "-19.882352",
            baseLng: "-43.945722",
            motoristas: ["João Silva", "Carlos Souza"],
            veiculos: ["ABC-1234 Fiorino"],
            categorias: [
                { id: "cat_1", nome: "Padrão", peso: 10, tempo: 15, a: 30, l: 30, c: 30 }
            ]
        };

        res.json({ configuracoes: configDoBanco });
        
    } catch (erro) {
        console.error("Erro no GET de configuracoes:", erro);
        res.status(500).json({ erro: "Erro interno ao buscar configurações no banco." });
    }
});

// Rota POST: Recebe os dados do botão "Salvar Tudo"
router.post('/', async (req, res) => {
    try {
        const dadosRecebidos = req.body.configuracoes;

        console.log("=========================================");
        console.log("NOVAS CONFIGURAÇÕES RECEBIDAS:");
        console.log(JSON.stringify(dadosRecebidos, null, 2));
        console.log("=========================================");

        res.status(200).json({ mensagem: "Configurações recebidas e processadas com sucesso!" });

    } catch (erro) {
        console.error("Erro no POST de configuracoes:", erro);
        res.status(500).json({ erro: "Erro interno ao tentar salvar as configurações." });
    }
});

// Essa é a única coisa que deve ficar no final desse arquivo!
module.exports = router;