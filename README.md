# Open Folium

Uma biblioteca digital self-hosted com suporte a repetição espaçada. Faça upload dos seus livros em PDF ou EPUB, leia no navegador, crie destaques e transforme-os em flashcards revisados pelo algoritmo SM-2 — tudo rodando na sua própria infraestrutura.

## Funcionalidades

- **Biblioteca pessoal** — upload, organização e gerenciamento de livros PDF e EPUB
- **Leitor integrado** — leitura no navegador com PDF.js (PDF) e epub.js (EPUB)
- **Progresso de leitura** — posição salva automaticamente por livro e usuário
- **Destaques e anotações** — marque trechos com cores (amarelo, azul, verde, rosa) e adicione notas
- **Repetição espaçada (SRS)** — flashcards gerados a partir dos destaques, revisados pelo algoritmo SM-2
- **Notificações via Telegram** — lembretes de revisão enviados pelo bot no horário configurado
- **Multi-usuário** — cada usuário tem sua própria biblioteca, destaques e baralhos

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, React Query, React Router |
| Backend | Node.js, Fastify v4, TypeScript, Zod |
| ORM / Banco | Prisma + SQLite |
| Autenticação | JWT (access token 15 min) + refresh token em cookie httpOnly (30 dias) |
| PDF | pdf-parse (extração server-side), PDF.js v5 (renderização) |
| EPUB | epub2 (extração server-side), react-reader (renderização) |
| Notificações | node-cron + Telegram Bot API |
| SRS | Algoritmo SM-2 implementado em TypeScript |
| Infra | Docker Compose |

## Início rápido (Docker)

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/open-folium.git
cd open-folium

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env e defina JWT_SECRET e REFRESH_SECRET

# 3. Suba os serviços
docker-compose up --build
```

Acesse `http://localhost:5173` no navegador.

### Variáveis de ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DATABASE_URL` | Caminho do banco SQLite | `file:./data/reader.db` |
| `JWT_SECRET` | Segredo para assinar os access tokens | — |
| `REFRESH_SECRET` | Segredo para assinar os refresh tokens | — |
| `PORT` | Porta da API | `3000` |
| `VITE_API_URL` | URL da API usada pelo frontend | `http://localhost:3000` |

## Desenvolvimento local

Requer **Node.js 20+** e **pnpm**.

```bash
# Instalar dependências
pnpm install

# Gerar o client Prisma e criar o banco
cd apps/api
npx prisma generate
npx prisma db push

# Iniciar API (http://localhost:3000) e Web (http://localhost:5173) em terminais separados
pnpm dev:api
pnpm dev:web
```

## Estrutura do projeto

```
open-folium/
├── apps/
│   ├── api/               # Backend Fastify
│   │   ├── src/
│   │   │   ├── server.ts  # Bootstrap da aplicação
│   │   │   ├── plugins/   # JWT, CORS, cookies
│   │   │   ├── routes/    # Endpoints (auth, books, highlights, decks...)
│   │   │   └── services/  # Lógica de negócio
│   │   └── prisma/
│   │       └── schema.prisma
│   └── web/               # Frontend React
│       └── src/
│           ├── pages/     # Login, Registro, Biblioteca, Detalhe, Leitor
│           ├── components/# Componentes reutilizáveis (leitores, cards, modais)
│           ├── hooks/     # useBooks, useReader, usePdfThumbnail
│           └── store/     # Estado de autenticação (Zustand)
├── packages/
│   └── shared/            # Tipos TypeScript compartilhados
├── data/
│   ├── db/                # Banco SQLite (gerado em runtime)
│   └── uploads/           # Arquivos enviados (gerado em runtime)
├── docker-compose.yml
└── .env.example
```

## Armazenamento de arquivos

Os livros são armazenados localmente no volume montado em `data/uploads/`:

```
data/uploads/
└── {userId}/
    ├── {uuid}.pdf (ou .epub)
    └── covers/
        └── {uuid}.jpg   # capa extraída de EPUBs
```

## Licença

MIT
