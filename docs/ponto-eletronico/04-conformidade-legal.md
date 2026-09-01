# 04 — Conformidade legal

Resumo do que a lei exige de um software de ponto eletrônico no Brasil, na
forma que interessa a quem vai implementar. As fontes primárias são o texto da
Portaria MTP 671/2021, os leiautes publicados pelo MTE no portal gov.br, a CLT
compilada e as decisões do STF e do TST citadas.

## 1. Os três tipos de REP, e por que o REP-P é o caminho

A Portaria MTP 671/2021 (Decreto 10.854/2021), em vigor desde 10/02/2022,
revogou as Portarias 1.510/2009 e 373/2011 e definiu três sistemas:

| | REP-C | REP-A | REP-P |
|---|---|---|---|
| Natureza | Equipamento monolítico | Conjunto de equipamentos e/ou programas | **Software** em servidor ou nuvem |
| Autorização | Certificado INMETRO + registro do modelo no Ministério | Depende de convenção ou acordo coletivo | Registro de programa no **INPI** |
| Homologação no MTE | Sim | Não | **Não** |
| Norma coletiva | Não exigida | **Exigida**, vedada ultratividade | **Não exigida** |
| Base | Art. 76 | Art. 77 | Art. 78 |

A assimetria é o que torna o REP-P viável para um SaaS: ele **não** exige acordo
coletivo nem homologação ministerial. Exige registro no INPI (art. 91) e
cumprimento do Anexo IX.

## 2. O Anexo IX — requisitos técnicos do REP-P

Treze itens, na redação dada pela Portaria 1.486/2022. Os que mais influenciam a
arquitetura:

- **Relógio sincronizado com a Hora Legal Brasileira** do Observatório Nacional,
  variação máxima de **30 segundos** (item 2).
- Todo coletor exibe relógio **não-analógico** com horas, minutos e segundos no
  momento da marcação (item 3).
- Marcações vêm de coletor **on-line**, podendo **excepcionalmente** estar
  off-line (item 4), com envio no primeiro momento em que voltar a ficar on-line
  (item 5).
- **ARP** — Armazenamento de Registro de Ponto — com redundância, alta
  disponibilidade e confiabilidade (item 6). Devem ser gravados na ARP, com data,
  hora e responsável: alteração de dados do empregador; ajuste de relógio (com
  hora antes e depois); inclusão, alteração e exclusão de empregado; eventos
  sensíveis do REP; e a marcação de ponto.
- **NSR por estabelecimento**: cada estabelecimento (CNPJ de 14 posições ou CPF
  de 11) tem sua própria sequência, incremento unitário, iniciando em 1 na
  primeira operação do REP naquele estabelecimento (obs. do item 6).
- **Os dados na ARP não podem ser apagados nem alterados**, direta ou
  indiretamente, pelo prazo mínimo legal (item 7).
- O registro de marcação na ARP consiste em: NSR, CPF, data e horário da marcação
  (com fuso), data e horário da gravação (com fuso), identificação do coletor e
  hash SHA-256 (item 10).
- Gerar o AFD a partir da ARP, **para intervalo temporal determinado** — o AFD do
  REP-P pode ser fracionado, ao contrário do REP-C (itens 11 e 12).

## 3. As vedações do art. 74 — o que o software não pode fazer

Este artigo derruba mais projetos do que qualquer outro. É vedado:

1. **Restrições de horário à marcação.**
2. **Marcação automática** usando horários predeterminados ou o horário
   contratual (não se confunde com o ponto por exceção do art. 74, §4º da CLT).
3. **Exigência pelo sistema de autorização prévia** para marcação de sobrejornada.
4. **Qualquer dispositivo que permita a alteração dos dados registrados pelo
   empregado.**

A lista é exemplificativa, não taxativa. Consequências práticas de projeto:

- Geocerca **sinaliza, nunca bloqueia**.
- Não existe "arredondar a marcação" na gravação. A tolerância do art. 58, §1º da
  CLT é aplicada **na apuração**, com o original preservado.
- Não existe endpoint que altere uma marcação. Correção é marcação nova ou
  marcação desconsiderada com motivo.
- O art. 98 prevê apreensão de documentos e equipamentos, e cópia de programas e
  dados, quando se comprova adulteração ou a existência de rotinas,
  parametrizações ou bloqueios que a permitam.

## 4. AFD — o arquivo que o fiscal pede

Texto ASCII ISO 8859-1, campo fixo por posição (sem delimitador), linhas
terminadas em CR+LF, ordenadas por NSR. Datas em `AAAA-MM-dd`; data e hora em
`AAAA-MM-ddThh:mm:00ZZZZZ`, com **segundos fixos em "00"** e fuso com sinal e 4
dígitos.

**Atenção à fonte:** o layout **não está mais na Portaria**. O Anexo V foi
revogado pela Portaria 1.486/2022 e o art. 81 hoje remete às "especificações
disponíveis no portal gov.br". Material de fornecedor que cita "Anexo V" está
desatualizado. A versão vigente do leiaute é a **`004`**, republicada em
31/07/2026 — a mudança em relação à `003` foi tornar os campos de CNPJ/CPF
**alfanuméricos**, adaptação ao CNPJ alfanumérico da IN RFB 2.229/2024, cujo
primeiro número foi emitido na mesma data. **Consequência direta: armazenar CNPJ
como `VARCHAR(14)`, nunca como inteiro.**

Registros e o que cada um significa para o REP-P:

| Tipo | Conteúdo | Tam. | Usar em REP-P? |
|---|---|---|---|
| 1 | Cabeçalho | 302 | Sim — campo 7 recebe o nº do INPI, campo 11 a versão `004` |
| 2 | Inclusão/alteração da identificação da empresa | 331 | Sim |
| 3 | Marcação de ponto (REP-C e REP-A) | 50 | **Não** |
| 4 | Ajuste do relógio | 73 | Sim |
| 5 | Inclusão, alteração ou exclusão de empregado | 118 | Sim |
| 6 | Eventos sensíveis | 36 | Sim — códigos `07` disponibilidade e `08` indisponibilidade de serviço |
| **7** | **Marcação de ponto (REP-P)** | **137** | **Sim — é o registro central** |
| 9 | Trailer com as contagens | 64 | Sim |

O registro tipo 7, campo a campo:

| # | Posição | Tam. | Tipo | Conteúdo |
|---|---|---|---|---|
| 1 | 001-009 | 9 | N | NSR |
| 2 | 010-010 | 1 | N | `"7"` |
| 3 | 011-034 | 24 | DH | Data e hora **da marcação** |
| 4 | 035-046 | 12 | N | CPF do empregado |
| 5 | 047-070 | 24 | DH | Data e hora **da gravação** |
| 6 | 071-072 | 2 | N | Coletor: `01` app mobile, `02` browser, `03` app desktop, `04` dispositivo eletrônico, `05` outro |
| 7 | 073-073 | 1 | N | `"0"` on-line, `"1"` off-line |
| 8 | 074-137 | 64 | A | Hash SHA-256 |

**O hash é encadeado.** O SHA-256 do campo 8 é calculado sobre NSR, tipo do
registro, data e hora da marcação, CPF, data e hora da gravação, identificador do
coletor, indicador on-line/off-line **e o hash do registro anterior, caso
exista**. Adulterar uma marcação invalida todas as posteriores. Não pode ser
implementado como hash isolado por linha.

Uma ambiguidade real da norma a registrar: o leiaute **não especifica separador,
encoding nem normalização** entre os oito componentes concatenados, e o MTE nunca
publicou o manual técnico do desenvolvedor que resolveria isso. Implementações
divergem. A decisão precisa ser documentada e mantida estável, porque mudá-la
depois invalida a cadeia inteira.

Outros detalhes que geram bug: os registros tipo 1 a 5 gravam **CRC-16
CCITT-TRUE (KERMIT)** em hexadecimal sem `0x` — o vetor de teste oficial é
`123456789` → `2189`; o tipo 6 não tem CRC; no tipo 9 o identificador de tipo
fica na **última** posição, não na 10ª; e o CPF ocupa 12 posições nos tipos 3, 5
e 7 mas 11 no tipo 4 (resíduo do antigo campo PIS).

A última linha do arquivo tem 100 caracteres com o literal
`ASSINATURA_DIGITAL_EM_ARQUIVO_P7S` completado com espaços. A assinatura real vai
num arquivo **CAdES `.p7s` destacado**, com o nome do AFD acrescido de `.p7s`.
Nomenclatura do AFD para REP-P: `AFD` + número do INPI + CNPJ/CPF do empregador
+ `REP_P`. O número do INPI entra só com os dígitos: `BR 51 2022 XXXXXX-Y` vira
`512022XXXXXXY`.

## 5. AEJ — onde vivem os ajustes

Gerado pelo **PTRP** (Programa de Tratamento de Registro de Ponto), não pelo REP.
Exigido independentemente do tipo de REP. Versão vigente do leiaute: **`002`**.

**Não é XML** — é texto ASCII ISO 8859-1 com campos **delimitados por pipe
(`|`)**, tamanhos frequentemente variáveis. Registros: `01` cabeçalho, `02` REPs
utilizados, `03` vínculos, `04` horário contratual, `05` marcações, `06`
matrícula eSocial, `07` ausências e banco de horas, `08` identificação do PTRP,
`99` trailer, mais a linha de assinatura.

O registro `05` é o que carrega o modelo de dados do módulo. Campos: vínculo,
data e hora da marcação, REP de origem, `tpMarc` (`E` entrada, `S` saída, **`D`
desconsiderada**), sequência, `codHorContratual`, `motivo` — e o decisivo:

**`fonteMarc`**: `O` original do REP, `I` incluída manualmente, `P`
pré-assinalada, `X` incluída com horário predefinido para ponto por exceção, `T`
outras fontes. O `motivo` é **obrigatório** quando `tpMarc = "D"` ou
`fonteMarc = "I"`.

O art. 82, parágrafo único delimita o tratamento: ele "se limitará a acrescentar
informações para complementar eventuais omissões no registro de ponto, inclusive
ausências e movimentações do banco de horas, ou indicar marcações indevidas".
**O AFD é imutável; o AEJ é onde vivem os ajustes, com rastreabilidade.** Essa
separação é a espinha dorsal do modelo de dados em
[05](05-modelo-de-dados.md).

O PTRP não precisa de homologação e **não pode gerar o AFD** para efeitos fiscais
— só o REP pode. O AFDT e o ACJEF da Portaria 1.510/2009 foram **extintos**,
substituídos pelo AEJ, com prazo final de adequação em 11/01/2023.

## 6. Comprovante e espelho de ponto

**Comprovante de Registro de Ponto do Trabalhador** (arts. 79 e 80). Nove campos
mínimos: título literal, NSR, identificação do empregador (nome, CNPJ/CPF e
CEI/CAEPF/CNO), local da prestação ou endereço do estabelecimento de vínculo,
identificação do trabalhador (nome e CPF), data e horário do registro, número do
INPI (no REP-P), **hash SHA-256 da marcação** (exclusivo do REP-P) e assinatura
eletrônica quando impresso.

Sendo eletrônico: **PDF assinado** (PAdES), disponibilizado **após cada
marcação, independentemente de prévia solicitação e autorização**, com
possibilidade de o trabalhador extrair os comprovantes das **últimas 48 horas**.

**Espelho de Ponto** (art. 84). Mínimo: identificação de empregador e trabalhador
com **data de admissão e cargo**, período e data de emissão, **horário e jornada
contratual**, as marcações do REP **e** as marcações tratadas (incluídas,
desconsideradas e pré-assinaladas), e a duração das jornadas realizadas
**considerando o horário noturno reduzido**. Acesso mensal garantido ao
trabalhador.

## 7. Regras de cálculo — CLT

| Tema | Regra | Artigo |
|---|---|---|
| Tolerância | 5 min por marcação, máximo 10 min/dia, **nos dois sentidos** | 58, §1º |
| Deslocamento | Residência–trabalho não é jornada, mesmo em transporte da empresa | 58, §2º |
| Tempo à disposição | Não conta o excedente quando o empregado permanece **por escolha própria** (proteção pessoal, alimentação, estudo, higiene) | 4º, §2º |
| Hora extra | Até 2h/dia; até 4h para motorista por norma coletiva; mínimo **+50%** | 59; 235-C |
| Banco de horas | **12 meses** por norma coletiva; **6 meses** por acordo individual escrito; **mesmo mês** por acordo tácito | 59, §§2º, 5º e 6º |
| 12x36 | Acordo individual escrito basta; DSR e **feriados já compensados**; prorrogação noturna compensada | 59-A |
| Interjornada | **11h** consecutivas entre jornadas | 66 |
| DSR | 24h consecutivas, coincidindo com domingo; perdido por falta ou atraso injustificado | 67; Lei 605/1949, art. 6º |
| Intrajornada | >6h: 1h a 2h. Entre 4h e 6h: 15 min. Não computado na jornada | 71, caput, §§1º e 2º |
| Intrajornada suprimida | Paga-se **apenas o período suprimido**, +50%, natureza **indenizatória** | 71, §4º |
| Adicional noturno | **20%**, período 22h–5h, hora reduzida de **52min30s** (fator 60/52,5) | 73 |
| Prorrogação noturna | Adicional devido também após as 5h | 73, §5º; Súmula 60, II |
| Registro obrigatório | Estabelecimentos com **mais de 20** trabalhadores | 74, §2º |
| Ponto por exceção | Permitido por acordo individual escrito, CCT ou ACT | 74, §4º |
| Feriado trabalhado | **Dobra** quando não compensado com folga | Lei 605/1949, art. 9º; Súmula 146 |
| Fora do controle | Atividade externa incompatível; cargo de gestão com +40%; teletrabalho por produção | 62, I, II e III |

## 8. Motorista profissional — e o corte de 12/07/2023

A **ADI 5322** do STF derrubou 11 dispositivos da Lei 13.103/2015, com
**modulação de efeitos a partir de 12/07/2023** (trânsito em julgado em
08/11/2024). O motor de cálculo precisa manter **dois conjuntos de regras por
vigência**.

O que caiu, e importa para o cálculo:

- **Tempo de espera** (art. 235-C, §8º e §9º): a exclusão da jornada é
  inconstitucional. Até 11/07/2023, ficava fora da jornada e era indenizado a
  **30%** do salário-hora. De 12/07/2023 em diante, **integra a jornada** e gera
  hora extra no que exceder. O §9º foi anulado **sem efeito repristinatório** —
  não volta a regra anterior.
- **Movimentações do veículo durante a espera** (§12): passam a ser tempo de
  trabalho.
- **Fracionamento da interjornada** (§3º, parte final): caiu. São 11h contínuas.
- **Descanso com o veículo em movimento** (arts. 235-D, §5º e 235-E, III): caiu.
  Com dupla de motoristas, o tempo de quem não conduz virou **área cinzenta** —
  as soluções em uso são computar como jornada ou aplicar um "tempo de reserva"
  de 30% por norma coletiva. Não há tese vinculante; deve ser parâmetro
  configurável.
- **Fracionamento e cumulação do repouso semanal** (art. 235-D, §§1º e 2º): caiu.

O que ficou de pé: art. 235-C, caput (até 4h extras por norma coletiva); §13
(jornada sem horário fixo de início, fim ou intervalos — por isso a apuração tem
de ser orientada por eventos, não por horário-padrão); art. 235-F (12x36 do
motorista **só por norma coletiva**); art. 71, §5º (intervalo reduzido no
transporte coletivo urbano); e os limites de tempo de direção do CTB art. 67-C.

Os limites de tempo de direção estão tabulados em
[03](03-diferenciais-jornada-motorista.md).

## 9. eSocial

Versão vigente do leiaute: **S-1.3** (Portaria Conjunta RFB/MPS/MTE nº 13/2024),
atualizada pela Nota Técnica S-1.3 nº 06/2026.

**Nenhum produto de ponto transmite eventos do eSocial** — isso é sempre
responsabilidade da folha. O ponto entrega os dados. Dois pontos de atenção
sobre eventos que material antigo ainda cita: o **S-1050** (Tabela de
Horários/Turnos) foi **extinto**, com o conteúdo migrado para o grupo
`horContratual` do S-2200 e S-2206; e o **S-2260** (convocação de intermitente)
também foi **extinto**, com os dias trabalhados indo em `infoInterm` do S-1200.

O que o módulo precisa exportar: horário contratual estruturado (`qtdHrsSem`,
`tpJornada`, `dscJorn`, `horNot`) e `tpRegJor`; horas normais e dias trabalhados;
horas extras segregadas por percentual; horas noturnas já convertidas pela hora
reduzida, com a prorrogação separada; DSR perdidos e feriados trabalhados com e
sem compensação; minutos de intervalo suprimido; movimentações e saldo do banco
de horas, inclusive o saldo na rescisão (art. 59, §3º); faltas, atrasos e
afastamentos com datas (S-2230).

## 10. LGPD e retenção

Dado biométrico é **dado pessoal sensível** (art. 5º, II da LGPD), com
tratamento restrito ao art. 11. Implicações: consentimento específico e
destacado, **alternativa não biométrica obrigatória** para quem não consentir,
minimização (armazenar template, não a imagem, quando possível) e política de
eliminação.

**Prazo de guarda: a Portaria 671 não fixa um número de anos.** O Anexo IX, item
7 diz "pelo prazo mínimo legal", remetendo a outras normas. Afirmações de
"guarda mínima de 5 anos exigida pela Portaria 671" que circulam em blogs de
fornecedores não têm respaldo literal no texto — o número está certo, a fonte
citada está errada. O prazo vem da prescrição trabalhista: **5 anos**, até o
limite de **2 anos após a extinção do contrato** (CF art. 7º, XXIX e CLT art.
11). O gatilho de descarte é a rescisão + 2 anos, não "5 anos após a marcação".
Prática conservadora de mercado é 10 anos.

Obrigações de disponibilidade, essas expressas: AFD do REP-P **prontamente
gerado e entregue** ao Auditor-Fiscal quando solicitado (art. 81, §2º);
arquivos e relatórios do PTRP em prazo mínimo de **2 dias** (art. 85);
comprovantes das últimas **48 horas** ao trabalhador (art. 80); espelho de ponto
**mensal** (art. 84).

## 11. Onde a lei está em aberto — parametrizar, não decidir no código

A Resolução TST nº 225, de 30/06/2025, **cancelou as Súmulas 366, 429, 437, 444,
449 e a OJ 355** — todas de jornada. Isso reabriu questões que estavam pacificadas
por vinte anos. Cada item abaixo deve ser um parâmetro configurável com vigência,
não uma regra fixa:

1. **Tolerância excedida**: gera hora extra sobre **todo** o excedente (tese da
   antiga Súmula 366) ou **apenas** sobre o que passa da tolerância? Sem tese
   vinculante.
2. **Norma coletiva pode ampliar a tolerância** dos 5/10 min? O art. 611-A e o
   Tema 1046 do STF apontam para sim; a Súmula 449 que vedava foi cancelada.
3. **Interjornada violada** (art. 66): com a OJ 355 cancelada, não há regra de
   pagamento. Três correntes — período suprimido +50%, hora extra integral, ou
   apenas sanção administrativa.
4. **Tempo de espera do motorista**: além do corte de 12/07/2023, o §11 do art.
   235-C remete ao §9º anulado, gerando dúvida sobre contar espera longa como
   repouso.
5. **Dupla de motoristas**: sem norma definindo o tratamento do tempo de quem não
   conduz.
6. **12x36 do motorista**: art. 235-F exige norma coletiva, art. 59-A admite
   acordo individual. Prevalência da norma especial é a leitura mais segura.
7. **Ponto por exceção por acordo individual**: admitido pelo MTE no FAQ da
   Portaria 671, contestado por parte do MPT e da doutrina, com risco de reversão
   do ônus da prova pela Súmula 338.
8. **Art. 62, I com rastreador**: jurisprudência oscilante sobre quando o
   monitoramento eletrônico afasta a "incompatibilidade com a fixação de
   horário".

Nada disso deve virar `if` no código de apuração. Vira registro na tabela de
parâmetros, com vigência e trilha de auditoria de quem configurou.
