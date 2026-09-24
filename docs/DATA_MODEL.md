# Skillgo — Data Model Reference

How every feedback item maps to the schema, plus the workflow state machine.

## Roles & reporting line

| Feedback | Implementation |
|---|---|
| Roles = Reporting Manager / Reportee | `profiles.role` enum (`reporting_manager` / `reportee`) |
| Manager manages their reportees | `profiles.manager_id` → points to the manager's `profiles.id` |
| Role selection at login | Role is stored per user; login resolves it automatically (no manual pick needed) |

## Training addition fields (Manager)

| Feedback field | Column |
|---|---|
| Training Name | `trainings.name` |
| Training Category (Business / Field & Subject / Operations → sub) | `trainings.category_id` → `training_categories(group_name, name)` |
| Training link (**mandatory**) | `trainings.training_link` (NOT NULL; enforced again in `submit_for_approval`) |
| Training Mode | `trainings.mode` enum (`online` / `face_to_face` / `self_paced` / `blended`) |
| Trainer (only if Face-to-face) | `trainings.trainer` (app shows the field only when mode = face_to_face) |
| Expected Training End date | `trainings.expected_end_date` |
| Training priority | `trainings.priority` enum (`low`/`medium`/`high`/`critical`) |
| Due date (for overdue/reminders) | `trainings.due_date` |
| Study resources (whole training) | `trainings.resources` JSONB `[{url,title}]` |
| Multi-part + per-part links | `training_parts` (`title`, `part_link`, `sort_order`) |

## Approval workflow

| Feedback | Implementation |
|---|---|
| Reportee starts / marks progress | `trainings.status` / `training_parts.status` (`pending`→`in_progress`) |
| Reportee shares "mark as done" as approval request | `completion_requests` row via `submit_for_approval()` → status `submitted` |
| Manager reviews, adds remarks | `approve_request()` / `send_back_request()` set `manager_remarks` |
| Training done **only if manager approves** | Only `approve_request()` sets status `approved` + `completed_date` |
| Material link mandatory before "request done" | `submit_for_approval()` raises if `training_link` empty |
| Knowledge Hub = only approved | Frontend filters `status = 'approved'` |

### State machine (single training)

```
pending ──start──▶ in_progress ──submit──▶ submitted
                                     │            │
                                     │       approve│  send_back
                                     ▼            ▼        │
                                 (reportee)   approved   sent_back
                                                            │
                                                     resubmit│
                                                            ▼
                                                        submitted ...
```

For **multi-part** trainings each part runs this cycle; `recompute_training_status()`
rolls the parts up into the parent training's status (all parts approved ⇒ training approved).

## Tables at a glance

- **profiles** — users (1:1 with `auth.users`), role, reporting line, must-change-password.
- **training_categories** — fixed o2h taxonomy (seeded).
- **trainings** — one assignment to one reportee, with all the new fields.
- **training_parts** — modules of a multi-part training, each with its own link.
- **completion_requests** — approval requests + manager decision/remarks.
- **app_settings** — per-manager reminder cadence + current FY.

## Key functions (called from frontend via `supabase.rpc`)

| Function | Who | Effect |
|---|---|---|
| `submit_for_approval(training, part, notes, links)` | Reportee | Creates request, sets `submitted`. Enforces link + notes + ≥1 outcome link. |
| `approve_request(request, remarks)` | Manager | Marks approved (= completed). |
| `send_back_request(request, remarks)` | Manager | Returns for correction (remarks required). |
| `recompute_training_status(training)` | internal | Rolls part statuses up to the parent. |

## Financial year

`trainings.fy` (e.g. `'2026-27'`) and `trainings.carried_from_fy` support the same
year-end carry/discard flow as the pilot. `app_settings.current_fy` tracks the active year.
