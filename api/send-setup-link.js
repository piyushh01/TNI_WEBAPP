import { admin, anon, route, getCaller, getProfile, canManage, HttpError, appOrigin, appLink } from "./_lib.js";

// Gives a user a new "set your password" link (lost invite, forgot password).
//   deliver "email" (default) — email it; if that fails, return the link instead.
//   deliver "link"            — don't email; just return the link to share on Teams etc.
// A new link replaces earlier ones.
export default route(async (req) => {
  const caller = await getCaller(req);
  const target = await getProfile(req.body?.user_id);
  if (!canManage(caller, target)) throw new HttpError(403, "Not allowed");
  const deliver = req.body?.deliver === "link" ? "link" : "email";

  const origin = appOrigin(req);
  // Make them pick a new password when they land.
  await admin().from("profiles").update({ must_change_password: true }).eq("id", target.id);

  const makeLink = async () => {
    const { data: link, error } = await admin().auth.admin.generateLink({ type: "recovery", email: target.email, options: { redirectTo: origin } });
    if (error) throw new HttpError(400, error.message);
    return appLink(origin, link.properties);
  };

  if (deliver === "link") return { email: target.email, email_sent: false, invite_link: await makeLink(), manual: true };

  const { data: { user } } = await admin().auth.admin.getUserById(target.id);
  const neverSignedIn = !user?.last_sign_in_at;
  const { error } = neverSignedIn
    ? await admin().auth.admin.inviteUserByEmail(target.email, { redirectTo: origin })
    : await anon().auth.resetPasswordForEmail(target.email, { redirectTo: origin });
  if (!error) return { email: target.email, email_sent: true };
  return { email: target.email, email_sent: false, invite_link: await makeLink(), email_error: error.message };
});
