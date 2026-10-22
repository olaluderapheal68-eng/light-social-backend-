# Light Render Backend
Starter Express API for Light, deployed on Render and connected to Supabase.

## Supabase
Run `schema.sql` in Supabase Dashboard -> SQL Editor -> New query.

## Render
Create a GitHub repository for this backend folder. In Render choose New + -> Web Service and connect that repository.
Build command: `npm install`
Start command: `npm start`
Add environment variables from `.env.example` using real values. Set CORS_ORIGIN to your public Vercel website URL. Render supplies PORT automatically.

Test `https://YOUR-RENDER-SERVICE.onrender.com/health`.

Routes: GET /health, GET /api, GET /api/posts, POST /api/posts (Bearer Supabase access token), GET /api/profiles/:id, PATCH /api/profiles/me (Bearer token), GET /api/communities.

Never put SUPABASE_SERVICE_ROLE_KEY in frontend code or a NEXT_PUBLIC variable. This is a starter API, not the complete backend: messaging, likes, follows, notifications, calls, media uploads, and moderation still need implementation.
