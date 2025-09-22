# Weazel News Kit V6 — Stable for Vercel

Правки:
- `index.html` ссылается на `/src/main.jsx` (абсолютный путь от корня).
- `vite.config.js` с `alias` для `@` -> `src`, base:'' и outDir:'dist'.
- `vite` и `@vitejs/plugin-react` в dependencies, Node >=18.

## Деплой
1. Залей все файлы (включая папки src и api) в новый репозиторий GitHub.
2. В Vercel → New Project → выбери репозиторий.
3. Framework: Vite, Root: ./, Build: npm run build, Output: dist.
4. В Settings → Environment Variables добавь:
   - DISCORD_WEBHOOK_PUBLIC
   - DISCORD_WEBHOOK_CURATORS (опционально)
5. Deploy.
