# 01 — Diagnóstico da base atual

## O que existe hoje e que serve de alicerce

Levantamento feito sobre `homolog` (`7e0da14`) e `release/nova-versao-testes`.
Nenhuma das duas branches tem qualquer código de ponto eletrônico: não há
tabelas, rotas, telas nem regras de jornada. Os termos `batida`, `espelho de
ponto`, `banco de horas`, `AFD`, `REP-P`, `afastamento`, `abono` e `colaborador`
não aparecem em nenhum arquivo. "Ponto", no código, significa sempre *parada de
rota*.

O que é reaproveitável:

| Ativo | Onde | Por que importa para ponto |
|---|---|---|
| Auth JWT multi-tenant | `backend/middleware/auth.js`, `authz.js` | Isolamento por `empresa_id` já resolvido; `assertCanAccessEmpresa` é o padrão a seguir |
| Login separado do trabalhador de campo | `backend/routes/login.js` (`POST /api/login/motorista`) | O motorista já tem credencial própria e JWT com `motoristaId` |
| PWA de campo instalado | `frontend/operacao/motorista.html` + `frontend/js/motorista.js` | O coletor de marcações já existe como app; não precisa de app novo |
| GPS contínuo | `motoristas_posicao` + `POST /api/coletas/posicao` | Trilha com lat, lng, velocidade e precisão a cada 10–20s |
| Marcos operacionais por parada | `coletas.hora_partida`, `hora_chegada`, `hora_conclusao` | Eventos reais do dia, com hora, para cruzar com a jornada |
| Migrações idempotentes no boot | `backend/scripts/migrate-schema.js` | Padrão `garantirXxx()` já estabelecido para criar tabela nova |
| SPA React com layout pronto | `ui/src/components/DashboardLayout.jsx`, `Sidebar.jsx` | Telas de gestão entram como páginas novas, sem criar shell |

Duas observações sobre o GPS, porque é o ativo mais valioso e o mais mal
dimensionado hoje:

```41:52:backend/scripts/migrate-schema.js
            `CREATE TABLE motoristas_posicao (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                usuario_id INT NOT NULL,
                lat DECIMAL(10,8) NULL,
                lng DECIMAL(11,8) NULL,
                velocidade DECIMAL(6,2) NULL,
                precisao DECIMAL(7,2) NULL,
                atualizado_em DATETIME NOT NULL,
                UNIQUE KEY uk_mot_pos (empresa_id, usuario_id),
                KEY idx_mot_pos_emp_tempo (empresa_id, atualizado_em)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
```

O `UNIQUE KEY (empresa_id, usuario_id)` combinado com o `ON DUPLICATE KEY UPDATE`
da rota de posição significa que **só a última posição de cada motorista é
guardada** — a trilha histórica é descartada. Para calcular tempo de direção e
usar a localização como prova de jornada, a trilha precisa ser persistida. É
uma tabela nova (`ponto_trilha_gps` ou equivalente particionada por dia), não
uma alteração da atual: o painel em tempo real depende do comportamento de
upsert e não deve ser mexido.

A segunda: a coluna chama-se `usuario_id` mas guarda o id da tabela `motoristas`,
com um `LEFT JOIN` duplo como paliativo (`backend/routes/coletas.js`, linhas
211–225). Qualquer modelagem nova de ponto não deve herdar essa ambiguidade.

## Os cinco bloqueios de cadastro

Nenhum deles é difícil de resolver. Todos precisam ser resolvidos *antes* de o
módulo ter valor legal, porque alimentam campos obrigatórios do AFD.

### 1. Não existe CPF de trabalhador — bloqueio crítico

`motoristas` e `usuarios` não têm coluna de documento:

```31:32:backend/routes/motoristas.js
            'INSERT INTO motoristas (empresa_id, nome, login, senha, email) VALUES (?, ?, ?, ?, ?)',
```

O AFD é **chaveado por CPF do empregado** — é o campo 4 do registro tipo 7
(marcação de ponto via REP-P), 12 posições. O comprovante de registro de ponto
(art. 79, V da Portaria 671) exige nome e CPF. O AEJ identifica o vínculo por
CPF. Sem CPF por trabalhador, não há como gerar nenhum dos arquivos fiscais.

O validador de CPF/CNPJ já existe e é reaproveitável
(`backend/utils/documento-validator.js`, espelhado em
`frontend/js/documento-validator.js`).

### 2. Não existe estabelecimento com CNPJ próprio

A `empresas` tem um único `documento` (a matriz) e a `bases` — que é o conceito
mais próximo de "local de trabalho" — não tem CNPJ:

```
bases: id, empresa_id, nome, endereco, lat, lng, corte_manha, corte_tarde
```

Isso importa porque o **NSR (Número Sequencial de Registro) é por
estabelecimento**, com incremento unitário começando em 1 na primeira operação
do REP naquele estabelecimento (Anexo IX, item 6 da Portaria 671). Uma empresa
com três filiais tem três sequências independentes de NSR e três AFDs. Sem a
entidade estabelecimento com CNPJ de 14 posições, o NSR não tem por onde ser
segmentado.

O art. 79, IV também exige que o comprovante informe o local da prestação de
serviço ou o endereço do estabelecimento de vínculo — relevante justamente para
quem trabalha em atividade externa, que é o caso de uso central aqui.

### 3. Não existe vínculo empregatício, só credencial de acesso

`motoristas` é uma tabela de login, não de vínculo. Falta data de admissão,
cargo, regime de jornada (`tpRegJor` do eSocial: submetido a horário, art. 62 I,
art. 62 II ou teletrabalho), horário contratual, escala e data de desligamento.
O espelho de ponto (art. 84) exige explicitamente identificação do trabalhador
**com data de admissão e cargo**, além do horário e da jornada contratual.

Há também a questão de quem mais bate ponto. O `Sidebar` do painel React tem
item "Escolas" e ícone de ônibus escolar, o que indica transporte escolar entre
os casos de uso — nesse cenário há **monitor(a) acompanhando o motorista**, que
também é empregado com jornada. O cadastro de trabalhador não pode ser
`motoristas` renomeado.

### 4. Não existe cadastro de feriado, escala nem horário contratual

Toda apuração depende de saber qual era a jornada esperada. Hoje o único
conceito temporal é `coletas.periodo` (`manha`/`tarde`) e os cortes de
roteirização da base — nenhum dos dois é jornada de trabalho.

O cadastro de feriados precisa ser nacional, estadual e municipal (Lei
9.093/1995 limita os municipais a 4, incluída a Sexta-Feira da Paixão), porque a
dobra do feriado trabalhado sem folga compensatória (100%, art. 9º da Lei
605/1949 e Súmula 146 do TST) depende disso.

### 5. Não existe trilha de auditoria persistida

A auditoria hoje é só `console.info` via `logAudit()`. O Anexo IX, item 6 da
Portaria 671 exige que a ARP grave, com data, hora e responsável: alteração de
dados do empregador, ajuste de relógio, inclusão/alteração/exclusão de empregado
e eventos sensíveis do REP. Isso não é log de aplicação, é dado fiscal que
alimenta os registros tipo 2, 4, 5 e 6 do AFD.

## Dependências externas (não se resolvem escrevendo código)

Se o destino for REP-P:

| Dependência | Para quê | Quem provê |
|---|---|---|
| Registro de programa de computador no **INPI** | Art. 91 da Portaria 671. O número entra no campo 7 do cabeçalho do AFD e no comprovante de marcação | INPI, processo formal |
| Certificado digital **ICP-Brasil** (A1 ou A3) | Art. 88. Assinatura CAdES do AFD e PAdES do comprovante. Assinatura *qualificada*, nos termos da Lei 14.063/2020 | AC credenciada |
| **Atestado Técnico e Termo de Responsabilidade** | Art. 89. O empregador só pode usar o sistema se possuir o atestado; exige assinatura qualificada de pessoa física (responsável técnico e legal) | Emitido pelo desenvolvedor ao cliente |
| Sincronismo com a **Hora Legal Brasileira** | Anexo IX, item 2. Variação máxima de 30 segundos em relação ao Observatório Nacional | NTP do ON (`ntp.br`) |
| Parecer jurídico trabalhista | Validar regras cuja jurisprudência está em aberto (ver [04](04-conformidade-legal.md)) | Assessoria externa |

O sincronismo tem uma consequência de arquitetura que vale antecipar: **a fonte
de tempo tem de ser o servidor, nunca o relógio do dispositivo**. O celular do
motorista pode estar com hora alterada, de propósito ou não. O desenho precisa
registrar o horário do servidor como oficial e guardar o desvio informado pelo
dispositivo como metadado antifraude.
