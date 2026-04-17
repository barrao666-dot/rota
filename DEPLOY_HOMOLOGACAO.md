# Rota++ — Deploy de Homologação no TurboCloud

Guia prático para subir a aplicação no TurboCloud (ou qualquer host Node.js
com MySQL gerenciado). Siga na ordem: cada passo pressupõe que o anterior
foi concluído.

---

## 0. Visão geral da arquitetura

O Rota++ é um monolito Node/Express que serve **três frontends** na mesma
porta:

| Caminho | Conteúdo | Build? |
|---|---|---|
| `/` e `/operacao/*`, `/empresa/*`, `/master/*` | HTML/JS estático em `frontend/` | **não** — arquivos já prontos |
| `/painel/*` | SPA React (Vite) em `dist-ui/` | **sim** — `npm run build` |
| `/api/*` | Backend Express (`backend/`) | **não** |
| `/uploads/*` | Uploads de logos/ícones (`backend/uploads`) | **não** |

Ou seja: **um único processo Node escuta `PORT` e entrega tudo**. Nada de
CDN separada, nenhum nginx próprio obrigatório, nada de rota separada de
frontend. Isso simplifica muito o deploy no TurboCloud.

---

## 1. Pré-requisitos no TurboCloud

1. Criar uma aplicação **Node.js 18 LTS ou 20 LTS** (ver `engines` em
   `package.json`).
2. Criar um banco **MySQL 8.x** (pode ser o serviço gerenciado do próprio
   TurboCloud ou um externo). Guardar:
   - `DB_HOST`
   - `DB_PORT` (se diferente de 3306)
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
3. Ter um domínio/subdomínio apontado para a app (ex:
   `https://homolog.rotaplus.com.br`). O TurboCloud provisiona HTTPS via
   Let's Encrypt automaticamente.
4. Chave da OpenRouteService (opcional — cada empresa cadastra a sua no
   painel, mas é bom ter uma de fallback em `ORS_KEY`).

---

## 2. Preparar o código localmente

### 2.1. Confirmar que o repositório está limpo
```bash
git status
git pull --rebase
```

### 2.2. Gerar o build do frontend React (`/painel`)
```bash
npm ci
npm run build
```
Isso gera a pasta `dist-ui/`. Ela **precisa ir junto** no deploy — o
backend a serve diretamente. Se você esquecer, `/painel` cai no dashboard
legado, mas o restante continua funcionando.

> **Dica:** adicione `dist-ui/` ao que será commitado OU configure o
> TurboCloud pra rodar `npm run build` como passo de build. Escolha uma
> das duas abordagens; não precisa das duas.

### 2.3. Rodar um smoke test local em modo produção
```bash
NODE_ENV=production PORT=3000 node backend/server.js
```
Abra `http://localhost:3000` e faça login master + login empresa para
confirmar que `dist-ui` está sendo servido em `/painel`.

---

## 3. Variáveis de ambiente (`.env.production`)

Crie o arquivo `backend/.env.production` **com base em `backend/env.example`**.
Valores obrigatórios para homologação:

```env
# Banco
DB_HOST=<host-do-turbocloud>
DB_PORT=3306
DB_USER=<usuario>
DB_PASSWORD=<senha>
DB_NAME=<nome-do-banco>

# HTTP
PORT=3000           # TurboCloud sobrescreve em runtime, não faz mal.
HOST=0.0.0.0        # obrigatório em container
PUBLIC_URL=https://homolog.rotaplus.com.br

# Auth
JWT_SECRET=<gerar com: openssl rand -hex 48>
JWT_EXPIRES_IN=7d
MASTER_USER=admin
MASTER_PASS=<gerar com: npm run senha-master>

# CORS — APENAS o domínio público de homologação
FRONTEND_ORIGIN=https://homolog.rotaplus.com.br

# Integrações
ORS_KEY=<fallback ORS, opcional>

NODE_ENV=production
```

**NO TURBOCLOUD**, não faça upload desse arquivo. Em vez disso:

1. Abra o painel da aplicação → *Environment Variables*.
2. Colar cada variável acima em um campo separado.
3. Salvar e *redeploy*.

O `.env.production` fica apenas como referência local; `dotenv` só lê
`backend/.env` automaticamente. TurboCloud injeta pelo ambiente do
processo, o que é o caminho correto.

> 🔐 **Nunca** commitar arquivos `.env*` reais. O repo já tem um
> `env.example` como modelo.

---

## 4. Preparar o banco de dados

### 4.1. Apenas criar o banco (1ª vez)
No console MySQL do TurboCloud:
```sql
CREATE DATABASE rotaplus_homolog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
Não precisa criar nenhuma tabela manualmente — o backend roda migrações
idempotentes no boot (`backend/scripts/migrate-schema.js`) e cria tudo
que falta.

### 4.2. Zerar o banco entre rodadas de teste
O projeto já tem um script dedicado. Ele faz `TRUNCATE` em todas as
tabelas de negócio (preservando a estrutura) e respeita as FKs.

```bash
# Exibe aviso e não faz nada (modo seguro):
npm run db:reset

# Zera de verdade (exige confirmação explícita):
npm run db:reset:confirm

# Ou direto, mantendo cadastro de empresas:
node backend/scripts/reset-banco.js --yes --keep-empresas
```

Rodar no TurboCloud:
- Via **console SSH/Shell** da aplicação (se disponível):
  ```bash
  npm run db:reset:confirm
  ```
- Via **máquina local** apontando o `.env` para o DB de homologação:
  ```bash
  # backend/.env com as credenciais do DB remoto
  npm run db:reset:confirm
  ```

Tabelas afetadas (nessa ordem, com FK_CHECKS desligado):
`motoristas_posicao → coletas → regras → bases → veiculos → motoristas →
usuarios → empresas`.

### 4.3. Criar o primeiro usuário master
O login master não vive em tabela — é comparado com `MASTER_USER` /
`MASTER_PASS` do `.env`. Então, após o deploy:

1. Acesse `https://homolog.rotaplus.com.br/master/index.html`.
2. Login: `MASTER_USER` · Senha: `MASTER_PASS`.
3. Cadastre a primeira empresa. A partir daí os fluxos normais (cadastro
   de motoristas, veículos, etc.) acontecem via painel.

---

## 5. Subir o código no TurboCloud

Escolha UM dos dois fluxos abaixo.

### 5.A — Deploy por Git (recomendado)

1. Conectar o repositório GitHub/GitLab no painel TurboCloud.
2. Branch de homologação: `homolog` (ou `main` se for o caso).
3. Configurar os comandos:
   - **Install command:** `npm ci`
   - **Build command:** `npm run build`
   - **Start command:** `npm run start:prod`
   - **Port:** `3000` (a app já respeita `process.env.PORT`)
4. Salvar → *Deploy*.

### 5.B — Deploy por upload manual (FTP / painel)

1. Na sua máquina:
   ```bash
   npm ci
   npm run build
   ```
2. Enviar para o servidor os diretórios:
   - `backend/`
   - `frontend/`
   - `dist-ui/`
   - `public/` (se existir)
   - `package.json` e `package-lock.json`
3. No servidor (SSH):
   ```bash
   npm ci --omit=dev
   npm run start:prod
   ```
   O TurboCloud normalmente gerencia o `npm ci` e o processo por
   PM2/systemd — confira a documentação do painel para o comando
   equivalente de *Restart app*.

---

## 6. Checklist pós-deploy

Depois do primeiro boot, rodar na ordem:

- [ ] `https://homolog.rotaplus.com.br/` carrega a tela de login.
- [ ] `https://homolog.rotaplus.com.br/master/index.html` permite logar
      com `MASTER_USER/MASTER_PASS`.
- [ ] Cadastrar empresa de teste + base + motorista + veículo.
- [ ] `https://homolog.rotaplus.com.br/operacao/login.html` aceita login
      do motorista recém-cadastrado.
- [ ] Criar 3–5 coletas/entregas, gerar rota, recalcular e finalizar no
      app do motorista.
- [ ] Verificar pino do motorista em tempo real no painel gerencial
      (`/empresa/painel.html`) e em `/operacao/rotas.html`.
- [ ] Instalar como PWA no celular (ícone "Adicionar à tela inicial").
- [ ] Inspecionar logs no painel TurboCloud: nenhum `unhandled` deve
      aparecer nos primeiros minutos.

---

## 7. Troubleshooting rápido

| Sintoma | Causa provável | Solução |
|---|---|---|
| `CORS blocked` em `/api/*` | `FRONTEND_ORIGIN` não inclui o domínio público | Ajustar a env e redeploy |
| `/painel` retorna dashboard legado em vez do React | `dist-ui/` ausente no deploy | Rodar `npm run build` e reenviar |
| Driver não aparece no mapa | Token antigo em cache; empresa sem `ORS_KEY`; usuário não está em `motoristas` | Re-logar, conferir `api_mapas` da empresa, `npm run db:reset:confirm` se necessário |
| `ER_ACCESS_DENIED_ERROR` no boot | Variáveis `DB_*` erradas | Corrigir no painel TurboCloud e restart |
| Login master retorna 401 | `MASTER_USER/MASTER_PASS` ausentes no ambiente | Setar e restart |

---

## 8. Comandos resumo (para colar no runbook)

```bash
# Build
npm ci
npm run build

# Boot em produção (local, pra homologar)
NODE_ENV=production node backend/server.js

# Zerar o banco (homologação)
npm run db:reset:confirm

# Zerar o banco mantendo empresas cadastradas
node backend/scripts/reset-banco.js --yes --keep-empresas

# Gerar hash de senha master
npm run senha-master
```

---

Pronto. Se algum passo falhar, reabra este documento e siga o
troubleshooting da seção 7. Qualquer script citado aqui fica em
`backend/scripts/` e pode ser rodado isoladamente.
