import { admin, route, getCaller, getProfile, HttpError, appOrigin } from "./_lib.js";

const ROLES = ["reportee", "reporting_manager", "admin"];

// Creates a user and emails them an invite link to set their own password.
// Admins can create any role; managers can only add reportees under themselves.
// If Supabase can't send the email (SMTP not configured / rate-limited), the
// invite link is returned instead so it can be shared manually.
export default route(async (req) => {
  const caller = await getCaller(req);
  const { full_name, email, color } = req.body || {};
  let { role = "reportee", manager_id = null } = req.body || {};

  if (!full_name?.trim() || !email?.trim()) throw new HttpError(400, "Name and email are required");
  if (!ROLES.includes(role)) throw new HttpError(400, "Invalid role");

  if (caller.role === "reporting_manager") {
    if (role !== "reportee") throw new HttpError(403, "Managers can only add reportees");
    manager_id = caller.id;
  } else if (caller.role !== "admin") {
    throw new HttpError(403, "Only managers and admins can add users");
  }
  if (role === "reportee" && !manager_id) throw new HttpError(400, "A reportee needs a reporting manager");
  if (manager_id) {
    const mgr = await getProfile(manager_id);
    if (mgr.role !== "reporting_manager") throw new HttpError(400, "Selected reporting manager is not a manager");
  }

  const cleanEmail = email.trim().toLowerCase();
  const data = {
    full_name: full_name.trim(),
    role,
    manager_id: role === "admin" ? "" : manager_id || "",
    color: color || "#87a878",
    must_change_password: true,
  };
  const redirectTo = appOrigin(req);

  const { data: invited, error } = await admin().auth.admin.inviteUserByEmail(cleanEmail, { data, redirectTo });
  if (!error) return { id: invited.user.id, email: cleanEmail, email_sent: true };

  if (/already been registered|already exists/i.test(error.message)) {
    throw new HttpError(400, "A user with this email already exists");
  }

  // Email couldn't be sent — create the user and hand back the invite link.
  const { data: link, error: linkErr } = await admin().auth.admin.generateLink({
    type: "invite", email: cleanEmail, options: { data, redirectTo },
  });
  if (linkErr) throw new HttpError(400, linkErr.message);
  return {
    id: link.user.id, email: cleanEmail, email_sent: false,
    invite_link: link.properties.action_link, email_error: error.message,
  };
});
