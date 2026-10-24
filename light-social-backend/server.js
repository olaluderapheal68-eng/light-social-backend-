require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://light-social-sandy.vercel.app"
  ],
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
const PORT = Number(process.env.PORT) || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let db = null;
let authClient = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) {
  authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  // Server-only client. Never expose the service role key to the browser.
  db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const configured = (req, res, next) => {
  if (!db || !authClient) {
    return res.status(503).json({
      error: "Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    });
  }
  next();
};

const origins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",").map((item) => item.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Allow requests without Origin (curl, health checks, server-to-server).
    if (!origin || origins.includes("*") || origins.includes(origin)) return callback(null, true);
    return callback(new Error("This origin is not allowed by CORS."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1mb" }));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const requireUser = asyncRoute(async (req, res, next) => {
  if (!db || !authClient) {
    return res.status(503).json({ error: "Supabase is not configured." });
  }
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "A valid Bearer access token is required." });

  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data.user) return res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });

  req.user = data.user;
  next();
});

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanString(value, maxLength = 5000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sendDbError(res, error) {
  // Avoid returning internal SQL, keys, or stack traces to clients.
  console.error("Supabase query failed:", error.message);
  return res.status(500).json({ error: "The database request failed. Check the server logs." });
}

app.get("/", (req, res) => {
  res.json({ name: "Light API", status: "running", health: "/health", api: "/api" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "light-api", timestamp: new Date().toISOString() });
});

app.get("/api", (req, res) => {
  res.json({
    name: "Light Social API",
    version: "1.1.0",
    endpoints: [
      "GET /health",
      "GET /api/posts",
      "POST /api/posts (Bearer token)",
      "GET /api/posts/:id",
      "DELETE /api/posts/:id (owner only)",
      "GET /api/profiles/:id",
      "PATCH /api/profiles/me (Bearer token)",
      "GET /api/communities",
      "POST /api/communities (Bearer token)",
      "POST /api/communities/:id/join (Bearer token)",
      "POST /api/posts/:id/like (Bearer token)",
      "DELETE /api/posts/:id/like (Bearer token)",
      "GET /api/posts/:id/comments",
      "POST /api/posts/:id/comments (Bearer token)",
      "POST /api/users/:id/follow (Bearer token)",
      "DELETE /api/users/:id/follow (Bearer token)",
      "GET /api/notifications (Bearer token)",
      "GET /api/messages/:userId (Bearer token)",
      "POST /api/messages (Bearer token)"
    ]
  });
});

// POSTS
app.get("/api/posts", configured, asyncRoute(async (req, res) => {
  const parsed = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 20, 1), 50);
  const { data, error } = await db.from("posts")
    .select("id,user_id,content,image_url,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return sendDbError(res, error);
  res.json({ data: data || [] });
}));

app.get("/api/posts/:id", configured, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
  const { data, error } = await db.from("posts")
    .select("id,user_id,content,image_url,created_at").eq("id", req.params.id).maybeSingle();
  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: "Post not found." });
  res.json({ data });
}));

app.post("/api/posts", configured, requireUser, asyncRoute(async (req, res) => {
  const content = cleanString(req.body.content, 5000);
  const image_url = cleanString(req.body.image_url, 2048) || null;
  if (!content && !image_url) return res.status(400).json({ error: "A post must contain text or an image URL." });
  if (image_url && !/^https?:\/\/\S+$/i.test(image_url)) return res.status(400).json({ error: "Image URL must start with http:// or https://." });
  const { data, error } = await db.from("posts")
    .insert({ user_id: req.user.id, content, image_url })
    .select("id,user_id,content,image_url,created_at").single();
  if (error) return sendDbError(res, error);
  res.status(201).json({ data });
}));

app.delete("/api/posts/:id", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
  const { data, error } = await db.from("posts").select("id,user_id").eq("id", req.params.id).maybeSingle();
  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: "Post not found." });
  if (data.user_id !== req.user.id) return res.status(403).json({ error: "You can only delete your own posts." });
  const { error: deleteError } = await db.from("posts").delete().eq("id", req.params.id);
  if (deleteError) return sendDbError(res, deleteError);
  res.status(204).send();
}));

// PROFILES
app.get("/api/profiles/:id", configured, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid profile ID." });
  const { data, error } = await db.from("profiles")
    .select("id,username,display_name,bio,avatar_url,created_at")
    .eq("id", req.params.id).maybeSingle();
  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: "Profile not found." });
  res.json({ data });
}));

app.patch("/api/profiles/me", configured, requireUser, asyncRoute(async (req, res) => {
  const allowed = {};
  if (typeof req.body.username === "string") allowed.username = cleanString(req.body.username, 30).replace(/^@/, "");
  if (typeof req.body.display_name === "string") allowed.display_name = cleanString(req.body.display_name, 80);
  if (typeof req.body.bio === "string") allowed.bio = cleanString(req.body.bio, 300);
  if (typeof req.body.avatar_url === "string") {
    const avatar = cleanString(req.body.avatar_url, 2048);
    if (avatar && !/^https?:\/\/\S+$/i.test(avatar)) return res.status(400).json({ error: "Avatar URL must start with http:// or https://." });
    allowed.avatar_url = avatar || null;
  }
  if (allowed.username && !/^[a-zA-Z0-9_]{3,30}$/.test(allowed.username)) {
    return res.status(400).json({ error: "Username must be 3–30 characters using letters, numbers, or underscores." });
  }
  if (!Object.keys(allowed).length) return res.status(400).json({ error: "Provide at least one profile field to update." });

  const { data, error } = await db.from("profiles")
    .upsert({ id: req.user.id, ...allowed }, { onConflict: "id" })
    .select("id,username,display_name,bio,avatar_url,created_at").single();
  if (error) return sendDbError(res, error);
  res.json({ data });
}));

// COMMUNITIES
app.get("/api/communities", configured, asyncRoute(async (req, res) => {
  const parsed = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 30, 1), 100);
  const { data, error } = await db.from("communities")
    .select("id,name,slug,description,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return sendDbError(res, error);
  res.json({ data: data || [] });
}));

app.post("/api/communities", configured, requireUser, asyncRoute(async (req, res) => {
  const name = cleanString(req.body.name, 80);
  const description = cleanString(req.body.description, 500);
  const slug = cleanString(req.body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), 80);
  if (name.length < 2) return res.status(400).json({ error: "Community name must be at least 2 characters." });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return res.status(400).json({ error: "Community slug must use lowercase letters, numbers, and hyphens." });
  const { data, error } = await db.from("communities")
    .insert({ name, slug, description }).select("id,name,slug,description,created_at").single();
  if (error) return sendDbError(res, error);
  res.status(201).json({ data });
}));

app.post("/api/communities/:id/join", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid community ID." });
  const { data: community, error: findError } = await db.from("communities").select("id").eq("id", req.params.id).maybeSingle();
  if (findError) return sendDbError(res, findError);
  if (!community) return res.status(404).json({ error: "Community not found." });
  const { error } = await db.from("community_members").upsert(
    { community_id: req.params.id, user_id: req.user.id }, { onConflict: "community_id,user_id", ignoreDuplicates: true }
  );
  if (error) return sendDbError(res, error);
  res.status(200).json({ joined: true });
}));

// LIKES
app.post("/api/posts/:id/like", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
  const { data: post, error: postError } = await db.from("posts").select("id").eq("id", req.params.id).maybeSingle();
  if (postError) return sendDbError(res, postError);
  if (!post) return res.status(404).json({ error: "Post not found." });
  const { error } = await db.from("post_likes").upsert(
    { post_id: req.params.id, user_id: req.user.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true }
  );
  if (error) return sendDbError(res, error);
  res.json({ liked: true });
}));

app.delete("/api/posts/:id/like", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
  const { error } = await db.from("post_likes").delete().eq("post_id", req.params.id).eq("user_id", req.user.id);
  if (error) return sendDbError(res, error);
  res.json({ liked: false });
}));

// COMMENTS
app.get("/api/posts/:id/comments", configured, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
  const { data, error } = await db.from("comments")
    .select("id,post_id,user_id,content,created_at")
    .eq("post_id", req.params.id).order("created_at", { ascending: true }).limit(100);
  if (error) return sendDbError(res, error);
  res.json({ data: data || [] });
}));

app.post("/api/posts/:id/comments", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid post ID." });
  const content = cleanString(req.body.content, 2000);
  if (!content) return res.status(400).json({ error: "Comment text is required." });
  const { data, error } = await db.from("comments")
    .insert({ post_id: req.params.id, user_id: req.user.id, content })
    .select("id,post_id,user_id,content,created_at").single();
  if (error) return sendDbError(res, error);
  res.status(201).json({ data });
}));

// FOLLOWING
app.post("/api/users/:id/follow", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid user ID." });
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You cannot follow yourself." });
  const { error } = await db.from("follows").upsert(
    { follower_id: req.user.id, following_id: req.params.id }, { onConflict: "follower_id,following_id", ignoreDuplicates: true }
  );
  if (error) return sendDbError(res, error);
  res.json({ following: true });
}));

app.delete("/api/users/:id/follow", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid user ID." });
  const { error } = await db.from("follows").delete()
    .eq("follower_id", req.user.id).eq("following_id", req.params.id);
  if (error) return sendDbError(res, error);
  res.json({ following: false });
}));

// NOTIFICATIONS (generated by future feature handlers or inserted by trusted server code)
app.get("/api/notifications", configured, requireUser, asyncRoute(async (req, res) => {
  const { data, error } = await db.from("notifications")
    .select("id,recipient_id,actor_id,type,entity_id,read_at,created_at")
    .eq("recipient_id", req.user.id).order("created_at", { ascending: false }).limit(50);
  if (error) return sendDbError(res, error);
  res.json({ data: data || [] });
}));

app.patch("/api/notifications/:id/read", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: "Invalid notification ID." });
  const { data, error } = await db.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", req.params.id).eq("recipient_id", req.user.id)
    .select("id,read_at").maybeSingle();
  if (error) return sendDbError(res, error);
  if (!data) return res.status(404).json({ error: "Notification not found." });
  res.json({ data });
}));

// BASIC DIRECT MESSAGES. This MVP endpoint is for authenticated one-to-one text messages.
// Production chat/calls need additional realtime, abuse, rate-limit, and authorization work.
app.get("/api/messages/:userId", configured, requireUser, asyncRoute(async (req, res) => {
  if (!isUuid(req.params.userId)) return res.status(400).json({ error: "Invalid user ID." });
  const { data, error } = await db.from("messages")
    .select("id,sender_id,recipient_id,content,created_at")
    .or(`and(sender_id.eq.${req.user.id},recipient_id.eq.${req.params.userId}),and(sender_id.eq.${req.params.userId},recipient_id.eq.${req.user.id})`)
    .order("created_at", { ascending: true }).limit(100);
  if (error) return sendDbError(res, error);
  res.json({ data: data || [] });
}));

app.post("/api/messages", configured, requireUser, asyncRoute(async (req, res) => {
  const recipient_id = cleanString(req.body.recipient_id, 64);
  const content = cleanString(req.body.content, 4000);
  if (!isUuid(recipient_id)) return res.status(400).json({ error: "A valid recipient_id is required." });
  if (recipient_id === req.user.id) return res.status(400).json({ error: "You cannot message yourself." });
  if (!content) return res.status(400).json({ error: "Message text is required." });
  const { data, error } = await db.from("messages")
    .insert({ sender_id: req.user.id, recipient_id, content })
    .select("id,sender_id,recipient_id,content,created_at").single();
  if (error) return sendDbError(res, error);
  res.status(201).json({ data });
}));

app.use((req, res) => res.status(404).json({ error: "Route not found." }));

app.use((err, req, res, next) => {
  if (err && err.message === "This origin is not allowed by CORS.") {
    return res.status(403).json({ error: "This origin is not allowed by CORS." });
  }
  console.error("Unhandled server error:", err && err.message ? err.message : err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Light API listening on port ${PORT}`);
  console.log(`Supabase configured: ${Boolean(db && authClient)}`);
  console.log(`Allowed frontend origins: ${origins.join(", ")}`);
});
