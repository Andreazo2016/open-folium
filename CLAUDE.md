# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open-Folium is a self-hosted digital library and spaced repetition study app. It is a pnpm monorepo with:
- `apps/api` — Fastify v4 + TypeScript backend with SQLite via Prisma
- `apps/web` — React 18 + Vite + TypeScript frontend
- `packages/shared` — Shared TypeScript types

## Commands

```bash
# Development
pnpm dev:api          # Start API server (http://localhost:3000)
pnpm dev:web          # Start web dev server (http://localhost:5173)

# Individual workspace commands (run from root or with filter)
pnpm --filter api dev
pnpm --filter web dev
pnpm --filter web build

# Database (run from apps/api)
npx prisma generate   # Regenerate Prisma client after schema changes
npx prisma db push    # Sync schema to SQLite without migrations
npx prisma migrate deploy  # Deploy migrations in production

# Docker
docker-compose up --build
```

## Architecture

**Data Flow:**
```
React (React Query + Zustand) → axios → Fastify API → Prisma → SQLite
```

**Authentication:** JWT access tokens (15 min) returned in response body, stored in Zustand. Refresh tokens (30 days) stored in httpOnly cookies. Protected routes use `@onRequest: [fastify.authenticate]`. JWT payload uses `sub` field for user ID: `(request.user as { sub: string }).sub`.

**File Storage:** Books uploaded to `data/uploads/{userId}/{uuid}.{ext}`. EPUB covers at `data/uploads/{userId}/covers/{uuid}.jpg`. Files served via `@fastify/static` with Bearer token auth.

**API structure:** Routes in `apps/api/src/routes/`, business logic in `apps/api/src/services/`. Frontend pages in `apps/web/src/pages/`, reusable components in `apps/web/src/components/`.

**Vite proxy:** In development, `/api` prefix is proxied to `localhost:3000`.

## Key Technical Notes

- `@fastify/multipart` must stay at **v7** (v8 requires Fastify v5, project uses v4)
- `pdf-parse` v2 uses class syntax: `new PDFParse({ data: buffer })`
- `pdfjs-dist` v5 worker path: `pdfjs-dist/build/pdf.worker.min.mjs`
- Frontend requests for book files require `Authorization: Bearer <token>` header and `responseType: 'arraybuffer'` (PDF) or `'blob'` (images)

## Database Schema (Prisma)

Key models: `User`, `Book`, `ReadingProgress` (unique per userId+bookId, stores page for PDFs or CFI string for EPUBs), `Highlight` (with color enum), `Deck`/`Card`/`ReviewLog` (SM-2 spaced repetition), `NotificationLog` (Telegram).

## Environment Variables

Copy `.env.example` to `.env`. Required: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_SECRET`. Optional: `PORT` (default 3000), `VITE_API_URL` (default `http://localhost:3000`).
