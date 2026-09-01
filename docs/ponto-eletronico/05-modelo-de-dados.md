# 05 — Modelo de dados

Proposta de tabelas, com o raciocínio de cada decisão. O DDL segue as convenções
do projeto: `snake_case` em português, `empresa_id` em toda tabela de negócio,
InnoDB e `utf8mb4`, criação por migração idempotente em
`backend/scripts/migrate-schema.js`.

## O princípio que organiza tudo

A Portaria 671 impõe uma separação que o modelo tem de refletir literalmente:

```
Marcação original (ARP)  →  imutável, append-only, hash encadeado  →  AFD
        ↓
Tratamento (PTRP)        →  ajustes, inclusões, desconsiderações    →  AEJ
        ↓
Apuração                 →  totais calculados, recalculáveis        →  Espelho / Folha
```

Três camadas, três conjuntos de tabelas. **Nunca um `UPDATE` na camada de
marcação.** Um ajuste de ponto é `INSERT` na camada de tratamento apontando para
a marcação original. A apuração é derivada e pode ser recalculada à vontade
porque não é fonte de verdade.

## Camada 0 — cadastros

### `ponto_estabelecimentos`

Resolve o bloqueio do NSR (ver [01](01-diagnostico-base-atual.md)). Uma empresa
pode ter várias filiais, cada uma com CNPJ e sequência própria de NSR.

```sql
CREATE TABLE ponto_estabelecimentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    base_id INT NULL,                          -- vínculo opcional com bases (roteirização)
    nome VARCHAR(150) NOT NULL,
    tipo_documento TINYINT NOT NULL DEFAULT 1, -- 1 CNPJ, 2 CPF
    documento VARCHAR(14) NOT NULL,            -- alfanumérico: CNPJ novo (IN RFB 2.229/2024)
    caepf VARCHAR(14) NULL,
    cno VARCHAR(12) NULL,
    endereco VARCHAR(100) NULL,                -- art. 79, IV do comprovante
    lat DECIMAL(10,8) NULL,
    lng DECIMAL(11,8) NULL,
    raio_geocerca_m INT NULL,
    nsr_atual INT UNSIGNED NOT NULL DEFAULT 0, -- sequência própria, inicia em 1
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL,
    UNIQUE KEY uk_pto_estab_doc (empresa_id, documento),
    KEY idx_pto_estab_emp (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`documento` é `VARCHAR(14)`, não `BIGINT`: a versão `004` do leiaute do AFD
tornou os campos de CNPJ alfanuméricos. Guardar como número quebra no primeiro
cliente com CNPJ alfanumérico.

### `ponto_colaboradores`

Vínculo empregatício, distinto de credencial de acesso. Referencia `motoristas`
ou `usuarios` sem se fundir a nenhuma das duas — o motorista tem login e vínculo,
o monitor escolar tem vínculo e talvez login, e o administrativo tem vínculo com
login de operador.

```sql
CREATE TABLE ponto_colaboradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    estabelecimento_id INT NOT NULL,
    motorista_id INT NULL,                     -- FK lógica para motoristas
    usuario_id INT NULL,                       -- FK lógica para usuarios
    nome VARCHAR(150) NOT NULL,
    cpf CHAR(11) NOT NULL,                     -- obrigatório: chave do AFD
    matricula VARCHAR(30) NULL,                -- matrícula eSocial (AEJ registro 06)
    cargo VARCHAR(80) NULL,                    -- exigido no espelho (art. 84)
    admissao DATE NOT NULL,
    desligamento DATE NULL,
    tipo_regime_jornada TINYINT NOT NULL DEFAULT 1, -- tpRegJor eSocial: 1,2,3,4
    categoria VARCHAR(30) NOT NULL DEFAULT 'geral', -- geral | motorista_carga | motorista_passageiro | monitor
    escala_id INT NULL,
    criado_em DATETIME NOT NULL,
    UNIQUE KEY uk_pto_colab_cpf (empresa_id, cpf, admissao),
    KEY idx_pto_colab_estab (estabelecimento_id),
    KEY idx_pto_colab_mot (motorista_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`categoria` é o que liga o colaborador ao conjunto de regras aplicável: só
`motorista_carga` e `motorista_passageiro` recebem os limites do CTB art. 67-C,
e com parâmetros diferentes (30 min a cada 6h de condução para cargas, a cada 4h
para passageiros).

`tipo_regime_jornada` precisa existir desde o início porque um colaborador com
`tpRegJor` 2, 3 ou 4 (art. 62 da CLT) **não** tem apuração de hora extra — e
tentar apurar gera número errado e passivo por informação inconsistente com o
eSocial.

### `ponto_escalas` e `ponto_horarios_contratuais`

Duas tabelas, porque escala e horário são conceitos distintos: a escala é o ciclo
(5x2, 12x36, 6x1) e o horário é o desenho do dia (pares entrada/saída). Um
motorista escolar tem escala 5x2 com horário partido em dois blocos; um motorista
de carga pode ter escala 6x1 com horário variável.

```sql
CREATE TABLE ponto_escalas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nome VARCHAR(80) NOT NULL,
    tipo VARCHAR(20) NOT NULL,       -- 5x2 | 6x1 | 12x36 | 4x2 | rotativo | flexivel
    tipo_jornada_esocial TINYINT NULL, -- tpJornada: 2,3,4,5,6,7,9
    horas_semanais DECIMAL(5,2) NULL,  -- qtdHrsSem
    ciclo_dias SMALLINT NULL,
    data_referencia DATE NULL,         -- âncora do ciclo rotativo
    KEY idx_pto_escala_emp (empresa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ponto_horarios_contratuais (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    escala_id INT NULL,
    codigo VARCHAR(30) NOT NULL,       -- codHorContratual do AEJ
    descricao VARCHAR(150) NULL,       -- dscJorn do eSocial
    duracao_minutos SMALLINT NOT NULL, -- durJornada do AEJ, já com hora noturna reduzida
    horario_noturno TINYINT(1) NOT NULL DEFAULT 0,
    pares JSON NOT NULL,               -- [{"entrada":"07:00","saida":"11:00"}, ...]
    UNIQUE KEY uk_pto_hor_cod (empresa_id, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`pares` como JSON em vez de tabela filha: o AEJ aceita N pares
(`hrEntradaNN`/`hrSaidaNN`) e o conjunto é sempre lido e escrito inteiro, nunca
consultado par a par. Uma tabela filha aqui só adicionaria join sem ganho.

`duracao_minutos` já deve considerar a redução da hora noturna, conforme exige o
AEJ — não é a diferença simples entre entrada e saída.

## Camada 1 — marcações (ARP, imutável)

### `ponto_marcacoes`

O coração do módulo. **Só recebe `INSERT`.** Nenhuma rota da API deve emitir
`UPDATE` ou `DELETE` nesta tabela.

```sql
CREATE TABLE ponto_marcacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    estabelecimento_id INT NOT NULL,
    colaborador_id INT NOT NULL,
    cpf CHAR(11) NOT NULL,                  -- desnormalizado: o AFD é por CPF e o vínculo pode mudar
    nsr INT UNSIGNED NOT NULL,              -- sequencial POR estabelecimento
    marcada_em DATETIME NOT NULL,           -- campo 3 do registro tipo 7
    marcada_offset VARCHAR(6) NOT NULL,     -- fuso, ex. '-0300'
    gravada_em DATETIME NOT NULL,           -- campo 5 — diferente quando offline
    gravada_offset VARCHAR(6) NOT NULL,
    coletor TINYINT NOT NULL,               -- 01 app, 02 browser, 03 desktop, 04 dispositivo, 05 outro
    offline TINYINT(1) NOT NULL DEFAULT 0,  -- campo 7
    hash_sha256 CHAR(64) NOT NULL,          -- campo 8, encadeado
    hash_anterior CHAR(64) NULL,            -- elo da cadeia, explícito para auditoria
    UNIQUE KEY uk_pto_marc_nsr (estabelecimento_id, nsr),
    KEY idx_pto_marc_colab_data (colaborador_id, marcada_em),
    KEY idx_pto_marc_emp_data (empresa_id, marcada_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Decisões que merecem justificativa:

- **`cpf` desnormalizado.** O AFD é gerado por CPF e precisa ser reproduzível
  anos depois. Se o CPF vier por join com `ponto_colaboradores` e o cadastro for
  corrigido, o AFD regenerado sai diferente do original — e a cadeia de hash
  quebra. O CPF do momento da marcação é parte do registro.
- **`hash_anterior` explícito.** A norma pede só o hash próprio, mas guardar o elo
  torna a verificação da cadeia uma varredura simples em vez de uma reconstrução.
  Barato e vale muito numa fiscalização.
- **`marcada_em` e `gravada_em` separados**, cada um com seu offset. Numa marcação
  offline no túnel às 18h02 sincronizada às 18h40, o horário oficial é 18h02. Sem
  os dois campos, o registro tipo 7 não pode ser montado.
- **`nsr` único por estabelecimento**, não por empresa. É o que a norma manda e
  ignorar isso invalida o AFD de qualquer cliente com mais de uma filial.
- Sem coluna de "aprovado" ou "válido". Marcação não se valida, se registra.
  Qualquer juízo sobre ela vive na camada 2.

### `ponto_marcacoes_meta`

Metadados antifraude, separados porque não entram no AFD, mudam de formato com o
tempo e não devem inflar a tabela que precisa ser varrida para gerar arquivo
fiscal.

```sql
CREATE TABLE ponto_marcacoes_meta (
    marcacao_id BIGINT PRIMARY KEY,
    lat DECIMAL(10,8) NULL,
    lng DECIMAL(11,8) NULL,
    precisao_m DECIMAL(7,2) NULL,
    dentro_geocerca TINYINT(1) NULL,      -- NULL = não avaliado; 0 = fora, mas GRAVADO
    distancia_geocerca_m INT NULL,
    ip VARCHAR(45) NULL,
    dispositivo_id VARCHAR(64) NULL,
    sistema_operacional VARCHAR(40) NULL,
    timezone_dispositivo VARCHAR(40) NULL,
    desvio_relogio_s INT NULL,            -- relógio do device vs. servidor
    mock_location TINYINT(1) NULL,
    selfie_path VARCHAR(255) NULL,
    confianca VARCHAR(20) NULL            -- confiavel | atencao | suspeita
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`dentro_geocerca = 0` **não impede a gravação**. É informação para o gestor
tratar, nunca trava. O art. 74, I da Portaria 671 proíbe restrição à marcação.

`confianca` como classificação em vez de booleano segue o modelo da Oitchau
descrito no [anexo de mercado](90-anexo-pesquisa-mercado.md): a marcação recebe
um status numa máquina de estados, e não um veredicto de aceita ou rejeitada.

### `ponto_eventos_arp`

Alimenta os registros tipo 2, 4, 5 e 6 do AFD e cumpre o Anexo IX, item 6.
Substitui o `logAudit()` que hoje só escreve em `console.info`.

```sql
CREATE TABLE ponto_eventos_arp (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    estabelecimento_id INT NOT NULL,
    nsr INT UNSIGNED NOT NULL,
    tipo_registro TINYINT NOT NULL,     -- 2, 4, 5 ou 6
    ocorrido_em DATETIME NOT NULL,
    responsavel_cpf CHAR(11) NULL,
    operacao CHAR(1) NULL,              -- I | A | E (tipo 5)
    alvo_cpf CHAR(11) NULL,
    alvo_nome VARCHAR(52) NULL,
    codigo_evento CHAR(2) NULL,         -- tipo 6: 07 disponibilidade, 08 indisponibilidade
    valor_anterior JSON NULL,           -- ajuste de relógio: hora antes
    valor_novo JSON NULL,               -- e depois
    UNIQUE KEY uk_pto_arp_nsr (estabelecimento_id, nsr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

O NSR é a mesma sequência de `ponto_marcacoes` — a norma tem uma única sequência
por estabelecimento, compartilhada entre marcações e eventos. Isso exige um
gerador de NSR centralizado e transacional.

### `ponto_trilha_gps`

Trilha histórica, que hoje não existe porque `motoristas_posicao` sobrescreve.
Tabela nova, deixando a atual intocada — o painel em tempo real depende do
comportamento de upsert.

```sql
CREATE TABLE ponto_trilha_gps (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    colaborador_id INT NULL,
    motorista_id INT NOT NULL,
    veiculo_id INT NULL,
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(11,8) NOT NULL,
    velocidade DECIMAL(6,2) NULL,
    precisao DECIMAL(7,2) NULL,
    registrado_em DATETIME NOT NULL,
    KEY idx_pto_trilha_mot_data (motorista_id, registrado_em),
    KEY idx_pto_trilha_emp_data (empresa_id, registrado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Esta é a tabela de maior volume do módulo, e por muita margem: uma amostra a
cada 15 segundos, por motorista, durante 8 horas de viagem, são ~1.900 linhas por
motorista por dia. Cem motoristas geram ~190 mil linhas/dia e ~57 milhões/ano.
Duas providências obrigatórias desde o início: **particionamento por mês** e
**política de expurgo ou agregação** — a trilha crua não precisa de 5 anos, os
totais de tempo de direção precisam. Manter a trilha crua por 90 dias e os
agregados diários indefinidamente é um ponto de partida razoável.

## Camada 2 — tratamento (PTRP)

### `ponto_tratamentos`

Toda intervenção humana sobre o ponto. Aqui, e só aqui.

```sql
CREATE TABLE ponto_tratamentos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    colaborador_id INT NOT NULL,
    marcacao_id BIGINT NULL,            -- preenchido quando desconsidera uma original
    data_referencia DATE NOT NULL,
    tipo VARCHAR(20) NOT NULL,          -- inclusao | desconsideracao | pre_assinalacao | excecao
    fonte_marc CHAR(1) NOT NULL,        -- I | P | X | T  (AEJ campo fonteMarc)
    tipo_marc CHAR(1) NULL,             -- E | S | D
    horario DATETIME NULL,              -- para inclusão
    motivo VARCHAR(150) NOT NULL,       -- obrigatório para D e I
    anexo_path VARCHAR(255) NULL,
    solicitado_por INT NULL,
    solicitado_em DATETIME NULL,
    aprovado_por INT NULL,
    aprovado_em DATETIME NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | aprovado | rejeitado
    KEY idx_pto_trat_colab_data (colaborador_id, data_referencia),
    KEY idx_pto_trat_status (empresa_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

O mapeamento direto de `fonte_marc` para o campo `fonteMarc` do AEJ não é
coincidência: modelar a tabela com o vocabulário do arquivo fiscal elimina uma
camada de tradução e, mais importante, impede que o produto crie um tipo de
ajuste que não tem como ser declarado.

### `ponto_ausencias`

Alimenta o registro `07` do AEJ e o S-2230 do eSocial.

```sql
CREATE TABLE ponto_ausencias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    colaborador_id INT NOT NULL,
    tipo VARCHAR(30) NOT NULL,    -- dsr | falta_injustificada | banco_horas | folga_feriado
                                  -- ferias | atestado | licenca | afastamento | day_off
    tipo_aej TINYINT NULL,        -- 1 DSR, 2 falta, 3 banco, 4 folga compensatória
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    minutos INT NULL,             -- obrigatório quando tipo_aej = 3
    movimento_bh TINYINT NULL,    -- 1 inclusão, 2 compensação
    motivo VARCHAR(150) NULL,
    anexo_path VARCHAR(255) NULL,
    aprovado_por INT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    KEY idx_pto_aus_colab (colaborador_id, data_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Camada 3 — apuração (derivada)

### `ponto_apuracao_dia`

Resultado do cálculo por colaborador e dia. É cache: apagar e recalcular tem de
ser sempre seguro.

```sql
CREATE TABLE ponto_apuracao_dia (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    colaborador_id INT NOT NULL,
    data DATE NOT NULL,
    horario_contratual_id INT NULL,
    minutos_previstos SMALLINT NOT NULL DEFAULT 0,
    minutos_trabalhados SMALLINT NOT NULL DEFAULT 0,
    minutos_atraso SMALLINT NOT NULL DEFAULT 0,
    minutos_extra_50 SMALLINT NOT NULL DEFAULT 0,
    minutos_extra_100 SMALLINT NOT NULL DEFAULT 0,
    minutos_noturnos SMALLINT NOT NULL DEFAULT 0,      -- já com fator 60/52,5
    minutos_noturnos_prorrogacao SMALLINT NOT NULL DEFAULT 0,
    minutos_intervalo SMALLINT NOT NULL DEFAULT 0,
    minutos_intervalo_suprimido SMALLINT NOT NULL DEFAULT 0,
    minutos_interjornada_violada SMALLINT NOT NULL DEFAULT 0,
    minutos_espera SMALLINT NOT NULL DEFAULT 0,        -- motorista
    minutos_direcao SMALLINT NOT NULL DEFAULT 0,       -- da trilha de GPS
    excedeu_direcao_continua TINYINT(1) NOT NULL DEFAULT 0,
    dsr_perdido TINYINT(1) NOT NULL DEFAULT 0,
    feriado TINYINT(1) NOT NULL DEFAULT 0,
    tem_pendencia TINYINT(1) NOT NULL DEFAULT 0,
    parametros_versao INT NULL,                        -- qual conjunto de regras produziu isto
    calculado_em DATETIME NOT NULL,
    UNIQUE KEY uk_pto_apur_dia (colaborador_id, data),
    KEY idx_pto_apur_emp_data (empresa_id, data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`parametros_versao` é o que torna a apuração auditável: sabendo qual versão de
parâmetros gerou o número, é possível explicar por que o recálculo de hoje
difere do fechamento do mês passado — e provar que não houve manipulação.

### `ponto_parametros` e `ponto_competencias`

```sql
CREATE TABLE ponto_parametros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    versao INT NOT NULL,
    vigencia_inicio DATE NOT NULL,
    vigencia_fim DATE NULL,
    config JSON NOT NULL,
    criado_por INT NULL,
    criado_em DATETIME NOT NULL,
    UNIQUE KEY uk_pto_param (empresa_id, versao),
    KEY idx_pto_param_vig (empresa_id, vigencia_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ponto_competencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    estabelecimento_id INT NOT NULL,
    ano_mes CHAR(7) NOT NULL,           -- '2026-09'
    status VARCHAR(20) NOT NULL DEFAULT 'aberta', -- aberta | fechada | reaberta
    fechado_por INT NULL,
    fechado_em DATETIME NULL,
    UNIQUE KEY uk_pto_comp (estabelecimento_id, ano_mes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`config` como JSON versionado, e não colunas: os parâmetros são muitos, mudam com
a jurisprudência (ver [04](04-conformidade-legal.md), seção 11) e nunca são
consultados individualmente em `WHERE` — são carregados em bloco pelo motor de
cálculo. Cada mudança gera versão nova, jamais sobrescreve. Isso é o que permite
recalcular 2023 com a regra de 2023.

## Volumetria e o que vigiar

| Tabela | Ordem de grandeza (100 colaboradores) | Cuidado |
|---|---|---|
| `ponto_trilha_gps` | ~57 M linhas/ano | Particionar por mês; expurgo/agregação obrigatórios |
| `ponto_marcacoes` | ~100 K linhas/ano | Nunca apagar; retenção de 5 anos |
| `ponto_apuracao_dia` | ~26 K linhas/ano | Recalculável; pode ser truncada por período |
| `ponto_eventos_arp` | ~10 K linhas/ano | Nunca apagar |

O gerador de NSR merece atenção especial de implementação: é uma sequência única
por estabelecimento compartilhada entre `ponto_marcacoes` e `ponto_eventos_arp`,
com incremento unitário e sem lacunas. Duas requisições simultâneas do mesmo
estabelecimento não podem receber o mesmo NSR nem pular um número. Isso exige
transação com `SELECT ... FOR UPDATE` no contador do estabelecimento, ou uma
tabela de sequência dedicada — não um `MAX(nsr) + 1` sem lock, que é a
implementação ingênua e que quebra sob concorrência exatamente no dado que o
fiscal audita.
