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

## Current implementation
- [x] Supabase project khusus ETOS Assessment Center
- [x] Database schema + RLS + security hardening
- [x] 3 modul / 92 pertanyaan
- [x] Verifikasi awardee menggunakan 4 digit terakhir WhatsApp
- [x] Autosave assessment + offline recovery
- [x] Manajemen awardee manual dan import CSV
- [x] Dashboard internal dan monitor assessment
- [x] Scoring profil reflektif dan orientasi karier
- [x] Private coaching signals dengan akses terbatas
- [x] Jawaban detail selected / unselected
- [x] Pendampingan, action plan, deadline, dan histori
- [x] Audit log
- [x] Branding logo ETOS transparan WebP + favicon PNG

## Security notes
Nomor WhatsApp lengkap tidak disimpan. Sistem hanya menyimpan hash verifikasi dan 4 digit terakhir untuk tampilan internal. Jawaban sensitif dan coaching signals dibatasi oleh Row Level Security dan permission `assessment.view_private`.

`SUPABASE_SECRET_KEY` hanya boleh tersedia pada server/Vercel dan tidak boleh dikirim ke browser.

## Local setup
1. Jalankan `npm install`.
2. Sediakan `SUPABASE_SECRET_KEY` pada environment server lokal jika menguji endpoint server yang membutuhkan akses admin.
3. Jalankan `npm run dev`.

## Production
GitHub: `shadiqalfatih2-sudo/asasemen-etos`  
Vercel project: `asasemen-etosidpalu`  
Supabase project: `ETOS Assessment Center`
