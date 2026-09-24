import { supabase } from "./supabaseClient";

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(session, event));
  return () => data.subscription.unsubscribe();
}

export async function updateMyPassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

// ── Profile ──────────────────────────────────────────────────────────────────
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

export async function clearMustChangePassword(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", userId);
  if (error) throw error;
}

// Everyone this user may see under RLS: self, manager, reportees, teammates
// (admins: everyone). Used for name lookups, e.g. in the Knowledge Hub.
export async function listVisibleProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  if (error) throw error;
  return data;
}

export async function listMyReportees() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("manager_id", user.id)
    .order("full_name");
  if (error) throw error;
  return data;
}

// ── Categories ───────────────────────────────────────────────────────────────
export async function listCategories() {
  const { data, error } = await supabase
    .from("training_categories")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return data;
}

// ── Trainings (RLS scopes rows to what the caller may see) ────────────────────
export async function listTrainings() {
  const { data, error } = await supabase
    .from("trainings")
    .select("*, training_parts(*), training_categories(id, group_name, name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTraining(payload, parts = []) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: training, error } = await supabase
    .from("trainings")
    .insert({ ...payload, assigned_by: user.id })
    .select()
    .single();
  if (error) throw error;

  if (parts.length) {
    const rows = parts.map((p, i) => ({
      training_id: training.id,
      title: p.title,
      part_link: p.part_link || null,
      sort_order: i,
    }));
    const { error: partsErr } = await supabase.from("training_parts").insert(rows);
    if (partsErr) throw partsErr;
  }
  return training;
}

export async function updateTraining(id, patch) {
  const { error } = await supabase.from("trainings").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTraining(id) {
  const { error } = await supabase.from("trainings").delete().eq("id", id);
  if (error) throw error;
}

// Reportee progress (server-enforced via RPC)
export async function startTraining(trainingId) {
  const { error } = await supabase.rpc("start_training", { p_training: trainingId });
  if (error) throw error;
}

export async function updateProgress(trainingId, pct) {
  const { error } = await supabase.rpc("update_progress", { p_training: trainingId, p_pct: pct });
  if (error) throw error;
}

// ── Training Catalog (managers/admins) ───────────────────────────────────────
export async function listCatalog() {
  const { data, error } = await supabase
    .from("training_catalog")
    .select("*, training_categories(id, group_name, name)")
    .order("name");
  if (error) throw error;
  return data;
}

export async function saveCatalogItem(item) {
  const { id, training_categories, created_at, updated_at, ...row } = item;
  const q = id
    ? supabase.from("training_catalog").update(row).eq("id", id)
    : supabase.from("training_catalog").insert(row);
  const { error } = await q;
  if (error) throw error.code === "23505" ? new Error(`A catalog training named "${row.name}" already exists`) : error;
}

export async function insertCatalogItems(rows) {
  const { error } = await supabase.from("training_catalog").insert(rows);
  if (error) throw error.code === "23505" ? new Error("One or more training names already exist in the catalog") : error;
}

export async function deleteCatalogItems(ids) {
  const { error } = await supabase.from("training_catalog").delete().in("id", ids);
  if (error) throw error;
}

// ── Approval workflow (server-enforced via RPC) ────────────────────────────────
export async function submitForApproval(trainingId, partId, notes, outcomeLinks) {
  const { data, error } = await supabase.rpc("submit_for_approval", {
    p_training: trainingId,
    p_part: partId,
    p_notes: notes,
    p_outcome_links: outcomeLinks,
  });
  if (error) throw error;
  return data;
}

export async function approveRequest(requestId, remarks) {
  const { error } = await supabase.rpc("approve_request", {
    p_request: requestId,
    p_remarks: remarks || null,
  });
  if (error) throw error;
}

export async function sendBackRequest(requestId, remarks) {
  const { error } = await supabase.rpc("send_back_request", {
    p_request: requestId,
    p_remarks: remarks,
  });
  if (error) throw error;
}

export async function listPendingApprovals() {
  const { data, error } = await supabase
    .from("v_pending_approvals")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return data;
}

// Completed/approved requests — used to show notes + outcome links for a
// training or part once it's approved (Knowledge Hub, training detail).
export async function listRequestsFor(trainingIds) {
  if (!trainingIds.length) return [];
  const { data, error } = await supabase
    .from("completion_requests")
    .select("*")
    .in("training_id", trainingIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Admin/HR: every request in the org (RLS grants admins read access).
export async function listAllRequests() {
  const { data, error } = await supabase
    .from("completion_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ── Settings (one row per manager; RLS restricts to your own) ─────────────────
export async function getSettings() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("manager_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertSettings(patch) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ manager_id: user.id, ...patch });
  if (error) throw error;
}

export async function markReminderSent(trainingId) {
  const { error } = await supabase
    .from("trainings")
    .update({ last_reminder_sent: new Date().toISOString().slice(0, 10) })
    .eq("id", trainingId);
  if (error) throw error;
}

// ── Financial-year carry/discard (no single RPC ships this; mirrors it client-side) ─
export async function finalizeYear(currentFy, nextFy, decisions, allTrainings) {
  for (const { id, action } of decisions) {
    const orig = allTrainings.find(t => t.id === id);
    if (!orig) continue;

    await supabase.from("trainings").update({ status: "discarded" }).eq("id", id);

    if (action === "carry") {
      const { data: created, error } = await supabase
        .from("trainings")
        .insert({
          assigned_to: orig.assigned_to,
          assigned_by: orig.assigned_by,
          name: orig.name,
          category_id: orig.category_id,
          training_link: orig.training_link,
          mode: orig.mode,
          trainer: orig.trainer,
          priority: orig.priority,
          expected_end_date: orig.expected_end_date,
          due_date: null,
          resources: orig.resources,
          fy: nextFy,
          carried_from_fy: currentFy,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;

      const parts = orig.training_parts || [];
      if (parts.length) {
        const rows = parts.map((p, i) => ({
          training_id: created.id,
          title: p.title,
          part_link: p.part_link,
          sort_order: p.sort_order ?? i,
        }));
        await supabase.from("training_parts").insert(rows);
      }
    }
  }
}

// ── User management (managers/admins; goes through service-role /api functions) ─
async function callApi(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  let json = {};
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// → { id, email, email_sent, invite_link? }
export const provisionUser = ({ full_name, email, color, role, manager_id }) =>
  callApi("provision-user", { full_name, email, color, role, manager_id });

// → { email, email_sent, invite_link? }
export const sendSetupLink = (userId) => callApi("send-setup-link", { user_id: userId });

export const setUserActive = (userId, active) => callApi("set-user-active", { user_id: userId, active });

export const adminUpdateUser = (userId, patch) => callApi("update-user", { user_id: userId, ...patch });
