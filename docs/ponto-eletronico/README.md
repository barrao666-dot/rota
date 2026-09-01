# Ponto eletrônico no Rota++ — análise de escopo

Análise do que pode ser incluído em um módulo de ponto eletrônico no Rota++,
tomando como referência a oferta de "Controle de Jornada" da Flash
([gestão de pessoas](https://flashapp.com.br/ofertas/gestao-de-pessoas)) e dos
demais fornecedores brasileiros do segmento.

> **Este é um documento de escopo, não de implementação.** Nenhuma linha de
> código de ponto foi escrita. O objetivo é decidir *o que* entra, em que ordem
> e sob quais restrições.

## Índice

| Documento | Conteúdo |
|---|---|
| [01 — Diagnóstico do que já existe](01-diagnostico-base-atual.md) | O que o Rota++ tem hoje que serve de alicerce, e os cinco bloqueios de cadastro |
| [02 — Escopo funcional](02-escopo-funcional.md) | Catálogo de funcionalidades priorizado em P0/P1/P2 |
| [03 — Diferenciais do Rota++](03-diferenciais-jornada-motorista.md) | Tempo de direção, prova por GPS e jornada como restrição de roteirização |
| [04 — Conformidade legal](04-conformidade-legal.md) | Portaria 671/2021, REP-P, AFD, AEJ, CLT, Lei 13.103, eSocial, LGPD |
| [05 — Modelo de dados](05-modelo-de-dados.md) | Tabelas propostas e o porquê de cada decisão de modelagem |
| [06 — Arquitetura e API](06-arquitetura-e-api.md) | Módulos backend, rotas, telas e encaixe nos padrões atuais |
| [07 — Faseamento e riscos](07-faseamento-e-riscos.md) | Ordem de entrega, dependências externas e decisões pendentes |
| [90 — Anexo: pesquisa de mercado](90-anexo-pesquisa-mercado.md) | Levantamento de 9 fornecedores, feature a feature, com fontes |

## Sumário executivo

**Ponto de partida: zero.** O Rota++ não tem nada de ponto eletrônico hoje. A
palavra "ponto" no código significa sempre *parada de rota*. Não existem
tabelas, rotas de API, telas ou regras de jornada. O módulo seria construído
inteiro.

**Mas o alicerce é melhor do que o de um RH genérico.** O Rota++ já tem
autenticação JWT multi-tenant por `empresa_id`, cadastro de motoristas com login
próprio, um PWA de campo que o motorista já usa todo dia, e — o mais valioso —
**rastreamento GPS contínuo** (`motoristas_posicao`, com latitude, longitude,
velocidade e precisão) mais **marcos operacionais por parada**
(`hora_partida`, `hora_chegada`, `hora_conclusao`). Um produto de RH tradicional
captura a localização apenas no instante da batida; o Rota++ tem a trilha inteira
do dia.

**A recomendação é não construir um clone da Flash.** A Flash, a Pontomais e a
Ahgora resolvem bem o trabalhador de escritório e resolvem mal o trabalhador
móvel. O ponto do Rota++ deveria nascer especializado em **jornada de motorista
e de equipe de campo**, com três coisas que nenhum concorrente entrega:

1. **Tempo de direção legal calculado, não declarado.** O CTB (art. 67-C) proíbe
   dirigir mais de 5h30 contínuas e exige 30 min de descanso a cada 6h de
   condução (cargas) ou a cada 4h (passageiros). Isso é apurável a partir do GPS
   que o Rota++ já coleta. Nenhum produto de RH pesquisado calcula isso.
2. **Jornada como restrição de roteirização.** Hoje o roteirizador usa
   `bases.corte_manha`/`corte_tarde` como proxy grosseiro do fim do turno. Com
   ponto, a rota pode ser montada respeitando o saldo real de jornada e avisar
   *antes* da saída que aquela sequência de paradas estoura o limite legal.
3. **Ponto por exceção com evidência.** O art. 74, §4º da CLT permite registrar
   apenas as exceções à jornada regular. Cruzar batida com trilha de GPS e com
   os marcos de entrega transforma isso de risco probatório em prova robusta —
   exatamente o oposto do que a Súmula 338 do TST pune.

**O que bloqueia hoje, e não é código.** Cinco itens de cadastro e três
dependências externas precisam ser resolvidos antes de qualquer linha de
apuração ter valor legal. O mais crítico: **nem `motoristas` nem `usuarios`
guardam CPF**, e o AFD — arquivo que o Auditor-Fiscal exige — é chaveado por CPF
do trabalhador. Sem CPF não existe AFD, e sem AFD o módulo não é um registro
eletrônico de ponto válido, é uma planilha bonita. Ver
[01 — Diagnóstico](01-diagnostico-base-atual.md).

**Sobre a via legal, há uma escolha estratégica a fazer.** Operar como REP-P
(art. 78 da Portaria MTP 671/2021) exige registro do programa no INPI,
certificado ICP-Brasil para assinar os arquivos, ARP imutável e Atestado Técnico
emitido ao cliente. É um custo real de conformidade e de processo, não de
desenvolvimento. A alternativa de curto prazo é entregar primeiro o **controle
de jornada operacional** (tempo de direção, escala, alerta, apuração gerencial)
sem se declarar REP-P, e só depois assumir a conformidade fiscal. As duas rotas
estão descritas em [07 — Faseamento](07-faseamento-e-riscos.md).

## A decisão que precisa ser tomada primeiro

Três posicionamentos possíveis, com implicações muito diferentes:

| Posicionamento | O que entrega | Custo de conformidade |
|---|---|---|
| **A. Telemetria de jornada** | Tempo de direção, alertas do CTB, jornada como restrição de rota, relatório gerencial | Baixo — nenhum requisito da Portaria 671 |
| **B. Ponto eletrônico completo (REP-P)** | Tudo de A, mais marcação com valor legal, AFD, AEJ, espelho, comprovante | Alto — INPI, ICP-Brasil, ARP imutável, atestado técnico |
| **C. Integrador** | Tudo de A, e exporta para um REP-P de terceiro (Pontomais, Ahgora) | Médio — só o layout de exportação |

O restante desta análise assume que o destino é **B**, chegando lá pelo caminho
de **A** — porque as tabelas e o motor de apuração do A já precisam nascer com a
forma que o B exige (marcação imutável, hash encadeado, NSR por
estabelecimento). Refazer isso depois seria retrabalho grande.
