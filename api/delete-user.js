import { admin, route, getCaller, getProfile, canManage, HttpError } from "./_lib.js";

// Permanently deletes a user and everything that belongs to them (their
// trainings, parts, notes and approval requests cascade with the profile).
// Admins can delete anyone except themselves; managers only their reportees.
export default route(async (req) => {
  const caller = await getCaller(req);
  const target = await getProfile(req.body?.user_id);
  if (!canManage(caller, target)) throw new HttpError(403, "Not allowed");
  if (target.id === caller.id) throw new HttpError(400, "You can't delete yourself");

  const { count } = await admin().from("profiles").select("id", { count: "exact", head: true }).eq("manager_id", target.id);
  if (count) throw new HttpError(400, `${target.full_name} still has ${count} reportee(s) — move them to another manager first`);

  // Trainings this user assigned to others must keep an assigner (NOT NULL):
  // hand them to the person doing the delete.
  const { error: reErr } = await admin().from("trainings")
    .update({ assigned_by: caller.id })
    .eq("assigned_by", target.id).neq("assigned_to", target.id);
  if (reErr) throw new HttpError(400, reErr.message);

  const { error } = await admin().auth.admin.deleteUser(target.id);
  if (error) throw new HttpError(400, error.message);
  return { id: target.id, deleted: true };
});
