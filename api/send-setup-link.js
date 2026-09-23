import { admin, anon, route, getCaller, getProfile, canManage, HttpError, appOrigin } from "./_lib.js";

// Re-sends a "set your password" link to a user (lost invite, forgot password).
// Falls back to returning the link when the email can't be sent.
export default route(async (req) => {
  const caller = await getCaller(req);
  const target = await getProfile(req.body?.user_id);
  if (!canManage(caller, target)) throw new HttpError(403, "Not allowed");

  const redirectTo = appOrigin(req);
  const { data: { user } } = await admin().auth.admin.getUserById(target.id);
  const neverSignedIn = !user?.last_sign_in_at;

  // Make them pick a new password when they land.
  await admin().from("profiles").update({ must_change_password: true }).eq("id", target.id);

  const { error } = neverSignedIn
    ? await admin().auth.admin.inviteUserByEmail(target.email, { redirectTo })
    : await anon().auth.resetPasswordForEmail(target.email, { redirectTo });
  if (!error) return { email: target.email, email_sent: true };

  const { data: link, error: linkErr } = await admin().auth.admin.generateLink({
    type: "recovery", email: target.email, options: { redirectTo },
  });
  if (linkErr) throw new HttpError(400, linkErr.message);
  return { email: target.email, email_sent: false, invite_link: link.properties.action_link, email_error: error.message };
});
