# 02 — Escopo funcional

Catálogo do que pode ser incluído, priorizado. A leitura das prioridades:

- **P0** — sem isso o módulo não é um ponto eletrônico válido nem utilizável.
- **P1** — esperado por quem compara o Rota++ com Pontomais, Sólides ou Ahgora.
- **P2** — diferenciação, enterprise, ou dependente de decisão comercial.

O anexo [90](90-anexo-pesquisa-mercado.md) traz o levantamento fornecedor a
fornecedor que embasa a coluna "mercado".

## 1. Cadastro e configuração

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 1.1 | Cadastro de colaborador com CPF, admissão, cargo, `tpRegJor` | P0 | Bloqueio descrito em [01](01-diagnostico-base-atual.md) |
| 1.2 | Cadastro de estabelecimento com CNPJ próprio | P0 | Necessário para segmentar o NSR |
| 1.3 | Horário contratual (pares entrada/saída, duração do intervalo) | P0 | Alimenta `codHorContratual` do AEJ e `horContratual` do eSocial |
| 1.4 | Escalas: 5x2, 6x1, 12x36, 4x2, turno rotativo, jornada partida | P0 | Jornada partida é o caso do transporte escolar |
| 1.5 | Calendário de feriados nacional, estadual e municipal | P0 | Base da dobra de feriado |
| 1.6 | Parâmetros de apuração por empresa, com vigência | P0 | Tolerância, arredondamento, percentuais, regras em aberto |
| 1.7 | Escala flexível, teletrabalho, sobreaviso, intermitente | P2 | Só se houver demanda; não é o perfil da base atual |
| 1.8 | Vínculo colaborador ↔ veículo e ↔ base | P1 | Habilita o cruzamento com telemetria |

Sobre 1.6: os parâmetros precisam ser versionados por vigência, não
sobrescritos. Há pelo menos dois cortes temporais que mudam o cálculo do mesmo
fato — a reforma trabalhista (11/11/2017, intervalo intrajornada) e a modulação
da ADI 5322 (12/07/2023, tempo de espera do motorista). Recalcular um período
antigo com a regra de hoje produz número errado.

## 2. Coleta de marcações

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 2.1 | Marcação pelo PWA do motorista | P0 | O app já existe e já é usado; é só uma tela nova |
| 2.2 | Marcação pela web (colaborador administrativo) | P0 | — |
| 2.3 | Modo offline com fila e reenvio | P0 | Exigência do Anexo IX, itens 4 e 5 |
| 2.4 | Horário da marcação separado do horário da gravação | P0 | Campos 3 e 5 do registro tipo 7 do AFD |
| 2.5 | Comprovante de registro de ponto após cada marcação | P0 | Art. 79 e 80; PDF assinado, sem solicitação prévia |
| 2.6 | Extração dos comprovantes das últimas 48h pelo colaborador | P0 | Art. 80, parágrafo único, III |
| 2.7 | Tablet/totem em modo quiosque na base | P1 | Compartilhado; exige identificação individual |
| 2.8 | Biometria facial | P1 | Add-on cobrado à parte por vários concorrentes |
| 2.9 | Prova de vida (liveness) | P2 | Lacuna real do mercado — ver abaixo |
| 2.10 | Marcação por WhatsApp | P2 | Existe na Pontomais e Sesame, como extensão paga |

Duas coisas merecem destaque.

**2.4 não é detalhe de implementação, é requisito legal.** O AFD tem campos
distintos para a hora da marcação e a hora da gravação, e uma flag de
online/offline. A pesquisa de mercado registra que a própria Pontomais documenta
a armadilha: se a marcação só sincroniza quando a conexão volta e o sistema
gravar o horário da sincronização, o registro está errado. O horário oficial é
o da marcação.

**2.9 é uma oportunidade.** Nenhum dos nove fornecedores pesquisados documenta
prova de vida, e a Flash declara na própria central de ajuda que o Flash Tablet
não tem liveness e que "tentativas de registro utilizando fotos estáticas ou
vídeos podem ser aceitas". Reconhecimento facial sem liveness é teatro de
segurança.

## 3. Antifraude e evidência

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 3.1 | Captura de GPS na marcação, com precisão em metros | P0 | — |
| 3.2 | Geocerca por base/estabelecimento, **sinalizando** e nunca bloqueando | P0 | Ver a regra abaixo |
| 3.3 | Metadados por marcação: IP, identificador do dispositivo, SO, timezone | P0 | Alimenta o campo 6 do registro tipo 7 e a análise de risco |
| 3.4 | Desvio entre relógio do dispositivo e do servidor | P1 | Detecta hora alterada |
| 3.5 | Status de confiança da marcação, em máquina de estados | P1 | Modelo da Oitchau: não é aceita/rejeitada, é classificada |
| 3.6 | Detecção de mock location / fake GPS | P2 | Nenhum dos nove fornecedores documenta |
| 3.7 | Selfie na marcação | P1 | — |
| 3.8 | Regras antifraude configuráveis **por local de trabalho** | P1 | Também da Oitchau; global não serve para operação móvel |
| 3.9 | Correlação da marcação com a trilha de GPS do dia | P2 | Diferencial do Rota++ — ver [03](03-diferenciais-jornada-motorista.md) |

**A regra que não pode ser violada:** o art. 74 da Portaria MTP 671/2021 veda
"restrições de horário à marcação", "exigência pelo sistema de autorização
prévia para marcação de sobrejornada" e "qualquer dispositivo que permita a
alteração dos dados registrados pelo empregado". Geocerca, portanto, **jamais
rejeita uma marcação** — ela grava a marcação e anexa a informação de que
ocorreu fora do perímetro. É um erro de projeto comum e caro: um sistema que
impede o trabalhador de bater ponto fora da cerca é um sistema irregular, e o
art. 98 prevê apreensão de equipamentos e cópia de programas quando se comprova
a existência de bloqueios que permitam adulterar o registro.

## 4. Apuração e espelho de ponto

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 4.1 | Horas trabalhadas, atrasos, faltas, saídas antecipadas | P0 | — |
| 4.2 | Tolerância de 5 min por marcação e 10 min por dia | P0 | Art. 58, §1º da CLT |
| 4.3 | Horas extras segregadas por percentual (50%, 100%) | P0 | — |
| 4.4 | Adicional noturno 20% com hora reduzida de 52min30s | P0 | Art. 73; fator 60/52,5 |
| 4.5 | Intervalo intrajornada: verificação e minutos suprimidos | P0 | Art. 71, §4º — só o período suprimido, +50%, indenizatório |
| 4.6 | Interjornada de 11h e repouso semanal | P0 | Art. 66 e 67; tratamento parametrizável |
| 4.7 | DSR: perda por falta/atraso e reflexo dos adicionais habituais | P0 | Art. 6º e 7º da Lei 605/1949 |
| 4.8 | Feriado trabalhado: dobra quando não compensado | P0 | Exceto 12x36 (art. 59-A, parágrafo único) |
| 4.9 | Espelho de ponto conforme art. 84 | P0 | Marcações originais **e** tratadas, lado a lado |
| 4.10 | Banco de horas com ciclo, saldo e expiração | P1 | Três prazos: mesmo mês, 6 meses, 12 meses |
| 4.11 | Fechamento de competência com trava de período | P1 | — |
| 4.12 | Recálculo de período fechado com trilha de auditoria | P1 | — |
| 4.13 | Assinatura eletrônica do espelho pelo colaborador | P1 | — |
| 4.14 | Pré-assinalação do intervalo | P1 | Permitida pelo art. 74, §2º da CLT; `fonteMarc = "P"` |
| 4.15 | Ponto por exceção | P1 | Art. 74, §4º; `fonteMarc = "X"` |

Sobre 4.9, o desenho central do módulo: **a marcação original é imutável e os
ajustes vivem em outra camada.** O art. 82, parágrafo único, delimita o que o
tratamento pode fazer — "acrescentar informações para complementar eventuais
omissões no registro de ponto, inclusive ausências e movimentações do banco de
horas, ou indicar marcações indevidas". Corrigir uma batida nunca é editar a
batida; é registrar uma marcação nova, ou marcar a original como
desconsiderada com motivo. O AEJ tem campo próprio para isso
(`tpMarc = "D"` e `motivo` obrigatório).

## 5. Solicitações e aprovações

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 5.1 | Ajuste/inclusão de marcação com justificativa e anexo | P0 | Fluxo mais usado do módulo, em qualquer fornecedor |
| 5.2 | Abono de falta ou atraso com atestado anexado | P0 | — |
| 5.3 | Aprovação pelo gestor, com histórico de quem e quando | P0 | — |
| 5.4 | Férias, folga, day off | P1 | — |
| 5.5 | Afastamentos (doença, acidente, licenças) | P1 | Insumo do S-2230 do eSocial |
| 5.6 | Hora extra pré-autorizada | P1 | Cuidado: não pode ser pré-requisito da marcação |
| 5.7 | Aprovação em múltiplos níveis | P2 | — |
| 5.8 | Delegação de aprovador | P2 | Lacuna: nenhum dos nove fornecedores tem |

Sobre 5.6, a mesma armadilha do art. 74, III da Portaria: o sistema pode ter um
fluxo de autorização prévia de hora extra para fins de gestão, mas **não pode
condicionar a marcação a essa autorização**. O trabalhador bate; a autorização é
tratada depois, na apuração.

## 6. Tempo real, alertas e relatórios

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 6.1 | Painel de quem bateu e quem não bateu, hoje | P1 | Encaixa na Torre de Controle existente |
| 6.2 | Pendências de tratamento por colaborador e por período | P1 | — |
| 6.3 | Saldo de banco de horas em tempo real | P1 | — |
| 6.4 | Alerta de risco de hora extra antes de estourar | P1 | — |
| 6.5 | Alerta de intervalo não cumprido | P1 | — |
| 6.6 | Alerta de tempo de direção próximo do limite legal | P0* | Diferencial — ver [03](03-diferenciais-jornada-motorista.md) |
| 6.7 | Indicadores de absenteísmo e aderência de ponto | P1 | — |
| 6.8 | Notificação push, e-mail | P1 | Push pelo PWA já existente |
| 6.9 | Notificação por SMS ou WhatsApp | P2 | — |
| 6.10 | Relatórios: espelho, extrato de banco, absenteísmo, HE por centro de custo | P1 | Catálogo consolidado no anexo 90, seção 8.2 |

`P0*`: é P0 na hipótese de posicionamento "A" (telemetria de jornada) descrita no
[README](README.md), e P1 se o módulo nascer como ponto eletrônico genérico.

## 7. Conformidade e integrações

| # | Funcionalidade | Prio | Nota |
|---|---|---|---|
| 7.1 | ARP: armazenamento imutável, com redundância | P0 | Anexo IX, itens 6 e 7 |
| 7.2 | NSR sequencial por estabelecimento | P0 | — |
| 7.3 | Hash SHA-256 encadeado por marcação | P0 | Inclui o hash do registro anterior |
| 7.4 | Geração de AFD, com fracionamento por período | P0 | Anexo IX, itens 11 e 12 |
| 7.5 | Assinatura CAdES destacada (`.p7s`) do AFD | P0 | Certificado ICP-Brasil |
| 7.6 | Geração de AEJ | P0 | Texto delimitado por pipe, não XML |
| 7.7 | Sincronismo NTP com a Hora Legal Brasileira | P0 | Variação máxima de 30s |
| 7.8 | Retenção mínima de 5 anos, sem apagar nem alterar | P0 | Prescrição trabalhista |
| 7.9 | Exportação para folha de pagamento | P1 | Layout configurável; nenhum concorrente transmite eSocial direto |
| 7.10 | Dados estruturados para S-1200, S-2230 e `horContratual` | P1 | O ponto alimenta a folha, que transmite |
| 7.11 | Consentimento e base legal para biometria (LGPD) | P0 se 2.8 | Dado sensível; alternativa não biométrica obrigatória |
| 7.12 | API pública e webhooks | P2 | — |

## O que deliberadamente não entra

Vale registrar o que a Flash vende junto e que **não** deveria ser copiado, para
o escopo não inflar: admissão e desligamento digital, gestão eletrônica de
documentos com OCR, treinamentos, avaliação de performance, pesquisas de
engajamento, organograma e people analytics. São sete módulos de RH que não têm
relação com jornada, não aproveitam nada do que o Rota++ já tem, e competiriam
com fornecedores muito estabelecidos. O ponto eletrônico, ao contrário, nasce
com vantagem competitiva real aqui.
