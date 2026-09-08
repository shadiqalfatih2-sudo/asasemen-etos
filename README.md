# ETOS Assessment Center

Web asesmen dan development awardee ETOS.

**Tagline:** Kenali dirimu. Pahami kondisimu. Tentukan arahmu.

## Stack
- Next.js 16 App Router
- React 19
- TypeScript
- Supabase Auth + Postgres + RLS
- Vercel

## Project boundary
Repo ini adalah project baru dan berdiri sendiri. Jangan memakai database, environment variables, atau project Vercel ETOS lama.

## Local setup
1. Salin `.env.example` menjadi `.env.local`.
2. Isi URL dan publishable key dari Supabase project **ETOS Assessment Center** yang baru.
3. Isi `SUPABASE_SECRET_KEY` hanya di environment server/Vercel; jangan pernah memakai key ini di komponen client.
4. Jalankan migration di `supabase/migrations/` berurutan.
5. `npm install && npm run dev`.

## Current phase
### Fase A — Infrastructure & Security Foundation
- [x] Next.js foundation
- [x] Supabase SSR clients
- [x] Premium ETOS landing page
- [x] 3 module definitions + 92 existing questions
- [ ] New Supabase project connection
- [ ] Database migration execution
- [ ] Security advisor check
- [ ] Vercel import (user will import this GitHub repo)

## Environment variables
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never expose `SUPABASE_SECRET_KEY` in browser code.
