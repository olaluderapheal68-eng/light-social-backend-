# Light Social Backend

Express API + Supabase for the Light social platform.

## Included now

- Health and API discovery routes
- Public post feed, create post, view post, delete own post
- Read and update own profile
- List and create communities, join community
- Like/unlike posts
- Read and create comments
- Follow/unfollow users
- Read and mark notifications as read
- One-to-one text messages
- Bearer-token verification using Supabase Auth
- CORS allow-list, Helmet headers, request body limit, input validation

**This is a functional MVP backend foundation, not a finished production social network.** Voice/video calls, realtime chat, uploads/storage, moderation, rate limiting, and full notification generation still need implementation and testing.

## Requirements

- Node.js 20 or newer
- Existing Supabase project

## Local setup

1. Open a terminal in this folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in the values from Supabase project settings.
4. Run the schema script in Supabase SQL Editor (`supabase/schema.sql`). Back up your project first. If you already have tables, review the script before running it.
5. Start the API:

   ```bash
   npm run dev
   ```

6. Test:
   - `http://localhost:5000/`
   - `http://localhost:5000/health`
   - `http://localhost:5000/api`
   - `http://localhost:5000/api/posts`

## Render deployment

- Push these backend files to the backend GitHub repository.
- Render service settings:
  - Build Command: `npm install`
  - Start Command: `npm start`
- Add environment variables in Render:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CORS_ORIGIN` (the deployed frontend origin, e.g. `https://your-app.vercel.app`; multiple origins separated by commas)
  - `NODE_ENV=production`
- Do not commit `.env`, paste secret keys in chat, or put the service-role key in frontend environment variables.
- Deploy, then test `/health` and `/api/posts`.

## Authentication from the frontend

Send the Supabase session access token as a Bearer token:

```js
fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`
  },
  body: JSON.stringify({ content: "Hello from Light", image_url: null })
});
```

## Endpoint summary

| Method | Endpoint | Access |
|---|---|---|
| GET | `/health` | Public |
| GET | `/api` | Public |
| GET | `/api/posts` | Public |
| GET | `/api/posts/:id` | Public |
| POST | `/api/posts` | Signed in |
| DELETE | `/api/posts/:id` | Owner only |
| GET | `/api/profiles/:id` | Public |
| PATCH | `/api/profiles/me` | Signed in |
| GET | `/api/communities` | Public |
| POST | `/api/communities` | Signed in |
| POST | `/api/communities/:id/join` | Signed in |
| POST/DELETE | `/api/posts/:id/like` | Signed in |
| GET/POST | `/api/posts/:id/comments` | Read public / create signed in |
| POST/DELETE | `/api/users/:id/follow` | Signed in |
| GET | `/api/notifications` | Signed in |
| PATCH | `/api/notifications/:id/read` | Own notification |
| GET | `/api/messages/:userId` | Signed in |
| POST | `/api/messages` | Signed in |

## Important notes

- Service-role database access bypasses RLS. This API therefore checks ownership for protected actions. Review every route before a public launch.
- The current schema assumes `profiles.id` equals the Supabase Auth user ID and `posts.user_id` references `auth.users.id`.
- Database writes and all features should be tested in your actual Supabase project before presenting the backend as complete.
- Never claim voice/video calling is implemented by this API; it needs a realtime/WebRTC or provider integration.
