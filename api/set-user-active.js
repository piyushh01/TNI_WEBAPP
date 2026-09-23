import { admin, route, getCaller, getProfile, canManage, HttpError } from "./_lib.js";

// Activates / deactivates a user. Deactivating also bans the auth user so
// they can no longer sign in (a profile flag alone doesn't block login).
export default route(async (req) => {
  const caller = await getCaller(req);
  const { user_id, active } = req.body || {};
  const target = await getProfile(user_id);
  if (!canManage(caller, target)) throw new HttpError(403, "Not allowed");
  if (target.id === caller.id) throw new HttpError(400, "You can't deactivate yourself");

  const { error } = await admin().auth.admin.updateUserById(target.id, { ban_duration: active ? "none" : "876000h" });
  if (error) throw new HttpError(400, error.message);
  const { error: pErr } = await admin().from("profiles").update({ is_active: !!active }).eq("id", target.id);
  if (pErr) throw new HttpError(400, pErr.message);
  return { id: target.id, is_active: !!active };
});
