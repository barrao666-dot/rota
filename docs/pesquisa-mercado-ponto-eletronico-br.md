# Pesquisa de mercado — Controle de Jornada / Ponto Eletrônico no Brasil

**Objetivo:** levantar, de forma exaustiva e verificável, o conjunto de funcionalidades concretas que existem em produtos maduros de ponto eletrônico no Brasil, para servir de base à especificação de um módulo novo.

**Fornecedores analisados:** Flash (flashapp.com.br), Pontomais/VR Gente RH Digital, Sólides Ponto (ex-Tangerino), Ahgora (hoje TOTVS RH Ponto Eletrônico – Linha Ahgora), Convenia, Gupy, Oitchau, Sesame HR, TOTVS (linhas RM/Chronus, Protheus, Datasul), Senior (HCM / Ronda / Marcação de Ponto).

**Data da pesquisa:** setembro/2026. Todas as afirmações abaixo estão ancoradas em páginas públicas de produto, centrais de ajuda, documentação técnica, manuais e legislação — as URLs estão citadas ao longo do texto e consolidadas na seção 12.

**Convenções de confiabilidade usadas neste documento:**

| Marca | Significado |
|---|---|
| (fonte oficial) | Confirmado em site, central de ajuda, documentação de API ou manual do próprio fornecedor |
| (fonte secundária) | Confirmado apenas em blog de terceiro, comparativo, review ou material de revenda — tratar com cautela |
| **não confirmado** | Não foi possível confirmar em nenhuma fonte pública durante esta pesquisa |

---

## 0. Sumário executivo — o que define um produto "maduro" nesse mercado

Depois de comparar os dez fornecedores, o conjunto mínimo que todos os produtos consolidados entregam é:

1. **Multicanal de coleta** com pelo menos app móvel, web e um dispositivo compartilhado (tablet/totem/REP), todos operando **offline com sincronização posterior**.
2. **Reconhecimento facial** como método de identificação padrão, combinado com **geocerca (GPS)** e, nos produtos mais completos, Wi-Fi SSID, faixa de IP e beacon Bluetooth.
3. **Motor de regras de jornada parametrizável** por grupo/cargo/departamento/filial, cobrindo 12x36, 6x1, 5x2, 4x2, turnos rotativos, jornada flexível e intermitente.
4. **Apuração automática** de horas trabalhadas, atrasos, faltas, adicional noturno com hora reduzida, horas extras em faixas percentuais e banco de horas com ciclo e expiração.
5. **Espelho de ponto eletrônico com assinatura/aceite do colaborador**, fechamento de competência e **trava do período apurado**.
6. **Fluxo de solicitação e aprovação** para ajuste de marcação, abono, atestado, férias, folga e troca de escala, com anexo de documento.
7. **Conformidade com a Portaria MTP 671/2021** na modalidade REP-P (registro no INPI, ARP, NSR, hash SHA-256, AFD assinado em CAdES/.p7s, AEJ, comprovante de marcação).
8. **Exportação para folha de pagamento** via layouts pré-configurados por sistema de folha, além de API/webhooks.

O que **diferencia** os produtos de topo (Ahgora/TOTVS, Oitchau, Senior) dos de entrada: profundidade do motor de regras (conversão entre tipos de hora, limites por faixa, regras sindicais por fase), granularidade de antifraude (validação de aparelho, operadora, beacon, IP), auditoria (log de quem alterou escala/jornada, relatório de acesso) e capacidade de operar multiempresa/multiplanta com escopo de permissão por localização.

---

## 1. Quem é quem — posicionamento e escopo real de cada fornecedor

| Fornecedor | Produto de ponto | Escopo | Observação crítica |
|---|---|---|---|
| **Flash** | "Controle de Jornada" (CDJ) + "FolhaFlash" (ex-FolhaCerta, adquirida) | Suíte de RH/DP + benefícios + despesas | Convivem **duas plataformas distintas** com telas e regras diferentes; a central de ajuda documenta caminhos separados para CDJ e FolhaFlash ([faq.flashapp.com.br](https://faq.flashapp.com.br/kb/guide/pt-BR/como-lancar-um-evento-ou-atestado-na-flash-mMQuIesmpt/Steps/4197774)) |
| **Pontomais** | Pontomais / VR Gente "RH Digital" | Especialista em ponto + escalas + férias/folgas + GED | Adquirida pela VR; central de ajuda migrada para `materiais.vr.com.br` |
| **Sólides Ponto** | ex-Tangerino, hoje módulo do SuperApp Sólides | Ponto + DP + folha própria | Recursos avançados (facial) ficam no add-on "PRO" ([ajuda.solides.com.br](https://ajuda.solides.com.br/hc/pt-br/articles/25357880793357)) |
| **Ahgora** | PontoWEB + Multi + Batida Online + REPs Ah10/Ah30 | Especialista em jornada, escalas complexas, multiplanta | Hoje comercializada como **TOTVS RH Ponto Eletrônico – Linha Ahgora** ([totvs.com/rh/ponto-eletronico](https://www.totvs.com/rh/ponto-eletronico/)) |
| **Convenia** | **Não tem registro de ponto nativo** | DP/admissão/férias/benefícios | Oferece apenas *espelho de ponto* (importa ACJEF/AFDT, distribui e guarda) e integra com Pontomais e TiqueTaque ([convenia.com.br/departamento-pessoal](https://www.convenia.com.br/departamento-pessoal)) |
| **Gupy** | **Não tem produto de ponto** | ATS, admissão, desenvolvimento, engajamento | Publica conteúdo educativo sobre REP-P e ponto digital, mas o ecossistema é recrutamento/gestão de talentos ([gupy.io/blog/repp](https://www.gupy.io/blog/repp)) |
| **Oitchau** | Oitchau + Oitchau Kiosk + Timesheets | Ponto antifraude, escalas, ausências, equipes externas | Antifraude é o eixo do posicionamento; forte em integrações |
| **Sesame HR** | Sesame (controle de ponto + Turnos com IA) | Suíte de RH europeia com operação no Brasil | Diferencial: WhatsApp, Sesame Wall (PIN/QR/NFC/FaceID), planejamento de escala com IA e custo |
| **TOTVS** | 4 linhas: Ahgora, RM (Chronus), Protheus, Datasul | ERP corporativo | Cada linha tem funcionalidades distintas; a linha Ahgora é a "nuvem/facial" |
| **Senior** | Controle de Ponto e Refeitório (Ronda), Gestão do Ponto, Marcação de Ponto \| HCM (REP-P), Ponto Múltiplo | HCM corporativo, indústria | Motor de apuração programável via editor de regras; até 9999 escalas |

> **Nota importante para o escopo do pedido:** Convenia e Gupy foram incluídos na lista de "concorrentes diretos", mas nenhum dos dois opera um registrador de ponto próprio. Convenia é um consumidor/arquivador de dados de ponto de terceiros; Gupy não atua na categoria. Ambos são relevantes como *integradores*, não como benchmark de funcionalidade de jornada.

---

## 2. Coleta e registro de ponto

### 2.1 Canais de marcação

| Canal | Flash | Pontomais | Sólides | Ahgora/TOTVS | Oitchau | Sesame | Senior | TOTVS RM/Protheus/Datasul |
|---|---|---|---|---|---|---|---|---|
| App iOS/Android (individual) | ✅ | ✅ | ✅ | ✅ (Multi) | ✅ | ✅ | ✅ (Waapi / Marcação de Ponto) | ✅ |
| Web / navegador | ✅ | ✅ | ✅ | ✅ (Batida Online) | ✅ | ✅ | ✅ (Plataforma Senior X) | ✅ |
| Tablet / kiosk compartilhado | ✅ (Flash Tablet) | ✅ (Pontomais Happy) | ✅ (Sólides Totem Ponto) | ✅ (Multi em tablet) | ✅ (Oitchau Kiosk) | ✅ (Sesame Wall) | ✅ (Ponto Múltiplo) | ✅ |
| Totem/relógio físico (REP-C) | **não confirmado** (Flash é software) | ✅ (integra REPs homologados) | ✅ (totem/biometria) | ✅ (Ah10, Ah30, Ah30 Lite) | ✅ (via integração: Dimep, Control iD, Henry, Madis, Velti, TOP Data…) | ✅ (relógios com biometria) | ✅ (Ronda, coletores) | ✅ |
| Desktop app (Windows/macOS) | **não confirmado** | **não confirmado** | **não confirmado** | ✅ (Windows + leitor Ah01) | ✅ (Windows/macOS) | **não confirmado** | ✅ (client com biometria) | — |
| Extensão de navegador | **não confirmado** | **não confirmado** | **não confirmado** | ✅ (plugin Chrome) | ✅ (Chrome/Edge) | **não confirmado** | **não confirmado** | — |
| WhatsApp | **não confirmado** | ✅ (extensão paga) | ⚠️ envia a folha de ponto por WhatsApp, **não** registra ponto | **não confirmado** | **não confirmado** | ✅ (add-on) | **não confirmado** | — |
| SMS | **não confirmado** em nenhum fornecedor (SMS aparece só como canal de *notificação*, ex.: Flash) |
| Smartwatch | — | — | — | — | — | ✅ | — | — |
| Offline com sincronização | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Detalhes relevantes por fornecedor:**

- **Flash Tablet**: suporta reconhecimento facial, digitação de CPF e CPF + selfie; opera offline sincronizando ao reconectar; tem navegação por comando de voz para acessibilidade. Limitações declaradas pela própria Flash: **não registra coordenadas GPS**, **não grava o identificador do tablet usado** em relatórios e o reconhecimento facial **não tem detecção de vida (liveness)** — "tentativas de registro utilizando fotos estáticas ou vídeos podem ser [aceitas]" ([faq.flashapp.com.br — Flash Tablet](https://faq.flashapp.com.br/kb/guide/pt-BR/o-que-e-e-como-funciona-o-aplicativo-flash-tablet-xNNKHhRx43/Steps/4946885)). A configuração do tablet exige acionamento do suporte Flash.
- **Pontomais Happy**: app colaborativo para tablet; um único login de administrador libera registro sequencial por QR Code (online/offline) ou reconhecimento facial; cada colaborador recebe um QR Code único impresso, que pode ser plastificado ou anexado ao crachá; ao ler o QR o sistema **tira uma foto do colaborador em seguida**; entra em standby para economizar processamento; novos colaboradores e registros offline sincronizam em background ([Google Play — Pontomais Happy](https://play.google.com/store/apps/details?id=com.pontomais.pontomaishappy)).
- **Pontomais por WhatsApp**: extensão contratada à parte no menu "Meus Serviços"; exige que o colaborador esteja com "Tipo de registro" = *Registro simples*; habilitação individual por colaborador; o colaborador envia mensagem para um número da plataforma e compartilha a localização. **Ponto de atenção técnico documentado pelo próprio fornecedor:** se a mensagem só sincronizar quando a conexão voltar, **o sistema considera o horário da sincronização**, não o horário de digitação ([Central de ajuda Pontomais — Ponto por WhatsApp](https://materiais.vr.com.br/central-de-ajuda/extensao-ponto-por-whatsapp-o-que-e-como-funciona-e-como-bater-ponto-por-whatsapp/)).
- **Sólides**: três formas — app mobile, plataforma web e app "Sólides Totem Ponto". Login por **Código do Empregador + PIN**; no app e na web exige **selfie**; no totem o colaborador aponta o QR Code para a câmera ou usa PIN, e o sistema tira a foto automaticamente ([ajuda.solides.com.br — Como bater ponto](https://ajuda.solides.com.br/hc/pt-br/articles/25327971456525-Como-bater-ponto-na-S%C3%B3lides)).
- **Ahgora**: ecossistema segmentado — `Ahgora Multi` (app facial em celular/tablet, GNSS GPS+GLONASS, offline), `Ahgora Batida Online` (navegador, app Windows com leitor biométrico Ah01, plugin do Chrome), `Ahgora Mobile` (portal do colaborador; em descontinuação), REPs IoT `Ah10`/`Ah30`/`Ah30 Lite`. Suporta ainda **importação de AFD de equipamentos de outros fabricantes** homologados ([Manual PontoWEB](https://pdfcoffee.com/manual-de-configuracao-e-uso-pontoweb-pdf-free.html)).
- **Oitchau Kiosk**: facial **1:N** com reconhecimento declarado em 0,3 s, funciona offline com biometria cadastrada localmente, e tem modo **touchless por comando de voz** ([oitchau.com.br/features/facial-recognition](https://www.oitchau.com.br/features/facial-recognition/)).
- **Sesame Wall**: terminal compartilhado com **PIN, QR, NFC ou Face ID** ([sesamehr.com.br — software de controle de ponto](https://www.sesamehr.com.br/blog/controle-de-ponto/software-de-controle-de-ponto/)).
- **Senior Ponto Múltiplo**: modo múltiplo com **NFC, QR Code, reconhecimento facial e usuário/senha**, configuráveis como padrão por dispositivo; timeout de inatividade configurável (1/3/5/10 min ou nunca) ([documentacao.senior.com.br — Configurações Gerais](https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/hcm/marcacao-de-ponto/senior-x-platform/configuracoes-gerais-tela-de-configuracoes/)).

### 2.2 Métodos de autenticação/identificação

| Método | Fornecedores confirmados |
|---|---|
| Reconhecimento facial (selfie validada) | Flash (app e tablet), Pontomais, Sólides (PRO), Ahgora (Multi, Face ID Selfie), Oitchau (Kiosk 1:N), Sesame, Senior (modo múltiplo), TOTVS Linha Ahgora |
| Selfie/foto como evidência (sem match automático) | Flash (selfie obrigatória configurável), Pontomais (foto após QR Code), Senior (captura de foto no registro) |
| Biometria de impressão digital | Ahgora (leitor Ah01, REPs), Senior (client desktop com leitura biométrica), Sesame (via relógios), Oitchau (via relógios integrados) |
| PIN / senha | Sólides (Código do Empregador + PIN), Ahgora (senha de teclado independente da senha do portal), Sesame (Wall), Senior (usuário e senha) |
| QR Code | Pontomais (Happy), Sólides (totem), Sesame (QR em pontos físicos), Senior (modo múltiplo), Ahgora (código de barras de crachá) |
| Crachá / cartão de proximidade (Mifare/NFC) | Ahgora (Mifare + código de barras), Sesame (NFC no Wall), Senior (NFC) |
| Digitação de CPF | Flash Tablet |
| Certificado digital ICP-Brasil | Citado pela Flash como método admitido na Portaria 671 ([flashapp.com.br/blog/lei-do-ponto-eletronico](https://flashapp.com.br/blog/lei-do-ponto-eletronico)) — **uso prático como autenticação de marcação não confirmado** em nenhum produto |
| Comando de voz | Oitchau (touchless), Flash Tablet (acessibilidade) |

**Detalhe operacional útil (Ahgora):** um mesmo colaborador pode ter **vários métodos habilitados simultaneamente** (digital, Mifare, senha, código de barras, facial). O equipamento pode ser configurado individualmente para **ignorar** métodos (ex.: desabilitar Mifare e trabalhar só com biometria + senha). A senha de ponto por teclado pode ser **independente** da senha do Portal do Colaborador. A foto de cadastro facial do Multi vai para uma fila de **aprovação/reprovação pelo gestor** (com opção de pré-aprovação automática).

**Detalhe operacional útil (Sólides):** o reconhecimento facial PRO tem **dois modos** — *online* (validação no momento do registro) e *offline* (foto capturada sem internet e reconhecimento posterior; se falhar, o ícone de câmera fica vermelho na tela de Apropriação de Horas). Há configuração para **marcar o ponto como pendente de aprovação manual quando o facial falhar** ([ajuda.solides.com.br](https://ajuda.solides.com.br/hc/pt-br/articles/25357880793357)).

### 2.3 Regras antifraude e travas de localização

| Trava | Flash | Pontomais | Sólides | Ahgora | Oitchau | Sesame | Senior |
|---|---|---|---|---|---|---|---|
| GPS / geocerca com raio em metros | ✅ | ✅ ("cerca virtual") | ✅ | ✅ (Multi, GNSS) | ✅ | ✅ (raio de validade) | ✅ (cerca virtual) |
| Wi-Fi (SSID/rede autorizada) | ✅ | **não confirmado** | **não confirmado** | **não confirmado** | ✅ | **não confirmado** | **não confirmado** |
| Faixa de IP / IP externo | ✅ (trava por IP no web e no local de trabalho) | **não confirmado** | **não confirmado** | ⚠️ registra o IP da batida como metadado, mas trava por IP **não confirmada** | ✅ | **não confirmado** | **não confirmado** |
| Beacon Bluetooth (iBeacon) | ✅ (cercas Wi-Fi, GPS e Bluetooth/Beacons, conforme descrição oficial do app Folha Flash) | **não confirmado** | **não confirmado** | **não confirmado** | ✅ | **não confirmado** | **não confirmado** |
| Vínculo com aparelho/chip do colaborador | **não confirmado** | **não confirmado** | **não confirmado** | ⚠️ registra serial do aparelho como metadado | ✅ (valida nº de celular e aparelho cadastrados) | **não confirmado** | **não confirmado** |
| Validação de hora/fuso do dispositivo | ⚠️ **não confirmado** | **não confirmado** | **não confirmado** | ✅ (alerta se hora/fuso do aparelho não estiverem automáticos) | ✅ (compara horário do dispositivo com o fuso da localização; valida data/hora pela operadora) | **não confirmado** | ✅ (fuso configurado pelo empregador; sincronização online do relógio) |
| Detecção de fake GPS / mock location | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** |
| Liveness / prova de vida no facial | ❌ (Flash Tablet declara explicitamente que **não tem**) | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** |
| Alerta de alteração de horário do relógio (REP) | — | — | — | ✅ (e-mail para administradores quando o horário do REP muda além de um limite configurado) | — | — | — |

> **Sobre fake GPS e liveness:** nenhum dos nove fornecedores do escopo documenta publicamente detecção de mock location ou prova de vida. Encontrei essas capacidades documentadas apenas em players **fora do escopo pedido** — Pontotel lista "Verificador de GPS (fake GPS)", "Verificação de metadados das fotos" e "Verificador de operador humano (reCAPTCHA)" ([pontotel.com.br/solucoes/registro-de-ponto](https://www.pontotel.com.br/solucoes/registro-de-ponto/)); Registro Ponto anuncia "Detecção de fake GPS" com alerta ao gestor ([registroponto.com.br](https://registroponto.com.br/segmento-equipes-externas)); Otimiza publica preço diferenciado para o plano "com reconhecimento facial e liveness" ([otimizapro.com](https://otimizapro.com/artigo-melhor-ponto-eletronico-empresa)). **Isto é uma oportunidade real de diferenciação para o módulo novo.**

**Modelo de verificação do Oitchau (o mais explícito do mercado, vale copiar a estrutura):** cada marcação passa por três verificações — **Identidade** (número de celular + aparelho cadastrados), **Localização** (GPS, Wi-Fi, Bluetooth/iBeacon ou IP da rede) e **Horário** (compara o horário informado pelo dispositivo com o fuso da localização). Cada marcação recebe um **status** (Pendente, Aprovado, Recusado, Cancelado ou Inválido) e uma **classificação de método de verificação** (Manual, Wi-Fi, GPS, iBeacon, Biométrico ou IP). As exigências são configuradas **por localização/ponto de serviço**, não globalmente ([support.day.io — O que é verificação de ponto](https://support.day.io/hc/pt-br/articles/14825829464343)).

**Metadados capturados por marcação (Ahgora — o conjunto mais completo encontrado):** ao passar o mouse sobre o horário no espelho, o sistema exibe tipo da origem (REP, online ou mobile), **NSR**, código identificador/serial do aparelho e seu nome, **precisão da localização em metros**, provedor de internet no momento do registro, **IP**, **sistema operacional** e se **hora e fuso do aparelho estavam automáticos**. Há também ícone de mapa mostrando o local da marcação e as demais do período ([Manual PontoWEB](https://pdfcoffee.com/manual-de-configuracao-e-uso-pontoweb-pdf-free.html)).

---

## 3. Regras de jornada e escalas

### 3.1 Tipos de escala/turno suportados

| Tipo | Confirmação |
|---|---|
| Semanal 5x2 | Pontomais (tipo "Semanal"), Flash, Sólides, Ahgora, Oitchau, Sesame, Senior, TOTVS |
| 6x1 | Pontomais (módulo Escala: 6×1), demais por escala customizada |
| 5x1 | Pontomais (módulo Escala) |
| 4x2 | Pontomais (módulo Escala) |
| 12x36 | Pontomais (tipo de turno dedicado — "não é definida por dias da semana, mas por regra de Dia 1 (trabalho) e Folga"; não permite dois dias de trabalho seguidos), Flash, Ahgora, TOTVS RM Chronus, Senior |
| 24h/72h | Pontomais (tipo de turno dedicado) |
| 5d/1d | Pontomais (tipo de turno dedicado) |
| Escala sem padrão / customizada | Pontomais, Ahgora (ciclos com duração em dias), Sesame (padrões de rotação), Senior (até 9999 escalas) |
| Turnos rotativos / revezamento | Ahgora (mesma escala atribuída a dois colaboradores com datas de início diferentes gera revezamento), Sesame ("padrões de rotação"), Senior ("escala de revezamento" com tratamento próprio de faltas em feriado) |
| Escala espanhola (ciclo de 7x1 alternando folga) | **não confirmado** em nenhum fornecedor com esse nome — todos suportariam via escala customizada por ciclo de dias |
| Intermitente | Pontomais (tipo de turno "Intermitente", indicado para horistas), Flash (blog cita jornadas intermitentes) |
| Jornada flexível | Pontomais (flexível pura e flexível só no intervalo), Flash (modalidade "Flexível por período" e "Flexível por dia"), Ahgora (compensação automática de horas + intervalos flexíveis), Oitchau (total de horas por dia/semana sem horário fixo), Senior (horário rígido, móvel, flexível ou limitado), TOTVS RM |
| Teletrabalho / home office | TOTVS RM Chronus (regimes: horista, mensalista, jornada flexível, teletrabalho, parcial), Sesame (acompanha home office e presença), Flash/Sólides/Oitchau via geocerca |
| Sobreaviso | Flash (verba e destinação configurável; lançamento **exclusivo de gestor/RH**, colaborador não pode autolançar), Ahgora (tipo de afastamento específico, com data inicial/final atravessando dias), Pontomais (relatório de sobreaviso) |
| Ponto por exceção | Flash ("Cálculo por Exceção": ponto considerado cumprido conforme escala, registrando apenas desvios), Ahgora, Senior, TOTVS (fundamento legal: art. 74 §4º da CLT) |

### 3.2 Tolerâncias

- **Base legal:** art. 58 §1º da CLT — até **5 minutos por marcação**, limitados a **10 minutos por dia**. Oitchau referencia o art. 58 explicitamente ([oitchau.com.br/features/schedules](https://www.oitchau.com.br/features/schedules/)).
- **Pontomais** distingue dois modelos: *tolerância a cada registro* (o limite vale para cada batida, baseado no horário do turno) e *tolerância acumulada na jornada* (o colaborador distribui o limite como quiser no dia). No modelo acumulado surge a opção **"compensar tempo"** (o sistema analisa o total de horas do dia antes de aplicar a tolerância) e a opção **"aplicar para intervalos"**. Em jornada flexível a tolerância é sempre tratada como acumulada. Em jornada com entrada/saída fixas e intervalo flexível, o sistema **combina os dois modelos**. Quando o limite é ultrapassado, o sistema faz compensação entre horas extras e faltantes ([Central de ajuda Pontomais — Tolerância](https://materiais.vr.com.br/central-de-ajuda/configuracao-da-tolerancia-aprenda-aqui-como-configurar-a-tolerancia-o-que-e-como-configurar-e-como-funciona/)).
- **Ahgora**: tolerância de batidas antecipadas e tardias, separadamente na entrada e na saída, mais **tolerância máxima no dia**. Regra documentada: com tolerância diária de 10 min, 5 min de atraso + 5 min de saída antecipada = zero desconto; 6 + 5 = **11 minutos descontados integralmente** (não apenas o excedente). O mesmo vale para horas a mais. Em jornadas flexíveis define-se apenas tolerância de carga negativa e positiva.
- **Flash**: tolerância diária global e, na modalidade "Fixo por dia", limites específicos para **Entrada, Saída e Intervalo**.
- **Senior**: "Tolerância por Batida e Dia" configurada na Definição de Apuração.

### 3.3 Intervalos (intrajornada e interjornada)

- **Pré-assinalação de intervalo**: Pontomais ("Intervalo pré-assinalado: ao ativar, o intervalo do colaborador é registrado automaticamente… desde que o colaborador registre a entrada e a saída da jornada"; em jornada flexível o cálculo é a subtração entre 1ª Entrada e 1ª Saída previstas), Ahgora (registro automático de intrajornada com base no art. 74 da CLT, buscando o intervalo do horário contratual ou um horário informado; **o registro automático sempre aparece em par no espelho** — se o colaborador bater ponto, o ponto real prevalece; se esquecer um, o sistema considera falta para não gerar batida ímpar), Flash ("Intervalo de refeição: define as regras para pré-assinalação, redução de intervalo e alertas no aplicativo").
- **Aviso importante que a Ahgora documenta**: "O sistema **não permite geração automática de registro de ponto** porque as portarias também não permitem. No entanto, **com acordo sindical**, pode permitir a marcação de intervalos de refeição automaticamente."
- **Intervalo flexível**: Ahgora identifica automaticamente os períodos de intervalo, compensa e calcula apenas a diferença entre executado e previsto; permite definir o retorno do intervalo em função da saída ou horários-limite de início/fim; se a batida ficar fora da janela, considera o intervalo contratual. Pontomais tem opção equivalente (entrada/saída fixas com intervalo flexível).
- **Interjornada (11h — art. 66 CLT)**: Flash (regra de apuração define o tempo mínimo e **a destinação das horas em caso de descumprimento**; regra de "condições de trabalho" transforma isso em **trava** que bloqueia trocas de escala que violem a interjornada, exibindo mensagem de infração), Pontomais (define interjornada como pausa mínima de 11h consecutivas), Ahgora (tolerância de interjornada configurável, alertas por e-mail e no dashboard do gestor, com botão para aprovar a infração ou disparar advertência ao colaborador), Oitchau, Senior.
- **Tratamento de intervalo não cumprido (Flash)**: três destinos configuráveis para intrajornada e interjornada — *pagar como hora extra no mês*, *apenas classificar como horas positivas*, ou *deixar marcado como "Sob Análise"* ([faq.flashapp.com.br — regra de cálculo](https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-regra-de-calculo-sem-banco-de-horas-na-flash-4CzMJjdhbf/Steps/5072003)).
- **Pausas NR-17**: Flash ("Pausas obrigatórias (NR-17): parametriza as verbas para controle de pausas fora do tempo previsto pela norma"; a página comercial cita configuração de horários e tolerância), Pontomais (aba de configurações adicionais da escala), Ahgora (requer equipamento específico "registrador de pausa NR17"; gera arquivo de fiscalização com marcações de intervalo NR-17).

### 3.4 DSR, feriados, compensação e prorrogação

- **DSR (Ahgora — o modelo mais detalhado)**: configuração global com dois campos — *Desconto DSR* (em horas) e *Limite de falta* (horas-falta toleradas na semana). Exemplo do manual: colaborador de 40h semanais que falta 8h, com desconto=8h e limite=8h, perde um dia; com limite=10h, não perde nada. Pode ser calculado **por semana ou por mês**. A configuração de DSR na escala **prevalece** sobre a global. Requisito adicional: no campo "Converter horas a menos" da jornada é necessário selecionar *Falta*, caso contrário o sistema não desconta DSR automaticamente.
- **DSR (Flash)**: "Domingos e DSR: configura o controle de repousos semanais e o cálculo do reflexo sobre DSR"; nas horas negativas, faltas não justificadas podem ser configuradas como *compensar do saldo*, *descontar no salário* ou *descontar no salário ou gerar desconto do DSR*. Há também o conceito de **DUNT (Dia Útil Não Trabalhado)** contrastado com DSR na regra de gestão de escala.
- **Feriados (Ahgora)**: cadastro por data ou período; flag "ignorar o início da jornada" (que desconsidera a virada do dia — a Ahgora alerta que isso **pode conflitar com a CLT**); feriados locais atribuídos por **localização** (ex.: aniversário da cidade só para a filial daquela cidade); definição de como tratar batidas realizadas no feriado, com tipo de hora adicional, limite diário e tipo de hora para o excedente; feriados precisam ser cadastrados ano a ano.
- **Feriados (Flash)**: "Feriado Indenizado: contabiliza os feriados do mês para apuração de verba indenizatória"; "Natureza do dia: define a prioridade do cálculo em dias com concorrência de eventos (ex.: feriado em dia de folga)". Este último é um requisito frequentemente esquecido em especificações.
- **Compensação automática (Ahgora)**: contabiliza como expediente as horas trabalhadas em qualquer período do dia — se o colaborador chega 30 min tarde e sai 30 min tarde, não há falta nem extra. Pode-se aplicar **fatores de banco de horas somente após a compensação automática**. Exemplo do manual: atraso de 1h + 2h a mais no mesmo dia = 1h de crédito no banco (não 2h).
- **Compensação/prorrogação (Senior)**: "programação de trocas de horário, trocas de escalas, **pontes** e compensações, individuais ou coletivas"; "projeção de horas conforme período da folha e **DSR proporcional**".
- **Trocas de escala (Flash — regra de gestão de escala)**: define permissões, prazos de solicitação, alçadas de aprovação e flexibilidades para trocas de dias, folgas (DSR/DUNT) ou compensações. Prazos: *sem limites*, *domingo da semana anterior* (bloqueia alterações na semana atual e passadas) ou *prazo de antecedência mínimo* configurável. Prazo de aprovação com fallback automático (aprovar ou reprovar). E o comportamento no fechamento do espelho: solicitações pendentes são aprovadas ou reprovadas automaticamente.
- **Limites legais como trava (Flash — regra de condições de trabalho)**: teto de dias consecutivos trabalhados, interjornada mínima de 11h e DSR ao domingo. Quando vinculada à escala, funciona como trava de segurança que **bloqueia a alteração** e exibe mensagem de infração cadastrada.

### 3.5 Adicional noturno e hora noturna reduzida

- **Flash**: intervalo noturno configurável (padrão CLT 22h–5h) e **majoração pelo fator 1,1428571** (que é exatamente 60/52,5, a hora noturna reduzida de 52min30s).
- **Ahgora**: horário noturno ativável com início/fim informados; suporte a **rural** (21h–5h lavoura, 20h–4h pecuária); opção de **estender o horário noturno até o fim da jornada** ou **até a última batida** (prorrogação do adicional noturno, art. 73 §5º CLT); opção de **agrupar horas noturnas** convertendo-as em normais na visualização do espelho; ao agrupar, é possível **desativar o fator noturno**, o que faz o sistema calcular fora do padrão da Lei 5.889/73 (que acresce 7'30" a cada 52'30", ou **+14,285%**).
- **Pontomais**: "Controle de horas extras, banco de horas e horas noturnas"; relatório de horas noturnas.
- **Oitchau**: adicional noturno configurável por política/sindicato.
- Riscos documentados por terceiros: ignorar a redução da hora noturna (52min30s) gera pagamento a menor de adicional e reflexos, com impacto no evento S-1200 do eSocial ([impactotecnologia.com.br](https://impactotecnologia.com.br/blog/controle-de-ponto-erros-esocial-multas/)) (fonte secundária).

---

## 4. Espelho de ponto e apuração

### 4.1 Cálculo e classificação de horas

Todos os fornecedores calculam automaticamente: horas trabalhadas, atrasos, saídas antecipadas, faltas, horas extras e adicional noturno. As diferenças relevantes estão na **granularidade da classificação**:

- **Ahgora — "horas adicionais" como entidade de primeira classe**: antes de cadastrar jornadas, cadastram-se tipos de hora adicional, cada um com **nome, tipo (hora extra, banco de horas ou expediente), percentual ou fator multiplicador e código contábil**. Horas sem código contábil **não podem ser exportadas para a folha**. Cada tipo tem um **padrão de autorização** (Autorizado/Desautorizado) — configurando "Horas extras 100%" como *Desautorizado*, todas as extras desse tipo aparecem no espelho como "Hora Extra N.A." (não autorizada), e o gestor autoriza pontualmente. Há também opção global de **ocultar do espelho as horas não autorizadas**.
- **Ahgora — conversão em cascata entre tipos de hora**: por jornada é possível definir limites diários por tipo e o que acontece com o excedente. Exemplo do manual: após 1h de "banco de horas", o excedente vira "hora extra 100%". Suporta ainda conversão **por percentual** (ex.: 3h de banco com regra de 50% → 1h30 de banco + 1h30 de HE 50%), conversão de tipo **noturno** e conversão de **hora negativa**.
- **Pontomais — configuração avançada de HE**: matriz por tipo de dia (dias de trabalho, sábado, domingo, feriado, folga) × faixas de limite × destino (H.E. ou B.H.) × percentual. Padrão sem configuração avançada é o da CLT: **50% nas 2 primeiras horas e 100% nas demais**. Exemplo documentado: 50% para as 2 primeiras horas em dias úteis e sábados (lançadas como banco), 100% acima disso (pagas), 110% em domingos, feriados e folgas.
- **Flash**: divisão das horas positivas em **até 2 períodos distintos** com percentuais próprios; percentuais típicos 50% (2 primeiras horas) e 100% (demais); "a definição do percentual em R$ ocorre na folha de pagamento" — ou seja, o ponto entrega quantidade, a folha entrega valor.
- **Oitchau**: "fases" de compensação com **distribuição percentual do saldo entre Banco e Horas Extras**, sem limite de tipos de distribuição, para atender convenções e acordos coletivos.
- **Senior**: motor extensível — campos "Regra Início Cálculo Apuração" e "Regra de Apuração" apontam para **código escrito no Editor de Regras**, executado no cálculo, recálculo e acertos individuais. Isso é o extremo do espectro de customização.
- **Ahgora — horas in itinere**: quantidade de horas in itinere de entrada e de saída, com forma de cálculo própria; o manual observa que hoje são usadas para outros fins (horário de lazer, atividade física oferecida pela empresa) e podem ser separadas do restante da jornada.

### 4.2 Banco de horas

| Capacidade | Fornecedores |
|---|---|
| Crédito e débito com saldo em tempo real | Todos |
| Ciclo/vigência configurável | Flash (mês de abertura + duração em meses: trimestral 3, semestral 6, anual 12), Pontomais (vigência configurável, **limite do sistema de até 18 meses**), Ahgora (banco corrido: início mês/ano + nº de meses) |
| Prazos distintos para saldo positivo e negativo | **Ahgora — "banco de horas móvel"**: nº de meses de compensação diferente para negativo e positivo (ex.: negativas em 30 dias, positivas em 90). Requer solicitação ao time de Sucesso do Cliente |
| Destino do saldo no vencimento/expiração | Ahgora (indica em qual hora adicional as horas positivas e negativas são lançadas ao fim do prazo), Flash (ao fim do ciclo: enviar todo o saldo para pagamento, ou pagar apenas o que exceder X; saldo negativo pode ser carregado para o próximo ciclo) |
| Limite acumulado positivo/negativo | Pontomais (limite positivo e limite negativo de horas), Flash (teto de acúmulo, ex.: 50h; horas excedentes com tratamento definido; limites de lançamento por semana, mês ou ciclo), Oitchau (limite mensal) |
| Fatores multiplicadores | Pontomais ("fatores acumulativos de banco" — contagem acumulada no período em vez de diária), Ahgora (fator multiplicador por tipo de hora), Flash (percentuais de acréscimo por verba, ex.: 100% para feriados, aplicáveis **somente** às horas destinadas ao banco) |
| Migração de saldo pré-existente | Flash ("Tipo de ciclo: Novo ou Em andamento — neste último caso, realize a importação do saldo pré-existente") |
| Considerar tolerância no cálculo do banco | Pontomais (flag específica) |
| Manter ou remover majoração no fechamento | Flash ("Defina se o saldo acumulado deve manter as majorações"; "escolha se as horas que entram no banco devem ser contabilizadas com ou sem os percentuais de majoração") |
| Banco de **folgas** (dias, não horas) | Flash — regra própria: peso por dia trabalhado em folga (crédito), débito por folgas usadas e por faltas, limite de saldo negativo com bloqueio de novos lançamentos, e liquidação do saldo ao fim do ciclo ([faq.flashapp.com.br — banco de folga](https://faq.flashapp.com.br/kb/guide/pt-BR/como-configurar-banco-de-folga-no-folhaflash-UK2v3Di6oB/Steps/5846075)) |

**Base legal a respeitar:** CLT art. 59 — banco de horas por **acordo individual escrito** compensável em até **6 meses** (§5º) e por **negociação coletiva** em até **12 meses** (§2º). Note que o limite de 18 meses configurável no Pontomais é uma flexibilidade de sistema, não uma permissão legal.

### 4.3 Espelho de ponto: conteúdo, personalização e assinatura

**Personalização do espelho (Ahgora — "Espelho Estendido"):** mostrar/ocultar coluna de resultados (resumo diário), total de horas positivas e negativas do banco, mensagem de aniversariante do mês, mensagem de cabeçalho, forma de exibição do saldo de banco, total de horas trabalhadas, códigos internos, fonte comprimida (imprimir em uma folha), legenda de batidas pré-assinaladas de intervalo, nome da última escala no cabeçalho, espaço adicional para assinatura do gestor no rodapé, **impedir aprovação ou impressão quando houver batidas ímpares no período**, ocultar intervalos pré-assinalados, frase padrão no rodapé, exibir código de barras (data do espelho + PIS) para rastreabilidade, exibir observação do gestor por dia, exibir total de horas previstas conforme escala.

**Personalização do espelho (Flash — regra de espelho):** dashboard de totais (sobreaviso, interjornada, adicional noturno); abas visíveis — **Espelho de Ponto, Banco de Horas, Selfies (reconhecimento facial), Mapa (marcações via GPS), Fechamento do Período e Banco de Folgas**; atalho "Reprocessar Verbas"; exibir nome da escala no lugar das horas esperadas; permitir que o colaborador ajuste marcações para o dia anterior ou seguinte; layout de impressão horizontal com escolha de colunas (Eventos, Jornada esperada, Marcações originais, Hora noturna convertida/trabalhada); campos de assinatura (gestor, colaborador ou ambos), **data/hora do aceite eletrônico** e dados do fechamento (nome, data, hora); personalização das verbas no rodapé.

**Assinatura eletrônica do espelho pelo colaborador:**

| Fornecedor | Como funciona |
|---|---|
| Flash | Aceite eletrônico com registro de data/hora; **lembretes automáticos do "De Acordo"** disparados em dia do mês configurável, a partir das 9h, por **SMS, push (com link) e/ou e-mail**; modelo manual, automático ou ambos |
| Ahgora | Colaborador aprova digitalmente no Portal do Colaborador; **o espelho só aparece para o colaborador depois da aprovação do gestor**; tela "Batidas > Aprovação de espelhos" mostra o que já foi aprovado por gestor e por colaborador |
| Pontomais | Assinatura eletrônica do espelho pelo app/web (o colaborador cadastra a imagem da assinatura no perfil); relatório de assinaturas |
| Sólides | Assinatura eletrônica da folha; envio do espelho por WhatsApp para conferência rastreável |
| Oitchau | "Solicite assinaturas eletrônicas… no fechamento e monitore em tempo real" |
| Convenia | Distribui o espelho importado (ACJEF/AFDT) ao colaborador |
| Senior | "Emissão do espelho de ponto no formato digital" |

### 4.4 Fechamento, recálculo e trava de período

- **Período de apuração**: Ahgora define o **primeiro dia do mês de trabalho** (ex.: 16 → apura de 16 a 15); Senior tem "período de apuração de ponto definido pelo usuário"; TOTVS RM Chronus define períodos **mensal, quinzenal ou semanal**, independentes do período da folha, com histórico de períodos, liberação, período futuro, troca de período ativo e transferência de dados para tabela de produção/arquivo morto.
- **Recálculo**: Flash tem reprocessamento **individual** (três pontinhos no espelho → "reprocessar cálculos do período") e **em massa** (Controle de Jornada → "Reprocessamento de cálculos de horas" → período de 30 dias ou personalizado + grupos/departamentos/pessoas); na FolhaFlash existe também "reprocessamento de verbas" em massa. Senior tem "recálculo" no motor de apuração.
- **Trava/bloqueio de competência**: **Ahgora** — tela "Bloqueio de alterações" indica meses bloqueados, quem bloqueou, quando, e uma **tolerância em dias após o fim do período de apuração** durante a qual ainda se aceitam ajustes; depois de fechado, **só o administrador tem a permissão**. **Flash** — ações "Exibir ação de fechar" e "Exibir ação de abrir" o espelho manualmente, fechamento em massa por seleção de colaboradores, e o relatório "Cálculos de horas" traz o **status do espelho (ABERTO/FECHADO) e o log de quem abriu ou fechou**.
- **Imutabilidade dos registros brutos (Ahgora)**: "Por ser um Sistema de Registro Eletrônico de Ponto (SREP), o Ahgora PontoWEB **não permite que nenhum registro do equipamento seja apagado**. Mesmo que o ponto seja registrado indevidamente, fica armazenado e pode ser tratado isoladamente. O sistema sempre mostra todas as marcações feitas." Marcações inseridas manualmente aparecem com marcação distinta e justificativa. Este é o comportamento correto e deve ser requisito não-funcional do módulo novo.
- **Versionamento de escalas/jornadas (Ahgora)**: regra explícita do manual — "**Não modifique nem delete nenhuma hora, jornada ou escala que tenha sido utilizada**"; deve-se criar uma nova e **ocultar** a anterior, senão a apuração de meses passados é recalculada com as regras novas. O sistema mantém **logs de escalas/jornadas removidas** identificando o usuário. Requisito de projeto: **vigência temporal (valid-from/valid-to) em toda entidade de regra**.

---

## 5. Fluxos de solicitação e aprovação

### 5.1 Tipos de solicitação

| Solicitação | Flash | Pontomais | Sólides | Ahgora | Oitchau | Sesame | Senior |
|---|---|---|---|---|---|---|---|
| Inclusão de marcação esquecida | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ajuste/correção de marcação | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Desconsiderar marcação / restaurar marcação | ✅ (indicadores próprios na central de aprovações) | **não confirmado** | **não confirmado** | ✅ (batida duplicada descartada e sinalizada) | ✅ (recusar/cancelar/invalidar) | **não confirmado** | **não confirmado** |
| Abono de horas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Atestado médico com anexo | ✅ (com **CID** opcional obrigatório) | ✅ (imagens via app) | ✅ | ✅ (anexo de documento na justificativa) | ✅ | ✅ | ✅ |
| Férias (programação) | ✅ | ✅ | ✅ | ✅ (afastamento) | ✅ | ✅ | ✅ |
| Day off / folga | ✅ | ✅ (gestão de férias e folgas) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Home office / teletrabalho | **não confirmado** como tipo de solicitação | **não confirmado** | **não confirmado** | **não confirmado** | **não confirmado** | ⚠️ acompanha home office como status | **não confirmado** |
| Licenças e afastamentos (maternidade, paternidade, serviço militar…) | ✅ | ✅ | ✅ | ✅ (categorias de afastamento cadastráveis) | ✅ | ✅ | ✅ |
| Hora extra pré-autorizada | ⚠️ autorização a posteriori no espelho | ⚠️ limites por faixa | **não confirmado** | ⚠️ padrão Autorizado/Desautorizado por tipo de hora + autorização pontual no espelho | ⚠️ limites com alerta | **não confirmado** | ✅ ("Controla solicitações de vales, autorização de saída e **autorização de horas extras realizadas via coletor**"; "Solicitação Horas Extras" na Definição de Apuração) |
| Troca de escala / troca de turno | ✅ (aba "Escalas" na central de aprovações) | ✅ (módulo Escala) | ✅ | ✅ (programações de troca) | ✅ (exceções de jornada) | ✅ (troca de turnos pelo app com aprovação do gerente) | ✅ (trocas de horário e escala, individuais ou coletivas) |
| Sobreaviso | ⚠️ Flash: **somente gestor/RH lança**, colaborador não pode | — | — | ✅ (tipo de afastamento) | — | — | — |

**Detalhes de configuração de eventos (Flash — o modelo mais completo encontrado):** ao criar um *motivo de evento*, define-se (a) os **efeitos** no espelho (horas vão para banco de horas, pagamento, desconto de DSR/férias ou abono, conforme a matriz de regras da empresa); (b) os **requisitos de lançamento** — se exige justificativa escrita, se exige documento e se exige **CID**; (c) o **fluxo de aprovação** — "pelo gestor" (pendente até validação manual) ou "não precisa de aprovação" (aprovado automaticamente); (d) **"Pedir aprovação de eventos cadastrados por administradores"** — regra de auditoria que exige um segundo par de olhos quando o próprio admin lança o evento para o colaborador ([faq.flashapp.com.br — motivos de evento](https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-e-consultar-motivos-de-evento-na-flash-X1wnsNZun1/Steps/4197871)).

**Férias (Flash):** solicitação pelo colaborador com **venda de 1/3 (abono pecuniário)**, **antecipação do 13º**, **parcelamento**, quantidade de dias, datas e mensagem ao gestor. Histórico com status: *Em aquisição*, *Direito adquirido*, *Aprovado*, *Finalizado*. **Oitchau** cobre aviso de férias com **30 dias de antecedência conforme a CLT**, abono pecuniário, antecipação de férias e notificações de férias a vencer.

### 5.2 Aprovação: alçadas, delegação e centralização

- **Alçadas múltiplas**: **Flash** — regra de gestão de escala permite escolher entre **uma alçada** (gestor direto) ou **duas alçadas** (gestor direto + gestor do gestor), com prazo de aprovação e fallback (aprovar ou reprovar automaticamente ao expirar). **Sesame** — fluxos de aprovação com **N níveis**, cada nível atribuível a *pessoas específicas* ou a *perfis*; comportamento documentado: "se um nível não tiver responsáveis atribuídos, a solicitação será aprovada automaticamente e avançará para o próximo nível" ([help.sesamehr.com — fluxo de aprovação](https://help.sesamehr.com/pt_BR/automacoes/como-criar-fluxo-de-aprovacao)).
- **Delegação de aprovador**: **não confirmado** explicitamente em nenhum dos nove fornecedores. O mais próximo é o escopo por perfil (Sesame) e por localização (Ahgora). Vale tratar como lacuna/oportunidade.
- **Autoaprovação**: Senior tem, no cadastro do colaborador, os campos "Participa do processo de acerto", "Ajusta ponto" e **"Aprova o próprio ponto"** (habilitado apenas se "Ajusta ponto" = Sim) — modelo interessante para cargos de confiança.
- **Central de aprovações (Flash)**: uma página única dividida em quatro abas — *Justificativa de ponto* (com indicadores por tipo: marcações manuais, ajustadas, desconsideradas, restauradas), *Lançamentos de eventos*, *Programação de férias* e *Escalas*.
- **Aprovação em massa**: Oitchau ("Super Punch": aprovar pontos, pedidos de ausência e férias, adicionar pontos, criar exceções de jornada e **realizar ações em massa**), TiqueTaque ("aprovação ou reprovação em lote"), Senior ("acertos e conferências em lote"), Ahgora (ações em massa em funcionários: demitir, aplicar/remover escala, editar departamento, adicionar/remover localização, habilitar/desabilitar alertas, liberar batidas online/mobile).
- **Justificativas padronizadas (Ahgora)**: cadastro prévio de justificativas pré-estabelecidas que o colaborador escolhe no Portal ou no app, em vez de texto livre. Configuração global "requerer o preenchimento da justificativa de alteração na marcação" torna **obrigatória** a justificativa em toda alteração de batida.

---

## 6. Gestão em tempo real, dashboards e alertas

### 6.1 Visões em tempo real

- **Ahgora**: tela "Batidas do dia" mostra **quem registrou e quem não registrou** no período, com filtros por departamento/cargo; tela específica de **batidas ímpares** (com a ressalva documentada de que não exibe quem bateu apenas entrada e saída sem intervalo); dias com batida ímpar não tratada ficam **destacados em vermelho** com alerta; app **Ahgora Leader** para o gestor identificar batidas ímpares, justificativas em aberto, quem tem horas positivas ou negativas e a jornada em tempo real (disponível apenas no Plano Estratégico); módulo **Live Maps** para visão global e em tempo real da presença em unidades espalhadas.
- **Flash**: espelhos da equipe, aba **Mapa** com as marcações via GPS, aba **Selfies** com as fotos de reconhecimento facial, e relatório de "localização das marcações por dia".
- **Oitchau**: "Super Punch" com visão macro da folha de ponto por grupo ou individual em tempo real; "Veja quem está trabalhando"; dashboards customizáveis com apoio de equipe de BI; dashboard de férias e ausências.
- **Pontomais**: indicadores de presença, atrasos, banco de horas e ausências em tempo real no app, para colaborador e gestor; identificação de absenteísmo via relatórios.
- **TOTVS Linha Ahgora**: **Mapa de Frequência** ("monitore em tempo real as batidas e gerencie a operação e as pessoas nos postos de trabalho para agir em casos de remanejamento"), **Consultor Digital** com IA e **mais de 15 dashboards**, e **Controle de Acesso Virtual** (gestão de acesso ao ambiente virtual de trabalho, com foco em reduzir horas indevidas e atender à NR-1).
- **TOTVS Datasul/Protheus**: "Dashboard de Marcações" com status detalhado por colaborador e exportação em Excel/PDF.
- **Sesame**: indicadores de desempenho na escala comparando **custo estimado vs. custo real** por semana.

### 6.2 Alertas e notificações

| Alerta | Fornecedores |
|---|---|
| Lembrete para bater ponto | Oitchau (o **colaborador** define com quanta antecedência quer ser lembrado, e o app notifica conforme os horários da jornada), Pontomais ("avisos e notificações para o trabalhador"), TiqueTaque (aviso de pausa e de retorno) |
| Alerta de risco/excesso de hora extra | Oitchau (quando o colaborador ultrapassa os limites definidos, **o gestor é notificado na hora** pelo app), Pontomais ("notificações caso o colaborador ultrapasse as regras de hora extra estipuladas"), Sólides ("alertas para horas extras e compensações") |
| Alerta de intrajornada/interjornada não cumprida | **Ahgora** — notificação no dashboard do gestor **e** e-mail; aparece um ícone para *aprovar a infração* e outro para *enviar o e-mail de advertência* ao colaborador, com texto padrão editável cadastrado em "Mensagens de alerta". Requisito documentado: a flag "Receber alertas deste funcionário" precisa estar ativa no cadastro, e o dashboard **não exibe alertas se o gestor tiver mais de 30 funcionários atribuídos**. Flash e Pontomais também tratam interjornada, mas via destinação de horas |
| Marcação fora da cerca virtual | Pontomais/VR ("receba uma notificação caso a batida aconteça fora do combinado"), Flash (trava impede o registro), Sesame (bloqueio com até 2 novas tentativas) |
| Batidas ímpares / inconsistências | Ahgora (alerta na tela + destaque vermelho + relatório agendável), Sólides ("a inteligência do app detecta inconsistências de marcação e envia alertas aos gestores instantaneamente"), Flash ("Inconsistência nas marcações: padroniza o tratamento de batidas ímpares e marcações incompletas"), Senior ("incidentes de possíveis irregularidades perante a legislação") |
| Alteração indevida do horário do REP | Ahgora (e-mail aos administradores quando a variação excede o limite configurado, ex.: 5 min) |
| Status do equipamento (sem papel, impressora aberta, sem comunicação) | Ahgora (alertas por e-mail para os REPs Ah10/Ah30) |
| Lembrete de assinatura do espelho | Flash (SMS, push e e-mail, em dia do mês configurável, disparo a partir das 9h) |
| Relatórios agendados por e-mail | Ahgora (batidas ímpares, batidas por período, faltas e atrasos, horas extras, sumarizado diário por funcionário, totais — com periodicidade e destinatários), TiqueTaque (frequência e conteúdo configuráveis), Senior (processos automáticos com envio de e-mails agendado) |
| Notificação de férias a vencer | Oitchau |

**Canais de notificação confirmados:** push (Flash, Pontomais, Oitchau, Sesame, Sólides), e-mail (Flash, Ahgora, Senior, TiqueTaque), **SMS** (Flash), **WhatsApp** (Sólides envia a folha de ponto; Sesame e Pontomais usam WhatsApp para registro).

---

## 7. Compliance legal e integrações

### 7.1 Marco regulatório — Portaria MTP 671/2021

**Estrutura dos sistemas (art. 4º / Q&A oficial do MTE):**

| SREP | Composição |
|---|---|
| **Convencional** | REP-C + Programa de Tratamento de Registro de Ponto (PTRP) |
| **Alternativo** | REP-A + PTRP |
| **Via programa** | **REP-P + coletores de marcações + Armazenamento de Registro de Ponto (ARP) + PTRP** |

**Diferenças práticas:**

| Critério | REP-C | REP-A | REP-P |
|---|---|---|---|
| Formato | Equipamento físico | Software, hardware ou combinação | Software em nuvem ou servidor dedicado |
| Exige acordo/convenção coletiva | Não | **Sim** (validade limitada à vigência do instrumento) | **Não** |
| Registro obrigatório | Homologação do modelo junto ao MTE + Inmetro (Portaria INMETRO 4/2022) | Não | **Certificado de registro de programa de computador no INPI** (art. 91) |
| Comprovante de marcação (art. 79) | Obrigatório | Conforme o instrumento coletivo | Obrigatório |

**Requisitos técnicos do REP-P (Anexo IX) que impactam diretamente a arquitetura do módulo:**

1. Exibir **relógio não-analógico com horas, minutos e segundos** no momento da marcação.
2. Pode excepcionalmente operar **off-line**.
3. Acesso a meio de armazenamento com **redundância, alta disponibilidade e confiabilidade** (a **ARP**).
4. A marcação gravada na ARP deve conter: **NSR; CPF do trabalhador; data e hora da marcação; fuso horário da marcação; data e hora da gravação do registro; fuso horário da gravação; identificador do coletor; código hash (SHA-256)**.
5. **NSR por estabelecimento** (CNPJ com 14 posições ou CPF com 11), sequencial em incrementos unitários, **iniciando em 1** na primeira operação do REP naquele estabelecimento.
6. Gerar o **AFD** a partir dos dados da ARP, conforme art. 81.
7. **CPF substitui o PIS** como identificador do trabalhador no REP-P (fonte secundária: [Suporte TopPonto](https://suporte.topponto.com.br/duvida/novidades-referente-a-portaria-671/)).

**Assinaturas eletrônicas (art. 88 + Q&A do MTE):**

- Certificados **ICP-Brasil**, constituindo assinatura eletrônica qualificada nos termos da Lei 14.063/2020.
- **AFD**: padrão **CAdES**, arquivo **`.p7s` destacado (detached)**. A última linha do AFD deve conter o texto literal **`ASSINATURA_DIGITAL_EM_ARQUIVO_P7S`** completado com espaços à direita até 100 caracteres. O `.p7s` deve ter o nome do AFD acrescido de `.p7s` (ex.: `00000000000000REP_A.txt.p7s`).
- **Comprovante em PDF**: padrão **PAdES**.
- **CRC**: padrão **CRC-16 CCITT-TRUE (CRC-16/KERMIT)** — os 9 caracteres `123456789` geram `0x2189`; gravam-se os 4 caracteres hexadecimais sem o `0x`.
- **Quem assina**: o **fabricante/desenvolvedor** do REP, com seu próprio certificado digital — inclusive quando a empresa desenvolve o próprio REP-P para uso interno.

**Comprovante de Registro de Ponto do Trabalhador (art. 79) — 9 campos obrigatórios:**

1. Cabeçalho com o título "Comprovante de Registro de Ponto do Trabalhador";
2. **NSR**;
3. Identificação do empregador: nome, CNPJ/CPF e CEI/CAEPF/CNO, caso exista;
4. Local da prestação do serviço ou endereço do estabelecimento (quando atividade externa ou em instalações de terceiros);
5. Identificação do trabalhador: nome e **CPF**;
6. Data e horário do respectivo registro;
7. Modelo e número de fabricação (REP-C) **ou número de registro no INPI (REP-P)**;
8. **Código hash (SHA-256) da marcação** — exclusivo do REP-P;
9. Assinatura eletrônica de todos os itens I a VIII, no caso de comprovante impresso.

**Q&A oficial (item 40):** a emissão do comprovante no momento da marcação **não é obrigatória** se o trabalhador tiver acesso eletrônico ao comprovante após cada marcação, independentemente de solicitação prévia. O empregador deve possibilitar a extração dos comprovantes **das últimas 48 horas, no mínimo**.

**Arquivos fiscais:**

| Arquivo | Status atual |
|---|---|
| **AFD** (Arquivo Fonte de Dados) | Obrigatório para todos os tipos de REP. Leiaute do Anexo V. Registros do AFD no REP-P (fonte secundária, TopPonto): tipo 1 cabeçalho, tipo 2 inclusão/alteração da identificação da empresa, tipos 3 e 4 não aplicáveis ao REP-P, tipo 5 inclusão/alteração/exclusão de empregado, tipo 6 eventos sensíveis do REP-P, tipo 7 marcação via mobile, tipo 9 trailer, mais o registro de assinatura digital |
| **AEJ** (Arquivo Eletrônico de Jornada) | Gerado pelo PTRP, leiaute do **Anexo VI**. Detalhe do Q&A: no registro tipo 4, o campo **`durJornada` deve ser preenchido com a jornada diária em minutos**. A Portaria não exige nomenclatura específica para o AEJ |
| **AFDT** e **ACJEF** | **Substituídos pelo AEJ.** Prazo de adequação dos PTRP encerrado em **11/01/2023** (prorrogação dada pela Portaria MTP 3.717/2022) |
| **Atestado Técnico e Termo de Responsabilidade** | Modelo do Anexo VII; documento eletrônico com assinatura eletrônica qualificada de pessoa física; deve conter nome do algoritmo de hash, chave pública e algoritmo de criptografia assimétrica; campos empresa, razão social e CNPJ são **obrigatórios**; para múltiplas empresas, cada uma tem seu documento assinado |

> ⚠️ Vários produtos ainda oferecem **AFDT e ACJEF** (Ahgora e Pontomais os exportam). Isso é um resíduo histórico: o módulo novo deve nascer gerando **AFD + AEJ**, e tratar AFDT/ACJEF apenas se houver demanda de importação de sistemas legados (que é exatamente o caso da Convenia).

**Ponto por exceção:** admitido pelo art. 74 §4º da CLT em qualquer tipo de registro (manual, mecânico ou eletrônico), mediante **acordo individual ou coletivo**. Não é um tipo de REP. Confirmado no Q&A do MTE (itens 24 e 25). Implementado por Flash ("Cálculo por Exceção"), Ahgora, Senior e TOTVS.

**Compartilhamento de REP-C:** permitido para trabalhador temporário (Lei 6.019/1974) no REP-C do tomador, e para empresas do mesmo grupo econômico que compartilhem local de trabalho — nesses casos o PTRP deve identificar o empregado e considerar as marcações para o controle do empregador correto (art. 76 §3º).

### 7.2 Retenção de dados e LGPD

- **Retenção:** os registros de ponto devem ser guardados por, no mínimo, **5 anos** — combinação da prescrição quinquenal (art. 7º, XXIX, CF) e do art. 11 da CLT (fonte secundária, mas consenso entre múltiplas fontes). A Ahgora reforça: mesmo que um REP seja desabilitado, "o mesmo (ou sua memória) deve ser mantido como prova fiscal". A Convenia comercializa como diferencial a guarda de espelhos "por tempo indeterminado".
- **Biometria é dado pessoal sensível** — art. 5º, II, da LGPD (Lei 13.709/2018). Consequência prática: aplica-se o **art. 11**, não o art. 7º, e **legítimo interesse não é base legal admissível**.
- **Bases legais possíveis:** (a) consentimento **específico e destacado**; (b) cumprimento de obrigação legal ou regulatória — art. 11, II, "a" (o registro de jornada é obrigação do art. 74 da CLT); (c) execução de contrato; (d) prevenção à fraude e segurança do titular em processos de identificação e autenticação em sistemas eletrônicos.
- **Risco do consentimento na relação de emprego:** por causa da subordinação, o consentimento só é considerado livre se houver **alternativa não biométrica** de registro (senha, cartão, QR Code). Esse é um requisito de produto, não só jurídico: **o módulo precisa suportar, por colaborador, um método alternativo ao facial**.
- **Boas práticas exigíveis:** política de retenção documentada com **rotina automática de expurgo**, armazenamento criptografado, acesso restrito, trilha de auditoria, transparência sobre finalidade e prazo, e coleta mínima (armazenar o *template* biométrico e não a imagem crua, quando possível).
- Nota de precisão: a homologação como REP-P **não implica conformidade com a LGPD** — são obrigações independentes.
- Requisitos de segurança citados pela Flash como decorrentes da Portaria: criptografia robusta para transmissão e armazenamento ([flashapp.com.br/blog/lei-do-ponto-eletronico](https://flashapp.com.br/blog/lei-do-ponto-eletronico)) — a página cita "mínimo 128 bits" em um trecho e "AES-256" em outro; **tratar como orientação, não como texto normativo**.

### 7.3 Integração com folha de pagamento

**Padrão dominante do mercado: arquivo de exportação por layout, não API.**

- **Pontomais**: gera **TXT** por layout do sistema de folha escolhido em uma lista; para cada verba mapeia-se um **código de evento (rubrica)** conforme aparece no holerite; filtros por Unidade de Negócio, Equipe, Turno ou Número do Fechamento; formato de horas sexagesimal ou centesimal. **Se o layout do cliente não estiver na lista, a Pontomais desenvolve gratuitamente em até 60 dias úteis** mediante envio do PDF do layout ([Central de ajuda Pontomais — Exportação para folha](https://materiais.vr.com.br/central-de-ajuda/exportacao-para-folha-de-pagamento/)). Integração documentada com IOB/Aprendo, Consistem, TOTVS, Sankhya, Senior, Folhamatic.
- **Ahgora**: modelos pré-definidos para os principais sistemas de folha + **construtor de layout personalizado** (escolha de campos, separadores, delimitadores de texto; o campo **Código Contábil é obrigatório**). Os códigos contábeis são cadastrados por evento: Falta, Atraso, Adicional Noturno, DSR Descontado, Saldo do Banco de Horas, Saldo Negativo do Banco de Horas, Horas Trabalhadas e Expediente (noturno). Há ainda **"Configurações por funcionário"**, que permite criar regras com **prioridade numérica** sobrepondo o padrão da empresa (início do mês contábil, horas extras, banco de horas, horas noturnas, espelhos, códigos contábeis diferenciados) — recurso essencial em empresas com filiais de práticas distintas.
- **Ahgora ↔ TOTVS (nativo)**: menu "Administração de Pessoal | Integração RM X Ahgora" com três APIs — **Funcionários** (dados cadastrais e alterações, do RM para o Ahgora), **Afastamentos** (afastamentos e férias, do RM para o Ahgora) e **Resultados** (horas extras, faltas e demais movimentações, do Ahgora para o RM). No Protheus o endpoint é `POST api/rh/v1/v1/ahgora/results` com autenticação Basic, mapeando matrícula, ano/mês da competência, semana, rubrica, referência em horas/dias e data da falta ([tdn.totvs.com](https://tdn.totvs.com/pages/viewpage.action?pageId=867821195)).
- **Oitchau**: integrações nativas com **SAP SuccessFactors** (via SAP BTP, sincroniza estrutura organizacional, colaboradores e devolve jornada/ausências; SLA de implantação ~2 semanas), **ADP**, **Convenia**, **LG Conecta** (sincroniza times e colaboradores; ausências e férias fluem nos dois sentidos) e **Senior HCM** (artefato na loja Senior integrando Cargos, Centros de Custo, Filiais, Feriados, Funcionários/Demissões, Times, Localizações, Afastamentos, Programações de Férias e Importação de Folha, com De/Para entre "Pedidos"↔"Situações" e "Verbas"↔"Eventos"). Relógios integrados: Dimep, Control iD, Henry, Velti, Madis, Biometrius, ID Data, Keypass, TRIX, RHJ, RWTECH, TrilobitData, TOP Data.
- **Sólides**: integração **nativa** ponto ↔ folha própria, com marcações, horas extras, adicionais e atrasos lançados no holerite; folha com integração nativa ao eSocial.
- **Senior**: "Interface com qualquer sistema de folha de pagamento"; quando a folha é da própria Senior, **apenas as exceções** (horas extras, faltas, fechamento do banco) são integradas, porque o módulo de Administração de Pessoal já controla o restante.
- **Flash**: integração com folhas de pagamento (o site não lista quais); envio de holerites e assinatura de espelho via GED. **Lista de sistemas de folha suportados: não confirmada.**

### 7.4 eSocial

**Fato importante e frequentemente mal entendido:** **o eSocial não recebe marcações de ponto.** Não existe layout XML, evento específico nem API obrigatória para envio de batidas. A cadeia é **ponto → folha → eSocial**: o ponto gera o espelho e o AFD/AEJ, a folha consome e calcula, e a folha transmite os eventos. A Portaria 671 exige integridade, hash, assinatura e auditabilidade do REP-P (arts. 81–84), mas **não obriga conexão direta REP-P → eSocial** ([alltec.com.br](https://alltec.com.br/blog/esocial-controle-de-ponto-integracao-passo-a-passo.html), [letswork.com.br](https://www.letswork.com.br/blog/integracao-entre-sistema-de-ponto-e-esocial-o-que-e-e-o-que-nao-e-obrigatorio-hoje/)) (fontes secundárias, mas convergentes).

Eventos afetados pelos dados de ponto:

| Evento | Relação com o ponto |
|---|---|
| **S-1010** (Tabela de Rubricas) | Define as rubricas e suas **naturezas**, incluindo as de banco de horas |
| **S-1200** (Remuneração) | Discrimina horas extras, adicional noturno, atrasos, faltas e DSR calculados a partir do ponto |
| **S-1210** (Pagamentos) | Consome os valores da S-1200 |
| **S-2230** (Afastamento Temporário) | Licenças médicas, férias, acidentes — precisa estar sincronizado com o afastamento lançado no ponto |
| **S-2299 / S-2399** (Desligamento) | Saldo de banco de horas na rescisão |

**Banco de horas no eSocial** (natureza da rubrica, Tabela 3):

- **9950** — horas extras trabalhadas no mês e **lançadas a crédito** no banco (rubrica informativa; a quantidade já deve considerar bonificações/acréscimos percentuais da regra da empresa);
- **9951** — horas **compensadas/debitadas** no mês;
- **1004** — "Horas extraordinárias – Indenização de banco de horas", usada tanto para pagamento do saldo positivo quanto para desconto do saldo negativo (neste caso com `tpRubr` = 2 no S-1010).

Envio **mensal** via S-1200 e também no S-2299 na rescisão ([dape.com.br](https://www.dape.com.br/lernoticia.aspx?id=8996), [blog.fortestecnologia.com.br](https://blog.fortestecnologia.com.br/post/como-funciona-banco-de-horas-no-esocial)) (fontes secundárias convergentes).

**Nenhum dos fornecedores de ponto pesquisados transmite eventos ao eSocial diretamente** — quem transmite é o sistema de folha (Sólides declara integração nativa ao eSocial na sua *folha*, não no ponto).

### 7.5 API, webhooks, SSO e importação de cadastro

| Recurso | Situação por fornecedor |
|---|---|
| **API pública documentada** | **Flash** — `https://api.flashapp.services`, header `x-flash-auth`. Endpoints do módulo *time-and-attendance*: `GET /v1/attendance/day` (marcações por dia), `GET /v1/budgets` (verbas por ano/mês), `GET /v1/events`, `POST /v1/events` (cria/atualiza evento), `PATCH /v1/events/cancel`, `GET /v1/timetables/allocations` e `POST /v1/timetables/allocations` (alocações de escala) ([docs.api.flashapp.services](https://docs.api.flashapp.services/api/controle-de-jornada)). **Pontomais** — API RESTful documentada no Postman, base `https://api.pontomais.com.br/external_api/v1`, recursos `business_units`, `employees`, `employees/{id}/user`, `employees/{id}/dismiss`, `job_titles`, `teams`, `departments`, `cost_centers`, `shifts`; **contratada como extensão paga** no menu "Meus Serviços". **Sesame** — API REST com autenticação por token cobrindo funcionários, controle de ponto, documentos, estrutura organizacional e solicitações/aprovações. **Oitchau** — API com token, habilitada mediante solicitação ao suporte. **Ahgora** — Web Service **SOAP/1.1** (XML sobre HTTP) com chave de acesso única por empresa; documentação fornecida pelo time de Sucesso do Cliente. **Convenia** — API pública. **Sólides** — API citada (endpoints `/punch-controller` e `/time-sheet` em fonte secundária, **não confirmado** oficialmente) |
| **Webhooks** | **Pontomais** (configuração de URL por evento no painel, seção "API e Webhooks"), **Sesame** (painel visual de webhooks em Configurações → Integrações). Demais: **não confirmado** |
| **SSO** | **Ahgora** (módulo "Acesso Single Sign On" listado no manual). Demais: **não confirmado** |
| **Importação de colaboradores** | **Ahgora** — CSV com layouts pré-definidos ou layout personalizado, escolha do separador; a mesma tela atualiza cadastros existentes (mínimo para começar a coletar: nome, matrícula, PIS e data de admissão + CNPJ da empresa); exportação equivalente. **Pontomais** — via API. **Flash** — via API/plataforma. **Ahgora** também importa **escalas por CSV** (campos: matrícula, nome da escala, dia da escala, data de início, data de fim) e **afastamentos em massa** |
| **Alterações em massa** | Ahgora (senhas de teclado e códigos de barra de crachá para todos os colaboradores de uma vez; ações em massa no cadastro) |

---

## 8. Relatórios

### 8.1 Quantidade declarada

| Fornecedor | Quantidade declarada |
|---|---|
| Flash | **mais de 30** modelos |
| Pontomais/VR | **mais de 20** |
| Sólides | **mais de 20** / **30+** (números diferentes em páginas diferentes do próprio site) |
| TiqueTaque | **mais de 20** / **mais de 30** (idem) |
| Ahgora | não declara número; catálogo por tipo |

### 8.2 Catálogo consolidado de relatórios encontrados

**Operacionais / de marcação**
- Batidas por período (com geolocalização: latitude, longitude e precisão, exportável em CSV — Ahgora, desde que o campo "(CSV) Agrupar batidas por dia" esteja como NÃO)
- Batidas do dia / quem bateu e quem não bateu
- Batidas ímpares
- Registros de ponto / registros de pausa
- Localização das marcações por dia (Flash)
- Sumarizado diário por funcionário (Ahgora)
- Resumo da jornada (Pontomais)

**Apuração e fechamento**
- **Espelho de ponto** individual (Ahgora: "Espelho Estendido"; Flash: "FCLF051 Espelho de Ponto Horizontal em PDF")
- **Totais** (Ahgora — o mais completo, usado no fechamento da folha)
- Cálculos de horas por funcionário, com status ABERTO/FECHADO e log de abertura/fechamento (Flash)
- Horas extras
- Banco de horas / saldo de banco de horas (individual e por grupo)
- Faltas e atrasos
- Horas noturnas
- Provisionamentos (Pontomais)
- Demonstrativos financeiros / holerite (Ahgora — importa DIRF, CCL, Rubi, CNAB240 Sispag/Itaú por categoria: Anual, Mensal, Adiantamento, 13º, PLR)

**Gestão de pessoas**
- Afastamentos, férias e folgas
- Abonos e justificativas (aprovadas e não aprovadas)
- Absenteísmo
- Sobreaviso
- Ocorrências
- Benefícios / vale-refeição (Ahgora: flag na jornada indicando quem recebe VR, exibível em relatório)
- Horista (Pontomais)
- Turnos e escalas
- Assinaturas do espelho (Pontomais)
- Horas trabalhadas **por unidade/obra** (Ahgora — via histórico de unidades do equipamento, para construtoras que remanejam o REP entre obras)

**Fiscais e de auditoria**
- **AFD** (todos), **AEJ**, AFDT e ACJEF (legado — Ahgora, Pontomais)
- Auditoria de alterações (Pontomais)
- **Relatório de acesso ao sistema** (Ahgora: usuários que entraram, IP e páginas acessadas no período)
- Logs de escalas/jornadas removidas com identificação do usuário (Ahgora)
- Alterações de funcionários (Ahgora)

**Formatos e entrega**
- PDF, CSV, XLSX/Excel, TXT (Flash exporta em `.xlsx`, `.pdf`, `.csv`, `.txt`; Oitchau em PDF, CSV e XLSX)
- Ocultar/selecionar colunas antes de exportar (Ahgora, Oitchau)
- Filtros por empresa, departamento, grupo, pessoa, localização, centro de custo, unidade de negócio, equipe, turno
- **Agendamento por e-mail** com periodicidade e destinatários (Ahgora, TiqueTaque, Senior)
- Exportação para BI (Pontomais cita Power BI via API; Sesame cita Power BI e Tableau)

---

## 9. Modelo de precificação

### 9.1 Estrutura dominante

O modelo padrão é **por colaborador ativo por mês (PEPM)**, quase sempre com **faixas regressivas** por volume. Variações relevantes:

| Modelo | Quem usa |
|---|---|
| Por colaborador ativo/mês com faixas | Pontomais, Genyo, Otimiza, TagguiRH, e a maioria do mercado |
| Mensalidade fixa por plano (com teto de colaboradores no plano de entrada) | TiqueTaque (a partir de R$ 57,40–79,20/mês), Pontomais (página oficial: "a partir de R$ 69/mês") |
| Licença + taxa de implantação + mensalidade variável por nº de funcionários **e por dispositivo** | Ahgora / linha TOTVS, Secullum |
| Sob consulta (só após reunião comercial) | Pontotel, Oitchau, Sólides, Ahgora, Flash, Sesame, Senior, TOTVS |
| Plano gratuito de entrada | TiqueTaque ("Free Forever"), Jibble (usuários ilimitados), Oitchau (**apenas** no produto Timesheets, até 5 usuários) |
| Desconto por pagamento anual | Oitchau (10%), Genyo (20%) |

### 9.2 Valores públicos coletados (setembro/2026)

| Fornecedor | Valor | Fonte |
|---|---|---|
| Otimiza no Ponto | R$ 3,90 → R$ 1,40 por funcionário/mês; **R$ 5,90 → R$ 2,20 com reconhecimento facial e liveness** | Página oficial, via comparativo (fonte secundária) |
| Genyo | R$ 6,90 (1–10), R$ 5,78 (26–50), R$ 4,69 (51–100) por colaborador/mês | idem |
| TiqueTaque | Free Forever; **Go** a partir de R$ 57,40–79,20/mês (10 funcionários); **Hub** a partir de R$ 282,40–304/mês (com aparelho biométrico incluso) | [tiquetaque.com/planos-e-precos](https://tiquetaque.com/planos-e-precos/) (fonte oficial) |
| Pontomais | Página oficial: a partir de **R$ 69/mês**. Comparativos citam **~R$ 9/colab/mês** (Essencial), **~R$ 14** (Profissional) e Enterprise sob consulta. Um terceiro comparativo cita R$ 5,49 — **valores conflitantes, tratar como não confiáveis** | (fontes secundárias) |
| Sólides Ponto | "a partir de **R$ 99,90**" | [solides.com.br/controle-de-ponto-digital](https://solides.com.br/controle-de-ponto-digital/) (fonte oficial) |
| Oitchau | Planos **Standard / Professional / Enterprise**, calculadora por nº de colaboradores, sem valor publicado; Enterprise a partir de 500 colaboradores com proposta personalizada | [oitchau.com.br/pricing](https://www.oitchau.com.br/pricing/) (fonte oficial, sem preço) |
| Flash, Ahgora/TOTVS, Sesame, Senior, Convenia | Sob consulta / "agende uma demonstração" | Sites oficiais |

### 9.3 Elementos de precificação além do PEPM

Vale desenhar o modelo do módulo novo considerando o que os concorrentes cobram à parte:

- **Extensões/add-ons cobrados separadamente**: registro por WhatsApp (Pontomais), API + Webhooks (Pontomais), reconhecimento facial (Sólides "PRO"; Otimiza cobra ~50% a mais no plano com facial+liveness), WhatsApp (Sesame add-on).
- **Licença por dispositivo**: Ahgora — os planos contemplam número específico de conexões IoT de equipamento, licenças Batida Online e licenças Ahgora Multi (Plano Automático: 1 conexão IoT + batida online + 1 licença Multi; Plano Gerencial: 1 conexão IoT + batida online + 2 licenças).
- **Camadas de plano com funcionalidades bloqueadas**: Ahgora (Automático / Gerencial / Estratégico / Middleware — o app Ahgora Leader só existe no Estratégico; o Portal do Colaborador depende do plano), VR Pontomais (Cerca Virtual, Assinatura Eletrônica, Gestão de Escalas, Registro por WhatsApp e Reconhecimento Facial distribuídos entre planos), TiqueTaque (banco de horas, geolocalização, facial e multi-CNPJ só a partir do plano Go).
- **Hardware**: vendido/locado à parte (Ahgora, TiqueTaque Hub com aparelho incluso na mensalidade).
- **Taxa de implantação/setup** e contrato mínimo de 12 meses (Ahgora, Secullum).
- **Recomendação de referência de mercado (fonte secundária):** SaaS de ponto para PMEs entre **R$ 5 e R$ 12 por colaborador/mês**, com soluções robustas chegando a **R$ 30**.

---

## 10. Checklist consolidado de funcionalidades para especificar o módulo novo

Priorização sugerida: **P0** = obrigatório para ter um produto legalmente válido e vendável; **P1** = esperado por qualquer comprador que compare com Pontomais/Sólides; **P2** = diferenciação / enterprise.

### 10.1 Coleta

| # | Funcionalidade | Prioridade |
|---|---|---|
| C1 | App iOS/Android com marcação individual e visualização do próprio espelho | P0 |
| C2 | Marcação via web autenticada | P0 |
| C3 | Modo offline com fila local e sincronização idempotente (guardar o **timestamp da marcação**, não o da sincronização) | P0 |
| C4 | Modo kiosk/tablet compartilhado com sessão administrativa única e retorno automático por inatividade | P1 |
| C5 | Reconhecimento facial 1:N no kiosk e 1:1 no app | P1 |
| C6 | Selfie como evidência quando o facial estiver desabilitado | P0 |
| C7 | **Liveness / prova de vida** (nenhum concorrente do escopo tem — diferencial) | P2 |
| C8 | QR Code individual por colaborador (imprimível/plastificável no crachá) | P1 |
| C9 | PIN / senha independente da senha de acesso ao portal | P1 |
| C10 | Crachá NFC/Mifare e código de barras | P2 |
| C11 | Digital (integração com leitor externo) | P2 |
| C12 | Registro por WhatsApp (com aviso explícito sobre horário de sincronização) | P2 |
| C13 | Importação de AFD de REPs de terceiros | P1 |
| C14 | **Alternativa não biométrica obrigatória por colaborador** (requisito de LGPD, não de produto) | P0 |

### 10.2 Antifraude

| # | Funcionalidade | Prioridade |
|---|---|---|
| A1 | Geocerca por local de trabalho, com raio em metros configurável e tolerância de precisão | P0 |
| A2 | Cadastro de "local de trabalho" como entidade (endereço/CEP, coordenadas, raio, redes Wi-Fi, faixas de IP) | P0 |
| A3 | Trava por Wi-Fi (SSID/BSSID) | P1 |
| A4 | Trava por faixa de IP (especialmente no canal web) | P1 |
| A5 | Beacon Bluetooth para ambientes internos onde o GPS falha | P2 |
| A6 | Vínculo de dispositivo autorizado por colaborador (device fingerprint / número) | P1 |
| A7 | Validação de hora e fuso do dispositivo contra o servidor, com sinalização quando o relógio não está automático | P0 |
| A8 | **Detecção de mock location / fake GPS** com bloqueio ou marcação como pendente | P1 (diferencial) |
| A9 | Status da marcação com máquina de estados (Válida / Pendente / Aprovada / Recusada / Inválida) em vez de aceitar-ou-rejeitar | P1 |
| A10 | Configuração das exigências **por local de trabalho**, não global | P1 |
| A11 | Registro completo de metadados por marcação: origem, NSR, device id, precisão em metros, IP, provedor, SO, flags de hora/fuso automáticos | P0 |
| A12 | Fallback quando a trava impede a marcação (registrar como pendente com justificativa em vez de perder a marcação) | P1 |

### 10.3 Regras de jornada

| # | Funcionalidade | Prioridade |
|---|---|---|
| J1 | Modelagem em três camadas: **tipos de hora → jornada (dia) → escala (ciclo)** — modelo da Ahgora, o mais reutilizável | P0 |
| J2 | Tipos de escala prontos: 5x2, 6x1, 5x1, 4x2, 12x36, 24x72, 5d/1d, customizada por ciclo de N dias | P0 |
| J3 | Jornada flexível (por dia e por período) e intervalo flexível | P1 |
| J4 | Jornada intermitente / horista | P2 |
| J5 | **Virada do dia** configurável por jornada (crítico para turnos noturnos) | P0 |
| J6 | Tolerância nos dois modelos: por registro e acumulada no dia; opção de aplicar a intervalos | P0 |
| J7 | Intervalo pré-assinalado com par automático de marcações e legenda no espelho | P1 |
| J8 | Interjornada mínima com destinação das horas em caso de descumprimento **e** trava opcional em trocas de escala | P1 |
| J9 | Pausas NR-17 com horários e tolerância | P2 |
| J10 | DSR com desconto configurável, limite de falta, apuração semanal ou mensal, e prevalência da configuração da escala sobre a global | P0 |
| J11 | Feriados nacionais, estaduais e municipais atribuíveis por **localização**, com tratamento próprio de batidas no feriado | P0 |
| J12 | "Natureza do dia" — regra de prioridade quando eventos concorrem (feriado em dia de folga, férias em feriado etc.) | P1 |
| J13 | Adicional noturno com janela configurável, **hora reduzida (fator 1,1428571)**, prorrogação até o fim da jornada e variantes rurais | P0 |
| J14 | Compensação automática intradiária (atraso compensado por saída tardia no mesmo dia) | P1 |
| J15 | Conversão em cascata entre tipos de hora por limite diário e por percentual | P2 |
| J16 | Sobreaviso como tipo de evento com verba e destinação próprias | P1 |
| J17 | Ponto por exceção | P2 |
| J18 | **Vigência temporal em toda regra** (jornada, escala, tipo de hora), com histórico imutável e proibição de edição destrutiva | P0 |
| J19 | Atribuição de escala individual, em massa e por importação CSV, com data de início e fim | P1 |

### 10.4 Apuração, espelho e fechamento

| # | Funcionalidade | Prioridade |
|---|---|---|
| E1 | Cálculo de horas trabalhadas, atrasos, saídas antecipadas, faltas, extras e noturnas | P0 |
| E2 | Faixas de hora extra por tipo de dia (útil, sábado, domingo, feriado, folga) com limite e destino HE/BH por faixa | P0 |
| E3 | Banco de horas com ciclo, limites positivo e negativo, prazos distintos para crédito e débito, e destino do saldo na expiração | P0 |
| E4 | Importação de saldo inicial de banco (migração de sistema anterior) | P1 |
| E5 | Banco de folgas (crédito em dias com peso) | P2 |
| E6 | Espelho configurável por regra: colunas, totais, abas, layout de impressão, rodapé, legendas | P1 |
| E7 | **Assinatura/aceite eletrônico do colaborador** com carimbo de data/hora e registro de identidade | P0 |
| E8 | Aprovação em duas etapas: gestor libera → colaborador assina | P1 |
| E9 | Lembretes automáticos de assinatura por push, e-mail e SMS em dia configurável | P1 |
| E10 | Bloquear aprovação/impressão do espelho com batidas ímpares pendentes | P1 |
| E11 | Fechamento de competência com trava, tolerância de N dias após o período e permissão restrita ao administrador para reabrir | P0 |
| E12 | Reprocessamento individual e em massa por período/grupo | P0 |
| E13 | Log de abertura/fechamento (quem, quando) e status visível em relatório | P0 |
| E14 | **Registros brutos imutáveis** — nunca apagar marcação; alterações geram registro adicional com justificativa e autor | P0 |

### 10.5 Solicitações e aprovações

| # | Funcionalidade | Prioridade |
|---|---|---|
| S1 | Catálogo configurável de motivos de evento (abono, atestado, day off, licenças, falta justificada, casamento…) | P0 |
| S2 | Por motivo: efeito no cálculo, exigência de justificativa, de documento e de CID | P0 |
| S3 | Anexo de arquivo (foto do atestado) pelo app | P0 |
| S4 | Fluxo de aprovação configurável por motivo: gestor, RH, automático | P0 |
| S5 | **Alçadas múltiplas** (gestor direto → gestor do gestor → RH) com prazo e fallback aprovar/reprovar | P1 |
| S6 | **Delegação de aprovador** (ausência/férias do gestor) — lacuna do mercado | P1 (diferencial) |
| S7 | Exigir aprovação de eventos lançados pelo próprio administrador (segregação de funções) | P1 |
| S8 | Central única de aprovações com abas por tipo e indicadores por subtipo | P1 |
| S9 | Aprovação/reprovação em lote | P1 |
| S10 | Férias com período aquisitivo, saldo, parcelamento, venda de 1/3, adiantamento do 13º, aviso de 30 dias e alerta de vencimento | P1 |
| S11 | Troca de escala/turno solicitada pelo colaborador com validação automática contra as regras legais | P2 |
| S12 | Autorização prévia de hora extra | P2 |

### 10.6 Tempo real e alertas

| # | Funcionalidade | Prioridade |
|---|---|---|
| T1 | Painel "quem bateu / quem não bateu" no dia, com filtro por área | P0 |
| T2 | Painel de pendências (batidas ímpares, justificativas em aberto, espelhos não assinados) | P0 |
| T3 | Mapa das marcações do período | P1 |
| T4 | Galeria de selfies do período | P2 |
| T5 | Indicadores de absenteísmo e aderência à escala | P1 |
| T6 | Alerta de risco de hora extra ao gestor **antes** do fim do mês | P1 |
| T7 | Alerta de intrajornada/interjornada não cumprida, com ação de aprovar a infração ou notificar o colaborador | P1 |
| T8 | Lembrete de marcação configurável **pelo colaborador** | P2 |
| T9 | Relatórios agendados por e-mail com periodicidade e destinatários | P2 |
| T10 | Canais: push, e-mail, SMS, WhatsApp | P1 |

### 10.7 Compliance e integrações

| # | Funcionalidade | Prioridade |
|---|---|---|
| L1 | Registro do programa no **INPI** (requisito para operar como REP-P) | P0 |
| L2 | ARP com redundância e alta disponibilidade | P0 |
| L3 | **NSR sequencial por estabelecimento** (CNPJ/CPF), iniciando em 1, append-only | P0 |
| L4 | Hash **SHA-256** por marcação | P0 |
| L5 | Geração do **AFD** conforme Anexo V, com CRC-16/KERMIT e assinatura **CAdES** em `.p7s` destacado + linha `ASSINATURA_DIGITAL_EM_ARQUIVO_P7S` | P0 |
| L6 | Geração do **AEJ** (Anexo VI, XML) com `durJornada` em minutos e assinatura CAdES | P0 |
| L7 | **Comprovante de Registro de Ponto** com os 9 campos do art. 79, em PDF assinado em **PAdES**, acessível ao colaborador após cada marcação e extraível para as últimas 48h no mínimo | P0 |
| L8 | Certificado **ICP-Brasil** do desenvolvedor para assinar AFD/AEJ/comprovantes | P0 |
| L9 | **Atestado Técnico e Termo de Responsabilidade** por empresa cliente (Anexo VII) | P0 |
| L10 | Relógio digital com hora, minuto e segundo visível no ato da marcação | P0 |
| L11 | Retenção mínima de 5 anos + rotina de expurgo documentada e automatizada | P0 |
| L12 | Base legal e termos de LGPD para biometria, com alternativa não biométrica | P0 |
| L13 | Exportação para folha por layouts pré-configurados + construtor de layout personalizado com códigos contábeis/rubricas obrigatórios | P0 |
| L14 | Configuração de códigos contábeis por evento (falta, atraso, adicional noturno, DSR descontado, saldo BH positivo/negativo, horas trabalhadas) | P0 |
| L15 | Sobreposição de configuração por grupo/colaborador com **prioridade numérica** | P2 |
| L16 | API REST pública (marcações, eventos, escalas, verbas, colaboradores) com autenticação por token | P1 |
| L17 | Webhooks por evento | P1 |
| L18 | SSO (SAML/OIDC) | P2 |
| L19 | Importação/exportação de colaboradores e escalas por CSV com layout customizável | P1 |
| L20 | Multiempresa/multi-CNPJ e escopo de permissão por localização/filial | P1 |
| L21 | Perfis de acesso (Administrador, Gestor, Auditor somente-leitura) e política de senha (expiração, complexidade) | P1 |
| L22 | Trilha de auditoria de acesso (usuário, IP, páginas/ações, período) | P1 |

---

## 11. Lacunas e pontos marcados como não confirmados

Itens que o pedido cobria e que **não foi possível confirmar publicamente**:

1. **Detecção de fake GPS/mock location** — não documentada por Flash, Pontomais, Sólides, Ahgora, Oitchau, Sesame, Senior nem TOTVS. Confirmada apenas em Pontotel e Registro Ponto, ambos fora do escopo pedido.
2. **Liveness/prova de vida** — a Flash declara explicitamente que **não tem** no Flash Tablet. Os demais não mencionam. Confirmada apenas em Otimiza (fora do escopo).
3. **Registro de ponto por SMS** — não confirmado em nenhum fornecedor. SMS aparece apenas como canal de notificação (Flash).
4. **Delegação de aprovador** — não confirmada em nenhum dos nove.
5. **"Escala espanhola"** — nenhum fornecedor usa esse termo publicamente; todos suportariam via escala customizada por ciclo de dias.
6. **Home office como *tipo de solicitação*** — nenhum fornecedor documenta um fluxo específico "solicitar home office"; o tratamento é por local de trabalho/geocerca ou por tipo de evento genérico.
7. **Lista de sistemas de folha suportados pela Flash** — não publicada.
8. **API da Sólides** — endpoints encontrados apenas em fonte secundária.
9. **Webhooks e SSO** na maioria dos fornecedores — só Pontomais e Sesame confirmam webhooks; só Ahgora menciona SSO.
10. **Preço por colaborador** de Flash, Ahgora/TOTVS, Sesame, Senior, Oitchau, Sólides e Pontomais (valor exato) — todos sob consulta; os números citados em comparativos são inconsistentes entre si.
11. **Eventos do eSocial enviados pelo produto de ponto** — nenhum dos fornecedores de ponto transmite; a transmissão é sempre responsabilidade da folha.

---

## 12. Fontes consultadas

### Flash
- https://flashapp.com.br/gestao-de-pessoas/controle-de-jornada
- https://flashapp.com.br/gestao-de-pessoas
- https://flashapp.com.br/plataforma
- https://flashapp.com.br/blog/gestao-360-flash
- https://flashapp.com.br/blog/controle-ponto-digital
- https://flashapp.com.br/blog/controle-de-jornada-de-trabalho
- https://flashapp.com.br/blog/lei-do-ponto-eletronico
- https://flashapp.com.br/blog/folha-de-pagamento-automatizada
- https://docs.api.flashapp.services/api/controle-de-jornada
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-configurar-uma-regra-de-marcacao-de-ponto-na-flash-NlYb78Aa9m/Steps/4949290
- https://faq.flashapp.com.br/kb/guide/pt-BR/o-que-e-trava-de-localizacao-para-marcacao-de-ponto-inQDXerT1Z/Steps/4718650
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-configurar-local-de-trabalho-yhxjMns2er/Steps/4718717
- https://faq.flashapp.com.br/kb/guide/pt-BR/o-que-e-e-como-funciona-o-aplicativo-flash-tablet-xNNKHhRx43/Steps/4946885
- https://faq.flashapp.com.br/kb/guide/pt-BR/quais-sao-as-configuracoes-gerais-na-regra-de-apuracao-folhaflash-yziJwXL94t/Steps/5813080
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-regra-de-calculo-sem-banco-de-horas-na-flash-4CzMJjdhbf/Steps/5072003
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-regra-de-calculo-com-banco-de-horas-na-flash-95XFutWdvM/Steps/5123668
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-configurar-o-banco-de-horas-no-folhaflash-NG8TvbSuI5/Steps/5813626
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-configurar-banco-de-folga-no-folhaflash-UK2v3Di6oB/Steps/5846075
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-configurar-uma-regra-de-espelho-de-ponto-no-folhaflash-54ug1erbjy/Steps/5808773
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-uma-regra-de-gestao-de-escala-na-flash-2WX8GulA6B/Steps/5862586
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-uma-regra-de-condicoes-de-trabalho-na-flash-pcyioiBvGB/Steps/5864743
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-ver-e-editar-as-escalas-de-trabalho-LD3kOeAS5K/Steps/4578727
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-habilitar-e-lancar-o-sobreaviso-na-flash-eLDRFvnnVQ/Steps/5819401
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-lancar-um-evento-ou-atestado-na-flash-mMQuIesmpt/Steps/4197774
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-criar-e-consultar-motivos-de-evento-na-flash-X1wnsNZun1/Steps/4197871
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-solicitar-e-acompanhar-as-ferias-n8J9kJxOqN/Steps/5009200
- https://faq.flashapp.com.br/kb/guide/pt-BR/o-que-sao-aprovacoes-em-controle-de-jornada-GLL62khdRf/Steps/4197877
- https://faq.flashapp.com.br/kb/guide/pt-BR/como-realizar-o-fechamento-de-espelho-da-minha-equipe-yZj5dRLpWb/Steps/4197873
- https://faq.flashapp.com.br/kb/guide/pt-BR/quais-sao-os-principais-relatorios-para-pessoas-eWF7EE5B4Z/Steps/4812858
- https://apps.apple.com/br/app/folha-flash/id1147765593
- https://play.google.com/store/apps/details?hl=pt&id=com.muttuo.folhacerta

### Pontomais / VR
- https://www.vr.com.br/controle-de-ponto
- https://materiais.vr.com.br/central-de-ajuda/turnos-horarios-de-trabalho-configure-o-tipo-de-turno-ideal-para-seus-colaboradores/
- https://materiais.vr.com.br/central-de-ajuda/modulo-escala-o-que-e-e-como-iniciar-as-configuracoes/
- https://materiais.vr.com.br/central-de-ajuda/configuracao-da-tolerancia-aprenda-aqui-como-configurar-a-tolerancia-o-que-e-como-configurar-e-como-funciona/
- https://materiais.vr.com.br/central-de-ajuda/configuracao-do-banco-de-horas-como-habilitar-configurar-e-etc/
- https://materiais.vr.com.br/central-de-ajuda/configuracao-de-controle-de-ponto-avancada/
- https://materiais.vr.com.br/central-de-ajuda/exportacao-para-folha-de-pagamento/
- https://materiais.vr.com.br/central-de-ajuda/extensao-api/
- https://materiais.vr.com.br/central-de-ajuda/extensao-ponto-por-whatsapp-o-que-e-como-funciona-e-como-bater-ponto-por-whatsapp/
- https://documenter.getpostman.com/view/4785048/RWMCvVxN
- https://play.google.com/store/apps/details?hl=pt_BR&id=br.com.pontomais.v2
- https://play.google.com/store/apps/details?id=com.pontomais.pontomaishappy
- https://apps.apple.com/us/app/pontomais-2-0/id1536651077
- https://ajuda.consistem.com.br/consistem-integracoes/areas-de-negocio/rh/pontomais
- https://aprendo.iob.com.br/ajudaonline/artigo.aspx?artigo=14653
- https://controlgestao.com.br/pontomais/
- https://blog.b2bstack.com.br/pontomais/

### Sólides / Tangerino
- https://solides.com.br/controle-de-ponto-digital/
- https://solides.com.br/blog/solides-controle-de-ponto/
- https://solides.com.br/blog/aplicativo-de-ponto-eletronico-solides/
- https://solides.com.br/blog/integracao-ponto-e-folha-de-pagamento/
- https://solides.com.br/blog/rep-p/
- https://solides.com.br/folha-de-pagamento-digital/
- https://ajuda.solides.com.br/hc/pt-br/articles/25327971456525-Como-bater-ponto-na-S%C3%B3lides
- https://ajuda.solides.com.br/hc/pt-br/articles/25357880793357-Como-ativar-registro-de-ponto-com-reconhecimento-facial-PRO-na-S%C3%B3lides
- https://querobolsa.com.br/revista/tangerino

### Ahgora / TOTVS
- https://www.totvs.com/rh/ponto-eletronico/
- https://pdfcoffee.com/manual-de-configuracao-e-uso-pontoweb-pdf-free.html (Manual de Configuração e Uso PontoWEB — Ahgora)
- https://www.globalgcs.com.br/rh-e-capital-humano/suites-de-rh-totvs/ahgora
- https://ceosistema.com.br/registro-de-ponto-com-ahgora-multi/
- https://www.primeponto.com.br/multi
- https://centraldeatendimento.totvs.com/hc/pt-br/articles/36554893220631
- https://tdn.totvs.com/pages/viewpage.action?pageId=867821195
- https://tdn.totvs.com/plugins/viewsource/viewpagesrc.action?pageId=861547561
- https://centraldeatendimento.totvs.com/hc/pt-br/articles/23480663581079
- https://weepulse.com.br/blog/rm-chronus-guia-gestao-ponto-jornada/
- https://datasix.com.br/product/rm-chronus-automacao-de-ponto/
- https://espacolegislacao.totvs.com/portaria-671/

### Senior
- https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/manual-processos/relacoes-trabalhistas/controle-de-ponto/controle-de-ponto.htm
- https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/ronda/controle-de-ponto-e-refeitorio.htm
- https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/manual-processos/relacoes-trabalhistas/gestao-do-ponto/gestao-do-ponto.htm
- https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/ronda/fr060dap.htm
- https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/hcm/gestao-de-departamento-pessoal/movimentacoes/escala-e-horarios/
- https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/hcm/marcacao-de-ponto/faq-marcacao-de-ponto/
- https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/hcm/marcacao-de-ponto/implantacao/
- https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/hcm/marcacao-de-ponto/senior-x-platform/configuracoes-gerais-tela-de-configuracoes/
- https://apps.apple.com/at/app/ponto-m%C3%BAltiplo-senior-hcm/id6741811991
- https://store.senior.com.br/integracao-modulo-hcm-com-oitchau/p

### Oitchau
- https://www.oitchau.com.br/
- https://www.oitchau.com.br/features/punching/
- https://www.oitchau.com.br/features/facial-recognition/
- https://www.oitchau.com.br/features/schedules/
- https://www.oitchau.com.br/features/banco-de-horas/
- https://www.oitchau.com.br/features/vacations/
- https://www.oitchau.com.br/pricing/
- https://www.oitchau.com.br/integrations/
- https://www.oitchau.com.br/integrations/sap/
- https://www.oitchau.com.br/integrations/lg/
- https://www.oitchau.com.br/blog/controle-de-ponto-com-validacao-antifraude/
- https://www.oitchau.com.br/blog/case-de-sucesso-tiktok/
- https://support.day.io/hc/pt-br/articles/14825829464343

### Sesame HR
- https://www.sesamehr.com.br/
- https://www.sesamehr.com.br/sistema-controle-ponto/
- https://www.sesamehr.com.br/sistema-registro-ponto-whatsapp/
- https://www.sesamehr.com.br/software-gestao-escalas-trabalho/
- https://www.sesamehr.com.br/empresas-grande-porte/
- https://www.sesamehr.com.br/blog/controle-de-ponto/software-de-controle-de-ponto/
- https://help.sesamehr.com/pt_BR/turnos-nova-versao/conheca-turnos-br
- https://help.sesamehr.com/pt_BR/automacoes/como-criar-fluxo-de-aprovacao
- https://help.sesamehr.com/pt_BR/sesame-whatsapp/configurar-e-ativar-a-geolocalizacao-para-o-sesame-whatsapp
- https://help.sesamehr.com/pt_PT/registos-de-ponto/onde-configurar-a-localizacao-para-poder-registar-ponto

### Convenia / Gupy / TiqueTaque
- https://www.convenia.com.br/departamento-pessoal
- https://www.convenia.com.br/planos-convenia
- https://blog.b2bstack.com.br/convenia-rh-guia/
- https://quarkrh.com.br/blog/quarkrh-vs-convenia-qual-sistema-escolher/ (fonte secundária, concorrente)
- https://www.gupy.io/blog/ponto-digital
- https://www.gupy.io/blog/controle-ponto
- https://www.gupy.io/blog/repp
- https://tiquetaque.com/
- https://tiquetaque.com/sistema-admin/
- https://tiquetaque.com/planos-e-precos/
- https://tiquetaque.com/blog/controle-de-ponto-digital-conheca-as-vantagens-da-tiquetaque/

### Legislação e compliance
- https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/fiscalizacao-do-trabalho/Perguntas%20e%20Respostas%20REP (Perguntas e Respostas oficiais do MTE sobre a Portaria 671/2021)
- https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/legislacao/portarias-1/portarias-vigentes-3/PDFPortarian671de8denovembrode2021compilada26.09.2024.pdf (texto compilado)
- https://www.normaslegais.com.br/legislacao/portaria-mtp-671-2021.htm
- https://www.normaslegais.com.br/legislacao/portaria-mtp-1255-2022.htm
- https://espacolegislacao.totvs.com/portaria-671/
- https://genyo.com.br/portaria-671-mtp-comentada/
- https://suporte.topponto.com.br/duvida/novidades-referente-a-portaria-671/
- https://useponto.com.br/blog/guia-pratico-portaria-671-2021
- https://alltec.com.br/blog/esocial-controle-de-ponto-integracao-passo-a-passo.html
- https://impactotecnologia.com.br/blog/controle-de-ponto-erros-esocial-multas/
- https://www.letswork.com.br/blog/integracao-entre-sistema-de-ponto-e-esocial-o-que-e-e-o-que-nao-e-obrigatorio-hoje/
- https://blog.fortestecnologia.com.br/post/como-funciona-banco-de-horas-no-esocial
- https://www.dape.com.br/lernoticia.aspx?id=8996
- https://www.idstore.com.br/blog/lgpd-ponto-eletronico-dados-biometricos
- https://www.rwtech.com.br/blog/lgpd-e-biometrial-facial-no-relogio-de-ponto/
- https://plataforma.valid.com/blog/lgpd-e-dado-biometrico-na-pratica
- https://otimizapro.com/artigo-biometria-facial-ponto-lgpd
- https://www.addtime.com.br/blog/biometria-lgpd-controle-de-ponto/

### Comparativos e precificação (fontes secundárias)
- https://otimizapro.com/artigo-melhor-ponto-eletronico-empresa
- https://www.kickidler.com/br/info/melhores-sistemas-de-folha-de-ponto
- https://www.compararsoftware.com.br/gestao-de-recursos-humanos/articulos/pontomais-avaliacao-alternativas-2026
- https://www.tagguirh.com.br/tagguirh-vs-ahgora
- https://qualsoftware.com.br/software/pontomais/
- https://www.pontotel.com.br/solucoes/registro-de-ponto/ (referência de antifraude fora do escopo)
- https://registroponto.com.br/segmento-equipes-externas (referência de fake GPS fora do escopo)
