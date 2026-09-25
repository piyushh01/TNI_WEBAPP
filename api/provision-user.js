import { admin, route, getCaller, getProfile, HttpError, appOrigin, appLink, tempPassword } from "./_lib.js";

const ROLES = ["reportee", "reporting_manager", "admin"];
// Admin / HR can also be someone's reporting manager.
const MANAGER_ROLES = ["reporting_manager", "admin"];

// Creates a user. Two ways to onboard them:
//   delivery "email"    (default) — invite email with a link to set their password;
//                        if the email can't be sent, the link is returned to share manually.
//   delivery "password" — no email: a temporary password is set and returned; they must
//                        change it at first sign-in.
// Admins can create any role; managers can only add reportees under themselves.
export default route(async (req) => {
  const caller = await getCaller(req);
  const { full_name, email, color, delivery = "email" } = req.body || {};
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
    if (!MANAGER_ROLES.includes(mgr.role)) throw new HttpError(400, "Selected reporting manager is not a manager");
  }

  const cleanEmail = email.trim().toLowerCase();
  const data = {
    full_name: full_name.trim(),
    role,
    manager_id: role === "admin" ? "" : manager_id || "",
    color: color || "#87a878",
    must_change_password: true,
  };
  const origin = appOrigin(req);
  const exists = m => /already been registered|already exists|already registered/i.test(m || "");

  if (delivery === "password") {
    const password = tempPassword();
    const { data: created, error } = await admin().auth.admin.createUser({ email: cleanEmail, password, email_confirm: true, user_metadata: data });
    if (error) throw new HttpError(400, exists(error.message) ? "A user with this email already exists" : error.message);
    return { id: created.user.id, email: cleanEmail, email_sent: false, temp_password: password, sign_in_url: origin };
  }

  const { data: invited, error } = await admin().auth.admin.inviteUserByEmail(cleanEmail, { data, redirectTo: origin });
  if (!error) return { id: invited.user.id, email: cleanEmail, email_sent: true };
  if (exists(error.message)) throw new HttpError(400, "A user with this email already exists");

  // Email couldn't be sent (or timed out) — make sure the user exists and hand back a link.
  // A fresh link replaces any earlier one, so only this link will work.
  const { data: link, error: linkErr } = await admin().auth.admin.generateLink({
    type: "invite", email: cleanEmail, options: { data, redirectTo: origin },
  });
  let result = link, err = linkErr;
  if (err && exists(err.message)) {
    // The timed-out invite did create the user — issue a set-password link instead.
    ({ data: result, error: err } = await admin().auth.admin.generateLink({ type: "recovery", email: cleanEmail, options: { redirectTo: origin } }));
  }
  if (err) throw new HttpError(400, err.message);
  return {
    id: result.user.id, email: cleanEmail, email_sent: false,
    invite_link: appLink(origin, result.properties), email_error: error.message,
  };
});
