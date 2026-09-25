import { admin, route, getCaller, HttpError, appOrigin } from "./_lib.js";
import { mailConfigured, sendMail, emailLayout, esc } from "./_mail.js";

const fmt = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

// A reportee assigned catalog trainings to themselves → email their manager.
export default route(async (req) => {
  const caller = await getCaller(req);
  const ids = [...new Set((req.body?.training_ids || []).filter(Boolean))].slice(0, 200);
  if (!ids.length) throw new HttpError(400, "No trainings given");
  if (!caller.manager_id) return { sent: 0, skipped: true, reason: "You don't have a reporting manager set" };
  if (!mailConfigured()) return { sent: 0, skipped: true, reason: "Email (SMTP) isn't configured on the server" };

  const { data: trainings, error } = await admin()
    .from("trainings")
    .select("id, name, priority, expected_end_date, due_date, assigned_to, assigned_by, training_categories(group_name, name), training_parts(id)")
    .in("id", ids);
  if (error) throw new HttpError(400, error.message);
  if (trainings.some(t => t.assigned_to !== caller.id || t.assigned_by !== caller.id)) throw new HttpError(403, "Not allowed");

  const { data: mgr } = await admin().from("profiles").select("email, full_name, is_active").eq("id", caller.manager_id).single();
  if (!mgr?.is_active) return { sent: 0, skipped: true, reason: "Your reporting manager's account is inactive" };

  const rows = trainings.map(t => {
    const meta = [
      t.training_categories && `${t.training_categories.group_name} · ${t.training_categories.name}`,
      t.priority && `Priority: ${t.priority}`,
      t.expected_end_date && `Expected end: ${fmt(t.expected_end_date)}`,
      t.due_date && `Due: ${fmt(t.due_date)}`,
      (t.training_parts || []).length && `${t.training_parts.length} parts`,
    ].filter(Boolean).map(esc).join(" &nbsp;|&nbsp; ");
    return `<div style="border:1px solid #e0e5e1;border-radius:10px;padding:12px 14px;margin:0 0 10px">
<div style="font-size:14px;font-weight:700;color:#142019">${esc(t.name)}</div>
<div style="font-size:12px;color:#6f7b73;margin-top:6px">${meta}</div></div>`;
  }).join("");
  const one = trainings.length === 1;
  const url = appOrigin(req);
  await sendMail({
    to: mgr.email,
    subject: one ? `${caller.full_name} assigned themselves: ${trainings[0].name}` : `${caller.full_name} assigned themselves ${trainings.length} trainings`,
    html: emailLayout({
      heading: `${caller.full_name} picked up ${one ? "a training" : `${trainings.length} trainings`}`,
      intro: `Hi ${mgr.full_name.split(" ")[0]}, ${caller.full_name} assigned ${one ? "this training" : "these trainings"} from the Skillgo catalog to themselves. You'll approve completion as usual when they mark ${one ? "it" : "them"} as done.`,
      bodyHtml: rows, ctaUrl: url, ctaLabel: "Open Skillgo",
    }),
    text: `${caller.full_name} assigned themselves: ${trainings.map(t => t.name).join(", ")}. Open Skillgo: ${url}`,
  });
  return { sent: 1, to: mgr.email };
});
