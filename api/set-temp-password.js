import { admin, route, getCaller, getProfile, canManage, HttpError, appOrigin, tempPassword } from "./_lib.js";

// Sets a temporary password so login details can be shared without email.
// The user must choose their own password at the next sign-in.
export default route(async (req) => {
  const caller = await getCaller(req);
  const target = await getProfile(req.body?.user_id);
  if (!canManage(caller, target)) throw new HttpError(403, "Not allowed");
  if (target.id === caller.id) throw new HttpError(400, "Change your own password from the sign-in screen");
  if (!target.is_active) throw new HttpError(400, "Reactivate the user first");

  const password = tempPassword();
  const { error } = await admin().auth.admin.updateUserById(target.id, { password, email_confirm: true });
  if (error) throw new HttpError(400, error.message);
  await admin().from("profiles").update({ must_change_password: true }).eq("id", target.id);
  return { email: target.email, temp_password: password, sign_in_url: appOrigin(req) };
});
