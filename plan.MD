# Plano de Desenvolvimento — Reader App (Selfhosted)

> Documento de referência para implementação via Claude Code.
> Stack: Node.js + Fastify + TypeScript · React + Vite + TypeScript · SQLite + Prisma · Docker Compose

---

## Visão geral da arquitetura

```
reader-app/
├── apps/
│   ├── api/          # Node.js + Fastify + TypeScript
│   └── web/          # React + Vite + TypeScript
├── packages/
│   └── shared/       # Tipos TypeScript compartilhados entre api e web
├── docker-compose.yml
├── .env.example
└── package.json      # workspace root (pnpm workspaces)
```

### Tecnologias principais

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, React Query, React Router |
| Backend | Node.js, Fastify, TypeScript, Zod, Multer |
| ORM | Prisma com SQLite |
| Auth | JWT (access token) + refresh token em cookie httpOnly |
| PDF | pdf-parse (extração server-side), PDF.js (renderização client-side) |
| EPUB | epub2 (extração server-side), epub.js (renderização client-side) |
| Notificações | node-cron + Telegram Bot API |
| SRS | Algoritmo SM-2 implementado em TypeScript puro |
| Infra | Docker Compose (api + web + volumes) |

---

## Schema Prisma (referência global)

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id                String   @id @default(uuid())
  name              String
  email             String   @unique
  passwordHash      String
  telegramChatId    String?
  notifConfig       String   @default("{\"enabled\":false,\"cron\":\"0 8 * * *\",\"count\":3}")
  createdAt         DateTime @default(now())

  books             Book[]
  highlights        Highlight[]
  decks             Deck[]
  reviewLogs        ReviewLog[]
  notificationLogs  NotificationLog[]
  readingProgress   ReadingProgress[]
}

model Book {
  id          String   @id @default(uuid())
  userId      String
  title       String
  author      String?
  fileType    String   // "pdf" | "epub"
  filePath    String
  coverPath   String?
  totalPages  Int?
  createdAt   DateTime @default(now())

  user            User              @relation(fields: [userId], references: [id])
  highlights      Highlight[]
  readingProgress ReadingProgress[]
}

model ReadingProgress {
  id        String   @id @default(uuid())
  userId    String
  bookId    String
  position  String?  // CFI para EPUB
  page      Int?     // página para PDF
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
  book Book @relation(fields: [bookId], references: [id])

  @@unique([userId, bookId])
}

model Highlight {
  id          String   @id @default(uuid())
  userId      String
  bookId      String
  content     String
  color       String   @default("yellow") // yellow | blue | green | pink
  positionCfi String?  // EPUB
  page        Int?     // PDF
  note        String?
  createdAt   DateTime @default(now())

  user  User   @relation(fields: [userId], references: [id])
  book  Book   @relation(fields: [bookId], references: [id])
  cards Card[]
}

model Deck {
  id          String   @id @default(uuid())
  userId      String
  name        String
  description String?
  createdAt   DateTime @default(now())

  user  User   @relation(fields: [userId], references: [id])
  cards Card[]
}

model Card {
  id          String   @id @default(uuid())
  deckId      String
  highlightId String?
  front       String
  back        String
  easiness    Float    @default(2.5)
  interval    Int      @default(1)
  repetitions Int      @default(0)
  nextReview  DateTime @default(now())
  createdAt   DateTime @default(now())

  deck       Deck       @relation(fields: [deckId], references: [id])
  highlight  Highlight? @relation(fields: [highlightId], references: [id])
  reviewLogs ReviewLog[]
}

model ReviewLog {
  id         String   @id @default(uuid())
  cardId     String
  userId     String
  quality    Int      // 0–5 (escala SM-2)
  intervalUsed Int
  reviewedAt DateTime @default(now())

  card Card @relation(fields: [cardId], references: [id])
  user User @relation(fields: [userId], references: [id])
}

model NotificationLog {
  id          String   @id @default(uuid())
  userId      String
  highlightId String
  sentAt      DateTime @default(now())
  channel     String   @default("telegram")

  user User @relation(fields: [userId], references: [id])
}
```

---

## Entregável 1 — Fundação + Autenticação

**Objetivo:** Projeto inicializado, Docker funcionando, registro e login de usuários com JWT.

### 1.1 Estrutura do projeto

```
reader-app/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── server.ts         # bootstrap do Fastify
│   │   │   ├── plugins/          # jwt, cors, multipart
│   │   │   ├── routes/
│   │   │   │   └── auth.ts
│   │   │   ├── services/
│   │   │   │   └── auth.service.ts
│   │   │   └── lib/
│   │   │       └── prisma.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── LoginPage.tsx
│       │   │   └── RegisterPage.tsx
│       │   ├── components/
│       │   │   └── AuthForm.tsx
│       │   ├── lib/
│       │   │   └── api.ts        # axios instance com interceptor JWT
│       │   └── store/
│       │       └── auth.ts       # zustand auth store
│       ├── Dockerfile
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   └── shared/
│       └── src/
│           └── types/
│               └── auth.ts       # DTOs compartilhados
├── docker-compose.yml
├── .env.example
└── package.json
```

### 1.2 Rotas da API — Auth

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` | Cria novo usuário |
| POST | `/auth/login` | Retorna access token + seta refresh cookie |
| POST | `/auth/refresh` | Renova access token via refresh cookie |
| POST | `/auth/logout` | Limpa cookie de refresh |
| GET | `/auth/me` | Retorna dados do usuário autenticado |

### 1.3 Regras de negócio — Auth

- Senha com mínimo de 8 caracteres, hash com `bcrypt` (salt rounds: 10)
- Access token JWT expira em 15 minutos
- Refresh token expira em 30 dias, armazenado em cookie `httpOnly; Secure; SameSite=Strict`
- Validação de todos os inputs com Zod
- Emails em lowercase antes de salvar

### 1.4 Frontend — Auth

- Rota `/login` com formulário email + senha
- Rota `/register` com formulário nome + email + senha
- Após login, redireciona para `/library`
- Rota `/library` e demais rotas privadas protegidas por `<PrivateRoute>`
- Access token em memória (zustand), renovação automática via interceptor axios
- Tratamento de erros de validação com mensagens inline

### 1.5 Docker Compose (base)

```yaml
services:
  api:
    build: ./apps/api
    ports:
      - "3000:3000"
    volumes:
      - ./data/db:/app/data
      - ./data/uploads:/app/uploads
    environment:
      DATABASE_URL: file:/app/data/reader.db
      JWT_SECRET: ${JWT_SECRET}
      REFRESH_SECRET: ${REFRESH_SECRET}
    restart: unless-stopped

  web:
    build: ./apps/web
    ports:
      - "5173:80"
    depends_on:
      - api
    restart: unless-stopped
```

### 1.6 Critérios de aceite

- [ ] `docker compose up` sobe api e web sem erros
- [ ] Usuário consegue se registrar e recebe token JWT
- [ ] Usuário consegue fazer login
- [ ] Rota `/auth/me` retorna dados do usuário com token válido
- [ ] Rota `/library` redireciona para `/login` se não autenticado
- [ ] Refresh token renova o access token automaticamente

---

## Entregável 2 — Upload, Gerenciamento e Leitura de Livros

**Objetivo:** Upload de PDF e EPUB, listagem na biblioteca, visualização de metadados e leitura no browser.

### 2.1 Estrutura adicional

```
apps/api/src/
├── routes/
│   └── books.ts
├── services/
│   └── books.service.ts
└── lib/
    └── fileProcessor.ts   # extrai metadados de PDF e EPUB

apps/web/src/
├── pages/
│   ├── LibraryPage.tsx
│   ├── BookDetailPage.tsx
│   └── ReaderPage.tsx
├── components/
│   ├── BookCard.tsx
│   ├── UploadModal.tsx
│   ├── PdfReader.tsx
│   └── EpubReader.tsx
└── hooks/
    ├── useBooks.ts
    └── useReader.ts
```

### 2.2 Rotas da API — Books

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/books/upload` | Upload de arquivo PDF ou EPUB |
| GET | `/books` | Lista livros do usuário autenticado |
| GET | `/books/:id` | Retorna metadados de um livro |
| GET | `/books/:id/file` | Serve o arquivo para o leitor (stream) |
| GET | `/books/:id/cover` | Serve a imagem de capa |
| DELETE | `/books/:id` | Remove livro e arquivo do disco |
| PATCH | `/books/:id` | Atualiza título ou autor manualmente |

### 2.3 Processamento de arquivos

**PDF:**
- Usar `pdf-parse` para extrair: título, autor, número de páginas
- Gerar thumbnail da capa com `pdf-poppler` ou `canvas` (primeira página)
- Validar que é um PDF real pelo magic bytes (`%PDF`)
- Tamanho máximo: 100MB

**EPUB:**
- Usar `epub2` para extrair: título, autor, capa embutida, número de capítulos
- Extrair imagem de capa se existir no container EPUB
- Validar que é um EPUB real (ZIP com `mimetype = application/epub+zip`)
- Tamanho máximo: 50MB

**Storage:**
- Arquivos salvos em `/uploads/{userId}/{uuid}.{ext}`
- Capas salvas em `/uploads/{userId}/covers/{uuid}.jpg`
- Paths relativos salvos no banco, não absolutos

### 2.4 Frontend — Biblioteca

**LibraryPage:**
- Grid de cards com capa, título, autor e tipo do arquivo
- Botão de upload (abre modal)
- Campo de busca por título/autor (filtragem local)
- Menu de contexto no card: "Ler", "Editar", "Excluir"
- Estado vazio com instrução para fazer upload

**UploadModal:**
- Dropzone com drag-and-drop
- Aceita apenas `.pdf` e `.epub`
- Barra de progresso durante upload
- Exibe metadados extraídos antes de confirmar

**ReaderPage (`/reader/:id`):**

Para PDF:
- Renderização com PDF.js via `react-pdf`
- Navegação por páginas (anterior/próxima, input de página)
- Zoom (50% a 200%)
- Modo tela cheia
- Salvar progresso (página atual) ao trocar de página, com debounce de 2s

Para EPUB:
- Renderização com `epub.js` via `react-reader`
- Navegação por capítulos (sumário lateral)
- Ajuste de tamanho de fonte
- Salvar progresso (CFI atual) automaticamente

### 2.5 Progresso de leitura

- API: `PATCH /books/:id/progress` com body `{ page?, position? }`
- API: `GET /books/:id/progress` retorna posição salva
- Frontend restaura posição ao abrir o leitor
- Card na biblioteca exibe indicador visual se o livro foi aberto antes

### 2.6 Critérios de aceite

- [ ] Upload de PDF extrai título, autor e número de páginas
- [ ] Upload de EPUB extrai título, autor e capa
- [ ] Biblioteca exibe todos os livros do usuário com capa
- [ ] Busca filtra livros por título e autor
- [ ] PDF abre no leitor com navegação por páginas funcionando
- [ ] EPUB abre no leitor com navegação por capítulos funcionando
- [ ] Progresso de leitura é salvo e restaurado ao reabrir
- [ ] Livro deletado remove arquivo do disco

---

## Entregável 3 — Highlights e Anotações

**Objetivo:** Selecionar texto no leitor, salvar highlights com cor e nota, visualizar e gerenciar todos os highlights.

### 3.1 Estrutura adicional

```
apps/api/src/
├── routes/
│   └── highlights.ts
└── services/
    └── highlights.service.ts

apps/web/src/
├── pages/
│   └── HighlightsPage.tsx
├── components/
│   ├── HighlightPopover.tsx   # aparece ao selecionar texto
│   ├── HighlightSidebar.tsx   # lista no leitor
│   └── HighlightCard.tsx      # card na página de highlights
└── hooks/
    └── useHighlights.ts
```

### 3.2 Rotas da API — Highlights

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/highlights` | Cria novo highlight |
| GET | `/highlights` | Lista todos os highlights do usuário (com filtros) |
| GET | `/highlights/book/:bookId` | Lista highlights de um livro |
| PATCH | `/highlights/:id` | Atualiza cor ou nota |
| DELETE | `/highlights/:id` | Remove highlight |

**Filtros disponíveis em `GET /highlights`:** `bookId`, `color`, `search` (busca no conteúdo), `page`, `limit`

### 3.3 Modelo de posição

**Para PDF:**
```typescript
{
  page: number,         // número da página (1-indexed)
  rects: Array<{        // bounding boxes da seleção
    x1: number, y1: number,
    x2: number, y2: number
  }>
}
// Serializado como JSON em positionCfi
```

**Para EPUB:**
```typescript
{
  cfi: string,   // ex: "epubcfi(/6/4[chap01]!/4/2/1:0,/4/2/1:20)"
  chapter: string
}
// Serializado como JSON em positionCfi
```

### 3.4 Frontend — Leitor com highlights

**Fluxo de criação:**
1. Usuário seleciona texto no leitor
2. `HighlightPopover` aparece com 4 opções de cor (amarelo, azul, verde, rosa)
3. Usuário clica em uma cor → highlight salvo imediatamente
4. Usuário pode adicionar nota clicando no ícone de lápis antes de salvar

**Renderização de highlights existentes:**
- PDF: ao carregar uma página, busca highlights daquela página e desenha retângulos coloridos semi-transparentes sobre o canvas do PDF.js
- EPUB: usa a API de anotações do epub.js para colorir os trechos via CFI

**Sidebar de highlights no leitor:**
- Lista todos os highlights do livro
- Clicando em um highlight, navega para aquela página/posição
- Permite editar nota inline
- Permite deletar

### 3.5 Página de highlights (`/highlights`)

- Lista todos os highlights do usuário, agrupados por livro
- Filtros: por livro, por cor, campo de busca full-text no conteúdo
- Cada card mostra: conteúdo do highlight, nota (se tiver), livro de origem, cor
- Ação rápida "Criar card" a partir do highlight (redireciona para Entregável 4)

### 3.6 Critérios de aceite

- [ ] Seleção de texto no PDF abre o popover com opções de cor
- [ ] Seleção de texto no EPUB abre o popover com opções de cor
- [ ] Highlight salvo é renderizado visualmente ao reabrir o livro
- [ ] Sidebar no leitor lista os highlights do livro
- [ ] Clicar em um highlight na sidebar navega para a posição correta
- [ ] Página `/highlights` lista todos os highlights com filtros funcionando
- [ ] Editar nota e deletar highlight funcionam

---

## Entregável 4 — Baralhos e Flashcards com Revisão Espaçada (SM-2)

**Objetivo:** Criar baralhos, gerar cards a partir de highlights, revisar com o algoritmo SM-2.

### 4.1 Estrutura adicional

```
apps/api/src/
├── routes/
│   ├── decks.ts
│   └── cards.ts
├── services/
│   ├── decks.service.ts
│   └── srs.service.ts
└── lib/
    └── sm2.ts        # algoritmo SM-2 puro

apps/web/src/
├── pages/
│   ├── DecksPage.tsx
│   ├── DeckDetailPage.tsx
│   └── ReviewPage.tsx
├── components/
│   ├── DeckCard.tsx
│   ├── FlashCard.tsx     # componente com flip animado
│   └── ReviewRating.tsx  # botões 0-5
└── hooks/
    ├── useDecks.ts
    └── useReview.ts
```

### 4.2 Algoritmo SM-2

```typescript
// apps/api/src/lib/sm2.ts

interface CardState {
  easiness: number;     // fator E, mínimo 1.3, começa em 2.5
  interval: number;     // dias até próxima revisão
  repetitions: number;  // quantas vezes foi revisado com qualidade >= 3
}

interface ReviewResult extends CardState {
  nextReview: Date;
}

export function applyReview(card: CardState, quality: number): ReviewResult {
  // quality: 0 = falha total, 5 = perfeito sem hesitação
  // quality < 3 = resposta incorreta → reinicia repetições

  let { easiness, interval, repetitions } = card;

  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easiness);
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  easiness = Math.max(1.3, easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return { easiness, interval, repetitions, nextReview };
}
```

### 4.3 Rotas da API — Decks e Cards

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/decks` | Cria baralho |
| GET | `/decks` | Lista baralhos do usuário com contagem de cards |
| GET | `/decks/:id` | Detalhe do baralho com cards |
| PATCH | `/decks/:id` | Renomeia baralho |
| DELETE | `/decks/:id` | Remove baralho e seus cards |
| POST | `/cards` | Cria card (com ou sem highlightId) |
| PATCH | `/cards/:id` | Edita frente/verso do card |
| DELETE | `/cards/:id` | Remove card |
| GET | `/decks/:id/review` | Retorna cards com `nextReview <= agora` |
| POST | `/cards/:id/review` | Submete resposta, aplica SM-2, salva ReviewLog |

### 4.4 Geração de card a partir de highlight

Quando `highlightId` é fornecido na criação do card:
- `front` padrão: `"O que este trecho significa para você?"` (editável)
- `back` padrão: o conteúdo do highlight (editável)
- O usuário edita frente e verso antes de salvar

### 4.5 Frontend — Baralhos

**DecksPage (`/decks`):**
- Lista de baralhos com nome, número de cards e cards para revisar hoje
- Botão para criar novo baralho (modal simples com nome e descrição)
- Clique no baralho vai para DeckDetailPage

**DeckDetailPage (`/decks/:id`):**
- Lista todos os cards do baralho
- Botão "Adicionar card" (manual, com frente e verso)
- Botão "Revisar agora" (se houver cards pendentes)
- Exibe data da próxima revisão por card

**ReviewPage (`/decks/:id/review`):**
- Exibe um card por vez com animação de flip (frente → verso ao clicar)
- Após revelar o verso, exibe 6 botões de qualidade:
  - 0 — Não lembrei nada
  - 1 — Errei, mas reconheci
  - 2 — Errei, mas era fácil
  - 3 — Acertei com dificuldade
  - 4 — Acertei com hesitação
  - 5 — Perfeito!
- Ao escolher, avança para o próximo card
- Ao finalizar, exibe tela de resumo (total revisado, acertos, próxima revisão)

### 4.6 Critérios de aceite

- [ ] Criar baralho e adicionar cards manualmente
- [ ] Criar card a partir de highlight com um clique
- [ ] Página de revisão exibe apenas cards com `nextReview <= hoje`
- [ ] Algoritmo SM-2 atualiza corretamente `interval`, `easiness` e `nextReview`
- [ ] ReviewLog registra cada revisão
- [ ] Tela de resumo exibe estatísticas ao final da sessão
- [ ] Badge na DecksPage mostra quantos cards aguardam revisão

---

## Entregável 5 — Notificações via Telegram

**Objetivo:** Bot do Telegram envia highlights aleatórios ao usuário conforme sua configuração de frequência.

### 5.1 Estrutura adicional

```
apps/api/src/
├── routes/
│   └── notifications.ts
├── services/
│   └── notifications.service.ts
└── jobs/
    └── highlightReminder.job.ts

apps/web/src/
├── pages/
│   └── SettingsPage.tsx
└── components/
    └── TelegramSetup.tsx
```

### 5.2 Configuração do Telegram

**Setup do bot (feito pelo usuário uma vez):**
1. Falar com `@BotFather` no Telegram e criar bot → obtém `TELEGRAM_BOT_TOKEN`
2. Adicionar `TELEGRAM_BOT_TOKEN` no `.env` da aplicação
3. Na página de configurações, clicar em "Conectar Telegram"
4. App exibe instruções: mandar `/start` para o bot no Telegram
5. Bot recebe o `/start`, extrai o `chat_id` e registra via webhook

**Rota de webhook:** `POST /telegram/webhook`
- Recebe eventos do Telegram
- Se mensagem for `/start`, extrai `chat_id` e `userId` do token no payload
- Salva `telegramChatId` no usuário

**Rota de setup:** `GET /notifications/telegram/connect`
- Retorna URL de deep link: `https://t.me/{BOT_NAME}?start={userId}`
- Frontend exibe como botão "Abrir no Telegram"

### 5.3 Configuração de notificações

**Rota:** `PATCH /notifications/config`

**Body:**
```typescript
{
  enabled: boolean,
  cron: string,   // ex: "0 8 * * *" (todo dia às 8h)
  count: number   // quantos highlights por mensagem (1–10)
}
```

**Crons pré-definidos sugeridos no frontend:**
- "Todo dia às 8h" → `0 8 * * *`
- "Todo dia às 20h" → `0 20 * * *`
- "Dias de semana às 9h" → `0 9 * * 1-5`
- "Toda segunda às 8h" → `0 8 * * 1`
- Personalizado (input livre com validação)

### 5.4 Job de notificação

```typescript
// apps/api/src/jobs/highlightReminder.job.ts
// Roda a cada minuto, verifica quais usuários têm cron que bate com o momento atual

import cron from 'node-cron';
import { matchesCron } from '../lib/cronMatcher';

cron.schedule('* * * * *', async () => {
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: null } }
  });

  for (const user of users) {
    const config = JSON.parse(user.notifConfig);
    if (!config.enabled) continue;
    if (!matchesCron(config.cron)) continue;

    const highlights = await prisma.highlight.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    if (highlights.length === 0) continue;

    // Sorteia `config.count` highlights aleatórios
    const shuffled = highlights.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, config.count);

    await sendTelegramMessage(user.telegramChatId!, formatHighlights(selected));

    // Registra no NotificationLog
    await prisma.notificationLog.createMany({
      data: selected.map(h => ({
        userId: user.id,
        highlightId: h.id,
        channel: 'telegram'
      }))
    });
  }
});
```

**Formato da mensagem:**
```
📚 *Seus highlights do dia*

1. De *"Nome do Livro"*:
> "conteúdo do highlight"
_nota: sua anotação aqui_

2. De *"Outro Livro"*:
> "outro highlight"
```

### 5.5 Frontend — Configurações (`/settings`)

- Seção "Telegram": status de conexão + botão "Conectar" ou "Desconectar"
- Seção "Notificações": toggle ativar/desativar + seletor de frequência + quantidade
- Botão "Testar agora" que envia um highlight aleatório imediatamente
- Seção "Conta": alterar nome, email, senha

### 5.6 Critérios de aceite

- [ ] Usuário consegue conectar conta do Telegram via deep link
- [ ] `telegramChatId` é salvo ao mandar `/start` para o bot
- [ ] Configuração de notificação é salva e persistida
- [ ] Job dispara na frequência configurada
- [ ] Mensagem no Telegram chega com o número correto de highlights
- [ ] Botão "Testar agora" funciona
- [ ] Desconectar Telegram remove o `telegramChatId`

---

## Entregável 6 — Polimento e deploy

**Objetivo:** UX consistente, tratamento de erros, performance e docker compose pronto para produção.

### 6.1 UX e acessibilidade

- Loading skeletons em todas as listagens
- Toasts para feedback de ações (sucesso e erro)
- Confirmação antes de deletar livros, baralhos e highlights
- Responsividade mobile no leitor (gestos de swipe para EPUB)
- Modo escuro (Tailwind `dark:` classes, preferência salva em localStorage)

### 6.2 Performance

- Paginação em `GET /highlights` e `GET /books` (cursor-based)
- Lazy loading de capas na biblioteca (Intersection Observer)
- Compressão de resposta (Fastify compress plugin)
- Cache de capas com header `Cache-Control: max-age=31536000, immutable`

### 6.3 Segurança

- Rate limiting em rotas de auth (`@fastify/rate-limit`: 10 req/min por IP)
- Validação de tipo de arquivo por magic bytes, não só extensão
- Sanitização de nomes de arquivo no upload
- Helmet para headers HTTP (`@fastify/helmet`)
- CORS restrito à origem do frontend

### 6.4 Docker Compose final

```yaml
version: "3.9"

services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - reader_db:/app/data
      - reader_uploads:/app/uploads
    env_file: .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
      args:
        VITE_API_URL: ${VITE_API_URL:-http://localhost:3000}
    ports:
      - "5173:80"
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

volumes:
  reader_db:
  reader_uploads:
```

### 6.5 Variáveis de ambiente (`.env.example`)

```env
# API
DATABASE_URL=file:/app/data/reader.db
JWT_SECRET=troque-por-string-aleatoria-longa
REFRESH_SECRET=troque-por-outra-string-aleatoria
PORT=3000
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE_MB=100

# Telegram
TELEGRAM_BOT_TOKEN=seu-token-aqui
TELEGRAM_WEBHOOK_URL=https://seu-dominio.com/telegram/webhook

# Web
VITE_API_URL=http://localhost:3000
```

### 6.6 Critérios de aceite

- [ ] `docker compose up --build` funciona do zero sem erros
- [ ] Todos os volumes persistem entre restarts
- [ ] Rate limiting bloqueia tentativas de brute force no login
- [ ] Modo escuro funciona e persiste entre sessões
- [ ] Aplicação funciona em mobile (leitor, biblioteca, revisão)
- [ ] Rota `/health` retorna 200 com status da aplicação

---

## Ordem de implementação sugerida

```
Entregável 1  →  Entregável 2  →  Entregável 3  →  Entregável 4  →  Entregável 5  →  Entregável 6
  Auth              Livros          Highlights        Flashcards       Telegram         Polimento
  ~3 dias           ~5 dias           ~4 dias           ~4 dias          ~2 dias          ~2 dias
```

**Dica para o Claude Code:** implemente e valide os critérios de aceite de cada entregável antes de avançar para o próximo. Os entregáveis são independentes o suficiente para serem implementados sequencialmente sem refatoração.

---

## Dependências por pacote

### `apps/api/package.json`
```json
{
  "dependencies": {
    "@fastify/cookie": "^9",
    "@fastify/cors": "^9",
    "@fastify/helmet": "^11",
    "@fastify/jwt": "^8",
    "@fastify/multipart": "^8",
    "@fastify/rate-limit": "^9",
    "@fastify/static": "^7",
    "@prisma/client": "^5",
    "bcrypt": "^5",
    "epub2": "^3",
    "fastify": "^4",
    "node-cron": "^3",
    "pdf-parse": "^1",
    "zod": "^3"
  },
  "devDependencies": {
    "@types/bcrypt": "^5",
    "@types/node": "^20",
    "prisma": "^5",
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

### `apps/web/package.json`
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5",
    "axios": "^1",
    "epub.js": "^0.3",
    "pdfjs-dist": "^4",
    "react": "^18",
    "react-dom": "^18",
    "react-router-dom": "^6",
    "zustand": "^4"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3",
    "typescript": "^5",
    "vite": "^5"
  }
}
```