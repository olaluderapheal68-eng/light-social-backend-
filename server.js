require("dotenv").config();
const express=require("express");
const cors=require("cors");
const helmet=require("helmet");
const {createClient}=require("@supabase/supabase-js");
const app=express(); app.disable("x-powered-by"); app.use(helmet());
app.use(cors({origin:(process.env.CORS_ORIGIN||"*").split(",").map(x=>x.trim()),methods:["GET","POST","PATCH","DELETE","OPTIONS"],allowedHeaders:["Content-Type","Authorization"]}));
app.use(express.json({limit:"1mb"}));
const PORT=process.env.PORT||10000;
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase environment check:", {
  urlPresent: Boolean(url),
  anonPresent: Boolean(anon),
  servicePresent: Boolean(service),
});
let db=null, auth=null;
if(url&&anon&&service){auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});}
function configured(req,res,next){if(!db||!auth)return res.status(503).json({error:"Supabase is not configured. Add the three Supabase environment variables in Render."});next();}
async function userRequired(req,res,next){try{const h=req.headers.authorization||"";const token=h.startsWith("Bearer ")?h.slice(7):"";if(!token)return res.status(401).json({error:"Missing Bearer access token."});const {data,error}=await auth.auth.getUser(token);if(error||!data.user)return res.status(401).json({error:"Invalid or expired access token."});req.user=data.user;next();}catch(e){next(e);}}
app.get("/",(req,res)=>res.json({name:"Light API",status:"running",health:"/health",api:"/api"}));
app.get("/health",(req,res)=>res.json({ok:true,service:"light-api",timestamp:new Date().toISOString()}));
app.get("/api",(req,res)=>res.json({name:"Light Social API",version:"1.0.0",endpoints:["GET /health","GET /api/posts","POST /api/posts (Bearer token)","GET /api/profiles/:id","PATCH /api/profiles/me (Bearer token)","GET /api/communities"]}));
app.get("/api/posts",configured,async(req,res,next)=>{try{const limit=Math.min(Math.max(parseInt(req.query.limit||"20",10)||20,1),50);const {data,error}=await db.from("posts").select("id,user_id,content,image_url,created_at").order("created_at",{ascending:false}).limit(limit);if(error)return res.status(500).json({error:error.message});res.json({data});}catch(e){next(e);}});
app.post("/api/posts",configured,userRequired,async(req,res,next)=>{try{const content=typeof req.body.content==="string"?req.body.content.trim():"";const image_url=typeof req.body.image_url==="string"?req.body.image_url.trim():null;if(!content&&!image_url)return res.status(400).json({error:"A post must contain text or an image URL."});if(content.length>5000)return res.status(400).json({error:"Post text must be 5000 characters or fewer."});const {data,error}=await db.from("posts").insert({user_id:req.user.id,content,image_url}).select("id,user_id,content,image_url,created_at").single();if(error)return res.status(500).json({error:error.message});res.status(201).json({data});}catch(e){next(e);}});
app.get("/api/profiles/:id",configured,async(req,res,next)=>{try{const {data,error}=await db.from("profiles").select("id,username,display_name,bio,avatar_url,created_at").eq("id",req.params.id).maybeSingle();if(error)return res.status(500).json({error:error.message});if(!data)return res.status(404).json({error:"Profile not found."});res.json({data});}catch(e){next(e);}});
app.patch("/api/profiles/me",configured,userRequired,async(req,res,next)=>{try{const fields={};for(const k of ["username","display_name","bio","avatar_url"]){if(Object.hasOwn(req.body,k)){if(typeof req.body[k]!=="string")return res.status(400).json({error:k+" must be a string."});fields[k]=req.body[k].trim();}}if(!Object.keys(fields).length)return res.status(400).json({error:"Provide a profile field to update."});if(fields.username&&!/^[a-zA-Z0-9_]{3,24}$/.test(fields.username))return res.status(400).json({error:"Username must be 3-24 letters, digits, or underscores."});const {data,error}=await db.from("profiles").upsert({id:req.user.id,...fields},{onConflict:"id"}).select("id,username,display_name,bio,avatar_url,created_at").single();if(error)return res.status(500).json({error:error.message});res.json({data});}catch(e){next(e);}});
app.get("/api/communities",configured,async(req,res,next)=>{try{const {data,error}=await db.from("communities").select("id,name,slug,description,created_at").order("created_at",{ascending:false}).limit(50);if(error)return res.status(500).json({error:error.message});res.json({data});}catch(e){next(e);}});
app.use((req,res)=>res.status(404).json({error:"Route not found."}));
app.use((err,req,res,next)=>{console.error("API error:",err?.message||err);res.status(500).json({error:"Unexpected server error."});});
app.listen(PORT,()=>console.log("Light API listening on port "+PORT));
