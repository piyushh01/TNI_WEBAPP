import { createClient } from "@supabase/supabase-js";

// Shared helpers for the /api serverless functions. Files starting with "_"
// are not exposed as routes by Vercel (or by the Vite dev middleware).

let _admin, _anon;
// Service-role client: bypasses RLS, never expose this key to the browser.
export function admin() {
  return (_admin ||= createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
// Anon client: verifies callers' tokens and sends password-reset emails.
export function anon() {
  return (_anon ||= createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Wraps a handler: POST-only, JSON errors.
export function route(fn) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
    }
    try {
      return res.status(200).json(await fn(req));
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || "Server error" });
    }
  };
}

// Resolves the signed-in caller and their profile from the Bearer token.
export async function getCaller(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing auth token");
  const { data: { user }, error } = await anon().auth.getUser(token);
  if (error || !user) throw new HttpError(401, "Invalid session");
  const { data: profile } = await admin().from("profiles").select("*").eq("id", user.id).single();
  if (!profile) throw new HttpError(403, "Profile not found");
  if (!profile.is_active) throw new HttpError(403, "Your account is deactivated");
  return profile;
}

export async function getProfile(id) {
  const { data } = await admin().from("profiles").select("*").eq("id", id).single();
  if (!data) throw new HttpError(404, "User not found");
  return data;
}

// Admins manage everyone; managers manage their direct reportees.
export function canManage(caller, target) {
  return caller.role === "admin" || (caller.role === "reporting_manager" && target.manager_id === caller.id);
}

// Where links in invite / reset emails should land.
export function appOrigin(req) {
  const o = req.headers.origin;
  if (o) return o;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
