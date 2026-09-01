# 03 — Diferenciais: jornada de motorista e equipe de campo

Este documento é a razão de o módulo valer a pena. Tudo no
[escopo funcional](02-escopo-funcional.md) até aqui é paridade competitiva —
necessário, mas não é motivo para alguém trocar a Pontomais pelo Rota++. O que
está descrito abaixo, sim.

A tese: **os produtos de RH resolvem bem o trabalhador de escritório e resolvem
mal o trabalhador móvel.** Eles capturam a localização no instante da batida e
param aí. O Rota++ tem a trilha do dia inteiro, a rota planejada, o veículo e os
marcos de cada entrega. Isso permite três coisas que nenhum concorrente
pesquisado entrega.

## 1. Tempo de direção legal calculado, não declarado

O motorista profissional empregado tem um segundo conjunto de limites, além da
CLT, que vem do CTB e da Lei 13.103/2015. Eles não são sobre jornada — são sobre
**tempo ao volante**, que é coisa distinta:

| Limite | Regra | Base |
|---|---|---|
| Condução contínua | Máximo **5h30** ininterruptas ao volante | CTB art. 67-C, caput |
| Descanso na condução — cargas | **30 min** dentro de cada **6h** de condução, fracionável | CTB art. 67-C, §1º |
| Descanso na condução — passageiros | **30 min** a cada **4h** de condução, fracionável | CTB art. 67-C, §1º-A |
| Fracionamento do intervalo de condução | Períodos de no mínimo **5 min** (passageiros) | CLT art. 235-E, I |
| Descanso em 24h | Mínimo **11h**, sem fracionamento após a ADI 5322 | CTB art. 67-C, §3º |
| Início de viagem | Só após cumprimento **integral** do descanso das 11h | CTB art. 67-C, §6º |
| Repouso semanal em viagem > 7 dias | 24h por semana + 11h diárias = **35h** | CLT art. 235-D |
| Jornada | 8h, + 2h extras, ou até 4h extras por norma coletiva | CLT art. 235-C |

Duas definições que evitam erro de modelagem. **"Tempo de direção" é apenas o
período em que o condutor está efetivamente ao volante** (CTB art. 67-C, §4º) —
não é a jornada, não é o tempo à disposição, e um dia pode ter 9h de jornada com
4h de direção. E a penalidade não é trabalhista: o CTB art. 230, XXIII trata o
excesso como infração média com **retenção do veículo para cumprimento do
descanso**, agravada para grave na reincidência em 12 meses. Ou seja, estourar o
limite não custa só passivo trabalhista, custa a operação parada na beira da
estrada.

O Rota++ já coleta o insumo: `motoristas_posicao` recebe latitude, longitude,
**velocidade** e precisão a cada 10 a 20 segundos durante a viagem ativa. Com a
trilha persistida (hoje ela é sobrescrita — ver
[01](01-diagnostico-base-atual.md)), tempo de direção é uma agregação: sequências
de amostras com velocidade acima de um limiar, separadas por paradas acima de um
mínimo. Nenhum fornecedor de RH pesquisado calcula isso, porque nenhum tem o
dado.

O uso mais valioso é preventivo, não retroativo. Ao invés de descobrir na
apuração do mês que o motorista dirigiu 6h seguidas, o sistema avisa em **4h45**
que faltam 45 minutos para o limite e sugere a próxima parada da rota como local
de descanso. O painel do gestor mostra, em tempo real, quem está próximo do
limite. Isso é diferente em natureza de tudo o que a Flash vende.

**Ressalva jurídica importante.** Telemetria e GPS registram o *veículo*, não a
*pessoa*. Eles são meios admitidos e frequentemente decisivos como prova, mas
comprovam tempo de direção e paradas — finalidade do CTB — e não substituem o
registro de jornada (início, fim, intervalos, tempo de espera, carga e
descarga). O art. 235-C, §14 da CLT e o art. 67-E, §2º do CTB admitem
expressamente "rastreadores ou sistemas e meios eletrônicos instalados nos
veículos, normatizados pelo Contran". A arquitetura segura é a combinação:
**marcação de ponto (REP-P) para a jornada, telemetria para o tempo de direção**,
com os dois cruzados. Nunca substituir um pelo outro.

Há um risco a considerar de frente: a jurisprudência majoritária entende que
quando existe rastreamento e possibilidade de controle, **fica afastado** o
enquadramento no art. 62, I da CLT (atividade externa incompatível com fixação
de horário). Traduzindo: um cliente que hoje não controla jornada de motorista
alegando art. 62, I e que passe a usar o Rota++ com telemetria de jornada perde
esse argumento. Isso precisa ser comunicado com clareza, porque é um efeito
colateral real da adoção.

## 2. Prova de jornada por convergência de três fontes

Este é o ponto onde a arquitetura do Rota++ vira ativo probatório.

A Súmula 338 do TST inverte o ônus da prova: a não apresentação injustificada
dos controles gera presunção relativa de veracidade da jornada alegada na
inicial. E a mesma súmula pune o "controle britânico" — horários uniformes e
invariáveis também geram presunção contra o empregador. Um ponto eletrônico onde
todo dia registra 08:00 e 18:00 é pior que não ter ponto.

O Rota++ pode oferecer três fontes independentes que se corroboram:

| Fonte | O que prova | Já existe? |
|---|---|---|
| Marcação de ponto (REP-P) | A declaração do trabalhador, com hash encadeado e NSR | Não — a construir |
| Trilha de GPS | Onde ele esteve, minuto a minuto, com velocidade | Sim, mas sobrescrita |
| Marcos de entrega | `hora_partida`, `hora_chegada`, `hora_conclusao` por parada | Sim |

Os marcos de entrega são especialmente fortes porque **não foram criados para
provar jornada** — são registros operacionais gerados pelo motorista no curso
normal do trabalho, no fluxo `partir → cheguei → concluir`
(`backend/routes/coletas.js`, linhas 253–267). Um registro operacional
contemporâneo, feito para outra finalidade, tem peso probatório maior do que uma
declaração feita para se defender.

O produto disso é uma **divergência automática**: se o motorista está com
`status = 'em_transito'` às 19h30 mas registrou saída às 18h, o sistema abre uma
pendência de tratamento com a evidência anexada, para o gestor decidir. Isso é o
ponto por exceção do art. 74, §4º da CLT feito direito — não "presumimos que
cumpriu o horário", e sim "temos três fontes que dizem o que aconteceu e
sinalizamos quando elas discordam".

## 3. Jornada como restrição de roteirização

Hoje o roteirizador usa `bases.corte_manha` e `bases.corte_tarde` (padrão 09:00
e 14:00) como proxy do fim do turno, e paradas que não cabem migram para a tarde
ou para o dia seguinte. É um limite fixo por base, igual para todo mundo, que
não sabe nada sobre a jornada real de cada motorista.

Com o módulo de ponto, a roteirização passa a ter dados reais:

- **Saldo de jornada do dia**: quem entrou às 6h já não pode receber uma rota que
  termine às 17h sem gerar hora extra. O otimizador pode saber disso.
- **Interjornada**: quem encerrou às 23h só pode iniciar às 10h do dia seguinte
  (11h consecutivas, art. 66 da CLT e CTB art. 67-C, §3º). Alocar esse motorista
  para a rota da manhã é uma irregularidade que o sistema pode impedir **no
  planejamento**, quando ainda é barato.
- **Tempo de direção projetado**: o ORS já devolve tempo de viagem por trecho. A
  soma do tempo de direção projetado da rota pode ser confrontada com o limite de
  5h30 contínuas *antes* de a rota ser despachada.
- **Repouso semanal**: quem está a caminho de estourar as 35h em viagem longa não
  entra na escala.

Isso fecha um ciclo que hoje não existe: a jornada deixa de ser um relatório do
mês passado e passa a ser uma restrição do planejamento de amanhã. É também o
argumento comercial mais forte, porque converte uma obrigação de compliance
(que o cliente vê como custo) em redução de hora extra (que ele vê como
economia) — a própria Flash usa "40% de horas extras eliminadas" como número de
capa.

## 4. Casos de uso específicos que o mercado ignora

**Tempo de espera.** É o instituto mais litigioso da jornada do motorista: horas
aguardando carga ou descarga no embarcador ou destinatário, e tempo em barreira
fiscal (CLT art. 235-C, §8º). O tratamento mudou por decisão do STF: até
11/07/2023 não integrava a jornada e era indenizado a 30% do salário-hora; a
partir de **12/07/2023**, por força da modulação da ADI 5322, **integra a
jornada** e gera hora extra no que exceder. O Rota++ tem o dado natural para
distinguir espera de direção e de descanso — GPS parado dentro da geocerca do
cliente, com a parada em `em_atendimento`. Nenhum sistema de RH sabe fazer essa
distinção, porque não sabe onde fica o cliente.

**Jornada partida do transporte escolar.** O item "Escolas" no menu do painel
indica esse caso de uso. É uma jornada com dois blocos (manhã e tarde) separados
por um intervalo longo, com motorista e monitor. Apurar isso corretamente exige
suportar múltiplos pares de entrada/saída no horário contratual e distinguir
intervalo de intervalo — o intervalo intrajornada legal (art. 71) do tempo entre
blocos. É uma dor conhecida de quem opera transporte escolar e mal atendida por
produto genérico.

**Transporte coletivo urbano de passageiros.** O art. 71, §5º da CLT permite
reduzir e fracionar o intervalo de motoristas, cobradores e fiscalização de
campo, por norma coletiva, com intervalos menores ao final de cada viagem. Foi
declarado constitucional na ADI 5322, com o piso de 30 minutos do art. 611-A,
III. Suportar isso exige um motor de intervalos bem mais flexível do que o
padrão "1h corrida no meio do dia".

## Contraponto honesto

Nada disso substitui a base do [escopo funcional](02-escopo-funcional.md). Um
cliente não compra um ponto eletrônico que calcula tempo de direção
brilhantemente mas não emite AFD e não fecha competência. Os diferenciais deste
documento são o motivo de escolher o Rota++ *entre* os produtos que fazem o
básico — não um atalho para pular o básico.

E há um limite de mercado a reconhecer: o cliente do Rota++ tem motoristas, mas
também tem administrativo, e o RH dele não vai querer dois sistemas de ponto. Ou
o módulo atende a empresa inteira, ou ele perde para o fornecedor que atende.
Isso empurra o escopo P0 para cima, não para baixo.
