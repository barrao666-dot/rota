# 07 — Faseamento, riscos e decisões pendentes

## Ordem de entrega

O faseamento é por dependência técnica, não por estimativa de prazo. Cada fase
entrega algo utilizável e nenhuma exige refazer a anterior.

### Fase 0 — desbloqueio de cadastro

Sem isto, nada mais tem valor legal. É a fase mais barata e a mais crítica.

- `ponto_estabelecimentos` com CNPJ `VARCHAR(14)` e contador de NSR.
- `ponto_colaboradores` com CPF, admissão, cargo e `tipo_regime_jornada`.
- `ponto_eventos_arp` substituindo o `logAudit()` de `console.info`.
- Reaproveitar `backend/utils/documento-validator.js` para validar CPF.
- Backfill do CPF dos motoristas já cadastrados — é trabalho de dados do cliente,
  não de código, e precisa ser combinado antes.

Ao fim da fase 0 nada de ponto funciona ainda. Vale resistir à tentação de pular
para a fase 1: cadastro sem CPF gera marcação sem CPF, e marcação sem CPF não
entra no AFD nem retroativamente, porque a cadeia de hash já estará selada.

### Fase 1 — coleta de marcações

- Gerador de NSR transacional e cadeia de hash SHA-256.
- Sincronismo NTP com a Hora Legal Brasileira e endpoint de hora oficial.
- `POST /api/ponto/marcacoes` idempotente, que **aceita tudo**.
- Tela de ponto no PWA, com relógio de segundos e fila offline.
- Metadados antifraude e geocerca sinalizadora.
- Comprovante de registro de ponto e acesso às últimas 48h.

Ao fim da fase 1 existe registro de ponto confiável e imutável, com comprovante.
Ainda não há apuração — mas já há prova.

### Fase 2 — apuração e espelho

- Motor de cálculo modular (`servicos/ponto/apuracao/*`), com testes.
- Escalas, horários contratuais e calendário de feriados.
- Tolerância, adicional noturno com hora reduzida, extras por faixa, intervalos,
  DSR e dobra de feriado.
- Fluxo de tratamento: inclusão, desconsideração, abono, com anexo e aprovação.
- Espelho de ponto conforme art. 84, com original e tratado lado a lado.
- Fechamento de competência com trava.

Ao fim da fase 2 o módulo é um ponto eletrônico funcional para uso interno de DP.

### Fase 3 — conformidade fiscal

- Geração do AFD (leiaute `004`) com CRC-16 KERMIT e trailer.
- Geração do AEJ (leiaute `002`), delimitado por pipe.
- Assinatura CAdES `.p7s` destacada e PAdES no comprovante.
- Verificador de cadeia de hash.
- Política de retenção e expurgo.

Depende do registro no INPI e do certificado ICP-Brasil, que são processos
externos e devem ser iniciados **em paralelo à fase 1**, não aqui — são a
dependência de maior lead time do projeto inteiro.

Ao fim da fase 3 o módulo é um REP-P.

### Fase 4 — diferenciais de motorista

- `ponto_trilha_gps` particionada, com expurgo.
- Cálculo de tempo de direção a partir da trilha.
- Alertas do CTB art. 67-C em tempo real, no app e no painel.
- Tempo de espera distinguido por geocerca de cliente, com a regra de vigência de
  12/07/2023.
- Divergência automática entre marcação, trilha e marcos de entrega.

Poderia vir antes da fase 3 — não há dependência técnica. A escolha entre 3 e 4
primeiro é comercial: a fase 3 destrava a venda para quem precisa de conformidade
hoje; a fase 4 destrava a diferenciação.

### Fase 5 — jornada como restrição de roteirização

- Saldo de jornada e interjornada consultados no planejamento.
- Tempo de direção projetado confrontado com o limite antes do despacho.
- Alerta na montagem da rota, evoluindo para restrição.

Última porque é a única que altera comportamento existente da operação
logística. Deve começar como aviso e só virar bloqueio depois de a apuração
estar comprovadamente correta.

### Fase 6 — extensão de RH (opcional)

Férias, folgas, day off, banco de horas completo, notificações, relatórios
gerenciais, exportação para folha. Nada aqui é pré-requisito de nada.

## Riscos

### Técnicos

| Risco | Impacto | Mitigação |
|---|---|---|
| NSR duplicado ou com lacuna sob concorrência | AFD inválido; é o dado que o fiscal audita | Transação com `SELECT ... FOR UPDATE`; nunca `MAX(nsr)+1` |
| Cadeia de hash quebrada por bug | Perde a integridade de todo o período posterior | Verificador periódico; teste de regressão na cadeia |
| Ambiguidade do hash na norma | Divergência com validador de terceiro | Documentar a decisão de concatenação e **nunca** alterá-la |
| Volume de `ponto_trilha_gps` | ~57 M linhas/ano a cada 100 motoristas | Particionar por mês desde o início; expurgo da trilha crua |
| Erro silencioso de arredondamento | Passivo trabalhista descoberto anos depois | Testes com casos de fronteira da lei |
| Sobrecarga em `POST /api/coletas/posicao` | Degrada o rastreamento em tempo real, que é o produto atual | Medir antes; fila se necessário |
| Cache do PWA servindo coletor antigo | Marcação perdida sem ninguém notar | Incluir os novos assets em `ASSETS_SEM_CACHE` |

### Legais

| Risco | Impacto | Mitigação |
|---|---|---|
| Módulo bloquear marcação por regra de negócio | Sistema irregular; art. 98 prevê apreensão | `POST /marcacoes` sem 4xx de negócio, comentado no código |
| Rota administrativa que altere marcação | Idem, mesmo sem uso | Nenhum `UPDATE`/`DELETE` em `ponto_marcacoes`, nem para `master` |
| Cliente perder o argumento do art. 62, I | Passa a ter jornada controlada onde antes alegava atividade externa | Comunicar na venda; é efeito real da telemetria |
| Regra em aberto virar `if` no código | Recálculo de período antigo com regra nova gera número errado | Tudo em `ponto_parametros` com vigência |
| Biometria sem alternativa | Violação da LGPD (dado sensível, art. 11) | Alternativa não biométrica obrigatória |
| Espelho sem as marcações originais | Descumpre o art. 84 | Duas colunas na tela, sempre |

### De projeto

O maior risco não é nenhum dos acima: é **escopo**. A pesquisa de mercado
identificou cerca de 90 funcionalidades no piso competitivo do segmento, e a
Flash vende ponto junto com sete outros módulos de RH. É fácil transformar isto
num programa que nunca entrega. As fases 0 e 1 são pequenas e destravam valor
real (registro confiável com comprovante); a tentação de começar pela fase 2 ou
pela 4, que são as visíveis, é o que faz projetos assim atrasarem.

O segundo risco de projeto é de mercado, e é honesto reconhecê-lo: o cliente do
Rota++ tem motoristas mas também tem administrativo, e o DP dele não vai operar
dois sistemas de ponto. Ou o módulo atende a empresa inteira, ou perde para quem
atende. Isso significa que o piso competitivo (fases 0 a 3) **não é opcional** —
os diferenciais da fase 4 são o motivo de escolher o Rota++ entre os produtos que
fazem o básico, não um atalho para pular o básico.

## Decisões que precisam ser tomadas antes de codificar

Nenhuma destas é decisão de engenharia. Todas bloqueiam ou redirecionam o
trabalho:

1. **O posicionamento**: telemetria de jornada, REP-P completo, ou integrador?
   As três opções estão no [README](README.md). O restante desta análise assume
   REP-P chegando pelo caminho da telemetria.
2. **Iniciar o registro no INPI e a aquisição do certificado ICP-Brasil?** Maior
   lead time do projeto. Se a resposta for sim, começa agora, em paralelo ao
   código.
3. **Quem assume o Atestado Técnico e Termo de Responsabilidade?** Exige
   assinatura qualificada de pessoa física, como responsável técnico e legal
   (art. 89). É uma responsabilidade pessoal, não corporativa.
4. **Ponto atende só motoristas ou a empresa inteira?** Muda o cadastro, as telas
   e o posicionamento comercial.
5. **Quem faz o backfill de CPF dos motoristas já cadastrados?** É dado do
   cliente e precisa de LGPD (finalidade, consentimento ou base legal).
6. **Biometria facial entra?** Se sim, decidir fornecedor, se há liveness, e a
   alternativa não biométrica obrigatória.
7. **Parecer jurídico sobre as oito questões em aberto** listadas em
   [04](04-conformidade-legal.md), seção 11. Os *defaults* de `ponto_parametros`
   precisam de respaldo — escolher default sozinho é assumir risco no lugar do
   cliente.
8. **Política de retenção**: 5 anos (prescrição) ou 10 (conservador de mercado)?
   Afeta custo de armazenamento e o desenho do expurgo.

## O que fica registrado como incerto

Para não passar falsa confiança:

- O **método exato de concatenação do hash** do registro tipo 7 não é
  especificado pela norma — sem separador, encoding ou normalização definidos. O
  MTE nunca publicou o manual técnico do desenvolvedor. Implementações divergem.
- O **prazo de guarda** não está na Portaria 671; é construção interpretativa a
  partir de CF art. 7º, XXIX, CLT art. 11 e Súmula 338 do TST. Merece validação
  jurídica antes de definir política de expurgo.
- O tratamento do **tempo do segundo motorista** (dupla) não tem norma após a ADI
  5322 derrubar o descanso com veículo em movimento.
- Os **valores de mercado** coletados na pesquisa são parciais: a maioria dos
  fornecedores grandes só informa preço sob consulta, e os números de terceiros
  para a Pontomais são conflitantes entre si (de R$ 5,49 a R$ 14) e não devem ser
  usados como referência.
- Onze pontos da pesquisa de mercado ficaram como não confirmados por falta de
  fonte pública; estão listados na seção 11 do
  [anexo](90-anexo-pesquisa-mercado.md).
