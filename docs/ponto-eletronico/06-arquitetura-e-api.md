# 06 — Arquitetura e API

Como o módulo se encaixa nos padrões que o Rota++ já usa, e onde ele
deliberadamente foge deles.

## Onde o padrão atual não serve

O padrão do projeto hoje é rota Express com SQL inline no handler e validação em
funções locais. Funciona bem para CRUD — `backend/routes/veiculos.js` tem 84
linhas e faz tudo o que precisa.

Não serve para ponto, por dois motivos concretos. Primeiro, `coletas.js` já tem
615 linhas com SQL inline e é o arquivo mais difícil do backend; o motor de
apuração é mais complexo que isso e não caberia em um arquivo de rota. Segundo, e
mais importante: **cálculo de jornada é a única parte deste sistema que precisa de
teste automatizado**. Tolerância de 5/10 minutos, hora noturna reduzida a
52min30s, dobra de feriado, banco de horas com três prazos de expiração e
tempo de espera com corte em 12/07/2023 são regras que se quebram em silêncio.
Um erro de arredondamento aqui não gera exceção — gera um passivo trabalhista
descoberto dois anos depois. Lógica de cálculo dentro de handler HTTP não é
testável sem subir servidor e banco.

Daí a única concessão arquitetural que vale fazer: uma **camada de serviço para
o domínio de ponto**, com funções puras onde possível, separada das rotas. O
`package.json` hoje tem `"test": "echo Error: no test specified"`; este módulo é a
razão para mudar isso.

## Estrutura proposta

```
backend/
├── routes/
│   └── ponto/
│       ├── index.js            # monta os sub-routers em /api/ponto
│       ├── marcacoes.js        # POST marcação, GET próprias, comprovante
│       ├── colaboradores.js    # CRUD de colaborador e vínculo
│       ├── estabelecimentos.js # CRUD + geocerca
│       ├── escalas.js          # escalas e horários contratuais
│       ├── tratamentos.js      # solicitação e aprovação de ajuste
│       ├── ausencias.js        # férias, atestado, abono, afastamento
│       ├── apuracao.js         # espelho, recálculo, fechamento
│       └── fiscais.js          # AFD, AEJ, download assinado
├── servicos/ponto/
│   ├── nsr.js                  # gerador transacional de NSR
│   ├── hash-cadeia.js          # SHA-256 encadeado
│   ├── relogio.js              # hora oficial (NTP) e desvio do dispositivo
│   ├── antifraude.js           # geocerca, mock location, classificação
│   ├── apuracao/
│   │   ├── index.js            # orquestra o cálculo de um dia
│   │   ├── tolerancia.js       # art. 58, §1º
│   │   ├── noturno.js          # art. 73 e fator 60/52,5
│   │   ├── intervalos.js       # arts. 71 e 66
│   │   ├── extras.js           # faixas de percentual
│   │   ├── dsr-feriado.js      # Lei 605/1949
│   │   ├── banco-horas.js      # três prazos de expiração
│   │   └── motorista.js        # tempo de direção, espera, CTB 67-C
│   ├── arquivos/
│   │   ├── afd.js              # leiaute 004, CRC-16 KERMIT
│   │   ├── aej.js              # leiaute 002, pipe-delimited
│   │   └── assinatura.js       # CAdES .p7s e PAdES
│   └── parametros.js           # carrega config por vigência
└── scripts/
    └── migrate-ponto.js        # migrações do módulo, chamadas por migrate-schema
```

Cada arquivo fica abaixo de 300 linhas. `servicos/ponto/apuracao/*` recebe dados
e devolve números — sem `req`, sem `res`, sem `db` — o que permite testar cada
regra com uma tabela de casos, incluindo os casos de fronteira que a lei define
(exatamente 5 minutos, exatamente 10 minutos no dia, marcação às 04:59 e às
05:01, jornada de exatamente 6 horas).

As migrações vão em arquivo próprio chamado por `aplicarMigracoes()`, mantendo o
padrão `garantirXxx()` mas sem levar `migrate-schema.js` de 143 para 600 linhas.

## Rotas

Prefixo `/api/ponto`. Registro em `backend/server.js` seguindo a ordem atual
(API antes do estático).

### Marcação — o coletor

| Método | Rota | Quem | Nota |
|---|---|---|---|
| `POST` | `/api/ponto/marcacoes` | colaborador | **Nunca retorna 4xx por geocerca ou horário** |
| `GET` | `/api/ponto/marcacoes/minhas` | colaborador | Últimas 48h, para o art. 80 |
| `GET` | `/api/ponto/marcacoes/:id/comprovante` | colaborador | PDF assinado |
| `GET` | `/api/ponto/marcacoes/hora-oficial` | colaborador | Hora do servidor, para o relógio do app |

`POST /marcacoes` é a rota mais sensível do módulo e tem um contrato incomum: ela
**tem de aceitar praticamente tudo**. Marcação fora da geocerca, fora do horário,
em dia de folga, com GPS impreciso, sem GPS, com relógio do dispositivo
divergente — tudo é gravado. Os únicos 4xx legítimos são autenticação inválida,
colaborador inexistente e payload malformado. Rejeitar por regra de negócio
violaria o art. 74, I da Portaria 671. É o oposto do instinto normal de
validação, e precisa estar comentado no código para não ser "corrigido" depois.

A rota também precisa ser **idempotente por cliente**: o app offline reenvia a
fila, e um reenvio não pode gerar duas marcações. Um identificador gerado no
dispositivo (`uuid` por marcação) resolve, com unique index.

### Gestão

| Método | Rota | Quem |
|---|---|---|
| `GET`/`POST`/`PATCH` | `/api/ponto/colaboradores` | gestor |
| `GET`/`POST`/`PATCH` | `/api/ponto/estabelecimentos` | gestor |
| `GET`/`POST`/`PATCH` | `/api/ponto/escalas` | gestor |
| `GET`/`POST`/`PATCH` | `/api/ponto/horarios` | gestor |
| `GET`/`POST` | `/api/ponto/parametros` | gestor |
| `GET`/`POST` | `/api/ponto/feriados` | gestor |

### Tratamento e aprovação

| Método | Rota | Quem |
|---|---|---|
| `POST` | `/api/ponto/tratamentos` | colaborador (solicita) ou gestor (lança) |
| `PATCH` | `/api/ponto/tratamentos/:id/aprovar` | gestor |
| `PATCH` | `/api/ponto/tratamentos/:id/rejeitar` | gestor |
| `GET` | `/api/ponto/tratamentos/pendentes` | gestor |
| `POST` | `/api/ponto/ausencias` | colaborador ou gestor |
| `PATCH` | `/api/ponto/ausencias/:id/aprovar` | gestor |

### Apuração

| Método | Rota | Nota |
|---|---|---|
| `GET` | `/api/ponto/apuracao/espelho/:colaboradorId` | Marcações originais **e** tratadas (art. 84) |
| `POST` | `/api/ponto/apuracao/recalcular` | Por colaborador ou por competência |
| `GET` | `/api/ponto/apuracao/banco-horas/:colaboradorId` | Extrato com movimentos e expiração |
| `POST` | `/api/ponto/apuracao/fechar` | Trava a competência |
| `POST` | `/api/ponto/apuracao/reabrir` | Registra evento na ARP |
| `GET` | `/api/ponto/apuracao/painel` | Tempo real: quem bateu, pendências, alertas |

### Arquivos fiscais

| Método | Rota | Nota |
|---|---|---|
| `GET` | `/api/ponto/fiscais/afd` | Por estabelecimento e período; gera o `.p7s` junto |
| `GET` | `/api/ponto/fiscais/aej` | Idem |
| `GET` | `/api/ponto/fiscais/verificar-cadeia` | Valida a cadeia de hash — diagnóstico interno |

O `verificar-cadeia` não é exigência legal, é higiene: se a cadeia quebrar por
bug, é melhor descobrir num check periódico do que numa fiscalização.

## Permissões

O modelo atual tem três roles no JWT (`master`, `empresa`, `operador`) e o
motorista entra como `operador` com `tipoApp: 'motorista'`. Ponto exige uma
distinção que hoje não existe: **quem bate ponto não é quem aprova ponto**.

| Papel | Pode |
|---|---|
| Colaborador | Marcar, ver as próprias marcações e comprovantes, solicitar ajuste e ausência, ver o próprio espelho |
| Gestor de ponto | Tudo do colaborador para a sua equipe, aprovar, tratar, fechar competência |
| Administrador de ponto | Configurar parâmetros, escalas, estabelecimentos, gerar arquivos fiscais |

Duas regras a garantir no middleware, porque são as que um auditor procura:
ninguém aprova a própria solicitação, e ninguém edita marcação — nem o
administrador, nem o `master`. O segundo caso é o que mais escapa: uma rota
administrativa de "corrigir dados" que aceite `UPDATE` em `ponto_marcacoes`
transforma o sistema em irregular por construção, independentemente de alguém
usá-la (art. 74, IV, e art. 98).

## Frontend

### PWA do motorista — `frontend/operacao/motorista.html`

O coletor já está instalado nos celulares e já tem GPS, wake lock, tratamento de
`visibilitychange` e reconexão automática. O que falta é uma tela de ponto:

- Botão grande de marcação, com **relógio digital exibindo horas, minutos e
  segundos** (Anexo IX, item 3, que exige relógio não-analógico com segundos).
- Hora vinda do servidor, não do dispositivo, com indicador de sincronismo.
- Fila offline persistida em `IndexedDB` ou `localStorage`, com reenvio no
  primeiro momento em que voltar a ficar on-line (Anexo IX, item 5).
- Comprovante da marcação exibido imediatamente e lista das últimas 48h.
- Aviso de tempo de direção quando aproximar do limite legal.

O arquivo `frontend/js/motorista.js` já tem 1.041 linhas. A tela de ponto deve ir
para `frontend/js/ponto-motorista.js`, não crescer o arquivo atual.

Vale registrar que o `/js/motorista.js` e o `/operacao/motorista.html` estão na
lista `ASSETS_SEM_CACHE` do `server.js` — o novo arquivo precisa entrar na mesma
lista, ou motoristas ficarão presos em versão antiga do coletor de ponto, que é
exatamente o tipo de falha silenciosa que gera marcação perdida.

### Painel React — `ui/src/pages/empresa/`

Páginas novas, entrando no `Sidebar` como seção própria:

| Página | Conteúdo |
|---|---|
| `ponto/Painel.jsx` | Tempo real: quem bateu, pendências, alertas de direção e de hora extra |
| `ponto/Espelho.jsx` | Espelho por colaborador e competência, com original vs. tratado |
| `ponto/Tratamentos.jsx` | Fila de aprovação |
| `ponto/Colaboradores.jsx` | Cadastro de vínculo |
| `ponto/Escalas.jsx` | Escalas e horários contratuais |
| `ponto/Fiscais.jsx` | Geração e download de AFD e AEJ |

O `Sidebar` hoje tem os grupos `NAVEGAÇÃO`, `GERENCIAMENTO` e `SISTEMA`
(`ui/src/components/Sidebar.jsx`, linhas 35–52). Ponto entra como grupo próprio —
"JORNADA" — porque é um domínio distinto de operação logística e o usuário dele
frequentemente é outra pessoa (DP, não roteirizador).

Detalhe do espelho que não é opcional: o art. 84 exige exibir **as marcações do
REP e as marcações tratadas**. Não é uma tela que mostra o resultado final; é uma
tela que mostra as duas colunas lado a lado, com o motivo de cada divergência.
Um espelho que só mostra o número tratado não cumpre a norma.

## Integração com o que já existe

Três pontos de contato, todos aditivos — nenhum exige alterar comportamento atual:

**Trilha de GPS.** `POST /api/coletas/posicao` continua fazendo o upsert que
alimenta o mapa em tempo real, e passa a gravar também uma linha em
`ponto_trilha_gps`. É uma inserção adicional na mesma requisição. A rota é
chamada a cada 10–20s por motorista, então vale medir o custo antes de assumir
que é grátis; se pesar, a gravação da trilha pode ir para uma fila.

**Marcos de entrega.** `PATCH /api/coletas/:id/status` já grava `hora_partida`,
`hora_chegada` e `hora_conclusao`. O motor de apuração lê esses marcos como
terceira fonte de evidência, sem que a rota de coletas precise saber que ponto
existe. O acoplamento fica todo do lado do ponto.

**Roteirização.** Este é o único ponto de contato que altera comportamento
existente, e por isso deve ser o último a ser feito: o otimizador passa a
consultar saldo de jornada e interjornada antes de alocar motorista. Enquanto o
módulo de ponto não estiver com dados confiáveis, essa consulta só deve avisar,
nunca impedir a montagem da rota — um bug de apuração que trava a operação
logística é muito pior que uma hora extra a mais.
