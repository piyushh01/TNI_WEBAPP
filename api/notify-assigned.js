import { admin, route, getCaller, HttpError, appOrigin } from "./_lib.js";
import { mailConfigured, sendMail, emailLayout, esc } from "./_mail.js";

const MODE = { online: "Online", face_to_face: "Face to Face", self_paced: "Self-paced", blended: "Blended" };
const fmt = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

// Emails each reportee the trainings just assigned to them (one email per person).
// Assigning never fails because of email — the result says who was notified.
export default route(async (req) => {
  const caller = await getCaller(req);
  const ids = [...new Set((req.body?.training_ids || []).filter(Boolean))].slice(0, 500);
  if (!ids.length) throw new HttpError(400, "No trainings given");
  if (!mailConfigured()) return { sent: 0, skipped: true, reason: "Email (SMTP) isn't configured on the server" };

  const { data: trainings, error } = await admin()
    .from("trainings")
    .select("id, name, description, training_link, mode, trainer, priority, expected_end_date, due_date, assigned_to, training_categories(group_name, name), training_parts(title, sort_order)")
    .in("id", ids);
  if (error) throw new HttpError(400, error.message);

  const personIds = [...new Set(trainings.map(t => t.assigned_to))];
  const { data: people } = await admin().from("profiles").select("id, email, full_name, manager_id, is_active").in("id", personIds);

  // Only the reportee's manager (or an admin) can trigger these.
  for (const p of people) {
    if (caller.role !== "admin" && p.manager_id !== caller.id) throw new HttpError(403, "Not allowed");
  }

  const url = appOrigin(req);
  const results = { sent: 0, failed: [] };
  for (const p of people.filter(x => x.is_active)) {
    const mine = trainings.filter(t => t.assigned_to === p.id);
    const rows = mine.map(t => {
      const meta = [
        t.training_categories && `${t.training_categories.group_name} · ${t.training_categories.name}`,
        MODE[t.mode] + (t.trainer ? ` · Trainer: ${t.trainer}` : ""),
        t.priority && `Priority: ${t.priority}`,
        t.expected_end_date && `Expected end: ${fmt(t.expected_end_date)}`,
        t.due_date && `Due: ${fmt(t.due_date)}`,
        (t.training_parts || []).length && `${t.training_parts.length} parts`,
      ].filter(Boolean).map(esc).join(" &nbsp;|&nbsp; ");
      return `<div style="border:1px solid #e0e5e1;border-radius:10px;padding:12px 14px;margin:0 0 10px">
<div style="font-size:14px;font-weight:700;color:#142019">${esc(t.name)}</div>
${t.description ? `<div style="font-size:12.5px;color:#6f7b73;margin-top:3px">${esc(t.description)}</div>` : ""}
<div style="font-size:12px;color:#6f7b73;margin-top:6px">${meta}</div>
${t.training_link ? `<div style="margin-top:6px"><a href="${esc(t.training_link)}" style="font-size:12.5px;color:#466b35">Open training material →</a></div>` : ""}
</div>`;
    }).join("");
    const one = mine.length === 1;
    try {
      await sendMail({
        to: p.email,
        subject: one ? `New training assigned: ${mine[0].name}` : `${mine.length} new trainings assigned to you`,
        html: emailLayout({
          heading: one ? "A new training has been assigned to you" : `${mine.length} new trainings have been assigned to you`,
          intro: `Hi ${p.full_name.split(" ")[0]}, ${caller.full_name} assigned ${one ? "this training" : "these trainings"} to you on Skillgo. Start it from My Trainings and mark it as done when you've finished.`,
          bodyHtml: rows, ctaUrl: url, ctaLabel: "Open Skillgo",
        }),
        text: `${caller.full_name} assigned you: ${mine.map(t => t.name).join(", ")}. Open Skillgo: ${url}`,
      });
      results.sent++;
    } catch (e) {
      results.failed.push({ email: p.email, error: e.message });
    }
  }
  return results;
});
