import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const encoder = new TextEncoder();
const BUCKET = "PRECIOUS MEMORIES";
const ITERATIONS = 310000;
const MIN_PASSWORD_LENGTH = 10;

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(value: string) {
  return new Uint8Array((value.match(/.{1,2}/g) || []).map((x) => parseInt(x, 16)));
}
async function derive(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return hex(new Uint8Array(bits));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function cleanName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return json({ error: "Server is not configured." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in again." }, 401);

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);
  const user = authData.user;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const masterPassword = String(body.masterPassword || "");
    const { data: credential, error: credentialError } = await admin
      .from("memory_admin_credentials").select("password_salt,password_hash").eq("user_id", user.id).maybeSingle();
    if (credentialError) throw credentialError;

    if (action === "setupMasterPassword") {
      if (credential) return json({ error: "Master Password is already set. Use Change Password." }, 409);
      if (masterPassword.length < MIN_PASSWORD_LENGTH) {
        return json({ error: "Choose a Master Password with at least 10 characters." }, 400);
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = hex(salt);
      const passwordHash = await derive(masterPassword, saltHex);
      const { error } = await admin.from("memory_admin_credentials").insert({
        user_id: user.id, password_salt: saltHex, password_hash: passwordHash,
      });
      if (error) throw error;
      return json({ ok: true, message: "Master Password created." });
    }

    if (action === "status") return json({ ok: true, hasMasterPassword: Boolean(credential) });
    if (!masterPassword) return json({ error: "Master Password is required." }, 400);
    if (!credential) return json({ error: "Set up your Master Password first." }, 403);
    const candidate = await derive(masterPassword, credential.password_salt);
    if (!safeEqual(candidate, credential.password_hash)) return json({ error: "Incorrect Master Password." }, 403);

    if (action === "changeMasterPassword") {
      const next = String(body.newMasterPassword || "");
      if (next.length < MIN_PASSWORD_LENGTH) return json({ error: "New password must contain at least 10 characters." }, 400);
      const saltHex = hex(crypto.getRandomValues(new Uint8Array(16)));
      const passwordHash = await derive(next, saltHex);
      const { error } = await admin.from("memory_admin_credentials").update({
        password_salt: saltHex, password_hash: passwordHash, updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
      if (error) throw error;
      return json({ ok: true, message: "Master Password changed." });
    }

    if (action === "updateAlbum") {
      const date = String(body.date || "");
      const title = String(body.title || "").trim().slice(0, 70);
      const description = String(body.description || "").trim().slice(0, 300);
      if (!validDate(date) || !title) return json({ error: "A valid date and album name are required." }, 400);
      const path = `${user.id}/${date}/album.json`;
      const { error } = await admin.storage.from(BUCKET).upload(path,
        new Blob([JSON.stringify({ title, description })], { type: "application/json" }),
        { contentType: "application/json", upsert: true });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "deleteMedia") {
      const path = String(body.path || "");
      if (!path.startsWith(`${user.id}/`) || path.split("/").length !== 3 || path.endsWith("/album.json")) {
        return json({ error: "Invalid media path." }, 400);
      }
      const { error } = await admin.storage.from(BUCKET).remove([path]);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "deleteAlbum") {
      const date = String(body.date || "");
      if (!validDate(date)) return json({ error: "Invalid album date." }, 400);
      const root = `${user.id}/${date}`;
      const paths: string[] = [];
      async function collect(prefix: string): Promise<void> {
        const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
        if (error) throw error;
        for (const item of data || []) {
          const itemPath = `${prefix}/${item.name}`;
          if (!item.id) await collect(itemPath);
          else paths.push(itemPath);
        }
      }
      await collect(root);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
      return json({ ok: true, deletedCount: paths.length });
    }

    if (action === "listText") {
      const { data, error } = await admin.from("text_memories").select("id,content,created_at,updated_at")
        .eq("user_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, memories: data || [] });
    }

    if (action === "addText" || action === "updateText") {
      const content = String(body.content || "").trim();
      if (!content || content.length > 5000) return json({ error: "Memory text must be 1–5000 characters." }, 400);
      if (action === "addText") {
        const { data, error } = await admin.from("text_memories").insert({ user_id: user.id, content })
          .select("id,content,created_at,updated_at").single();
        if (error) throw error;
        return json({ ok: true, memory: data });
      }
      const id = String(body.id || "");
      const { data, error } = await admin.from("text_memories").update({ content, updated_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", user.id).select("id,content,created_at,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Memory not found." }, 404);
      return json({ ok: true, memory: data });
    }

    if (action === "deleteText") {
      const { error } = await admin.from("text_memories").delete().eq("id", String(body.id || "")).eq("user_id", user.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "createUploadUrl") {
      const date = String(body.date || "");
      const fileName = cleanName(String(body.fileName || ""));
      if (!validDate(date) || !fileName || fileName === "album.json") return json({ error: "Invalid upload details." }, 400);
      const path = `${user.id}/${date}/${crypto.randomUUID()}_${fileName}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error) throw error;
      return json({ ok: true, path: data.path, token: data.token });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("memory-admin error", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
