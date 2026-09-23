import { admin, route, getCaller, getProfile, HttpError } from "./_lib.js";

const ROLES = ["reportee", "reporting_manager", "admin"];

// Admin-only: change a user's name, role or reporting manager.
export default route(async (req) => {
  const caller = await getCaller(req);
  if (caller.role !== "admin") throw new HttpError(403, "Only admins can edit users");
  const { user_id, full_name, role, manager_id } = req.body || {};
  const target = await getProfile(user_id);

  const patch = {};
  if (full_name !== undefined) {
    if (!full_name.trim()) throw new HttpError(400, "Name is required");
    patch.full_name = full_name.trim();
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) throw new HttpError(400, "Invalid role");
    if (target.id === caller.id && role !== "admin") throw new HttpError(400, "You can't remove your own admin role");
    patch.role = role;
  }
  if (manager_id !== undefined) {
    if (manager_id) {
      if (manager_id === target.id) throw new HttpError(400, "A user can't report to themselves");
      const mgr = await getProfile(manager_id);
      if (mgr.role !== "reporting_manager") throw new HttpError(400, "Selected reporting manager is not a manager");
    }
    patch.manager_id = manager_id || null;
  }
  const finalRole = patch.role ?? target.role;
  const finalMgr = "manager_id" in patch ? patch.manager_id : target.manager_id;
  if (finalRole === "reportee" && !finalMgr) throw new HttpError(400, "A reportee needs a reporting manager");

  const { data, error } = await admin().from("profiles").update(patch).eq("id", target.id).select().single();
  if (error) throw new HttpError(400, error.message);
  return data;
});
