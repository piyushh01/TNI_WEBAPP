import { useState, useEffect } from "react";
import {
  LayoutDashboard, Lightbulb, Library, Bell, Settings as SettingsIcon,
  BookOpen, LogOut, Plus, RefreshCw, Download, Search, Link2, X,
  ChevronDown, ChevronUp, ChevronRight, Check, CircleDot, Circle, Clock, AlertCircle,
  Target, Users, Package, Trophy, Pencil, Trash2, GraduationCap, ExternalLink,
  Mail, Copy, Sparkles, ShieldCheck, CalendarDays, Play, Upload, FolderOpen, UserCog, Send, Menu,
} from "lucide-react";
import o2hLogo from "./assets/o2h-logo.svg";
import o2hLogoLight from "./assets/o2h-logo-light.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import * as api from "./lib/api";

// Local classNames helper (shadcn's @/lib/utils isn't available in this environment)
const cn = (...args) => args.flat(Infinity).filter(Boolean).join(" ");

// ── Domain constants ──────────────────────────────────────────────────────────
const COLORS = ["#557c3f","#3f7a73","#7a6a3a","#8a5a44","#5b6e8c","#6b5b8a","#8a4f5e","#4f6b5a","#7d7a52","#5a6470"];
const LEGACY_COLORS = ["#4f46e5","#0891b2","#0f9d6b","#d97706","#e0455e","#2563eb","#7c3aed","#0f766e","#db2777","#475569"];
const avatarColor = c => { const i = LEGACY_COLORS.indexOf((c || "").toLowerCase()); return i >= 0 ? COLORS[i] : c || COLORS[0]; };
const MODE_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "face_to_face", label: "Face to Face" },
  { value: "self_paced", label: "Self-paced" },
  { value: "blended", label: "Blended" },
];
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
const ROLE_LABELS = { reportee: "Reportee", reporting_manager: "Reporting Manager", admin: "Admin / HR" };
const PROGRESS_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const DEFAULT_SETTINGS = { pendingReminderDays: 7, overdueReminderDays: 3 };
// Statuses where the ball is still in the reportee's court (relevant for "overdue").
const OPEN_STATUSES = ["pending", "in_progress", "sent_back"];
const isOpenStatus = s => OPEN_STATUSES.includes(s);

const ACHIEVEMENT = {
  star:        { emoji:"🌟", label:"Star Performer",  cls:"bg-amber-100 text-amber-700 border-amber-200" },
  "on-track":  { emoji:"✅", label:"On Track",        cls:"bg-emerald-100 text-emerald-700 border-emerald-200" },
  progressing: { emoji:"📈", label:"In Progress",     cls:"bg-indigo-100 text-indigo-700 border-indigo-200" },
  behind:      { emoji:"⚠️", label:"Needs Attention", cls:"bg-orange-100 text-orange-700 border-orange-200" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const initials  = n => (n||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
const today     = () => new Date().toISOString().split("T")[0];
const fmtDate   = d => { if(!d) return ""; try { return new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}); } catch { return d; } };
const isOverdue = d => d && new Date(d+"T00:00:00") < new Date(new Date().toDateString());
const daysSince = d => { if(!d) return Infinity; return Math.floor((new Date(new Date().toDateString())-new Date(d+"T00:00:00"))/86400000); };
const cleanLinks= arr => (arr||[]).filter(l=>l&&l.url&&l.url.trim());
// Ensure links open externally: add a scheme if the user typed a bare domain.
const safeUrl = u => {
  const s = (u||"").trim();
  if (!s) return "#";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  return "https://" + s;
};
const uid = p => `${p}${Date.now()}${Math.random().toString(36).slice(2,6)}`;

function getFY(ds) { const d=ds?new Date(ds+"T00:00:00"):new Date(),y=d.getFullYear(),m=d.getMonth()+1; return m>=4?`${y}-${String(y+1).slice(-2)}`:`${y-1}-${String(y).slice(-2)}`; }
function nextFY(fy) { const y=parseInt(fy.split("-")[0]); return `${y+1}-${String(y+2).slice(-2)}`; }

// Training-instance helpers
const sortedParts = t => [...(t.training_parts || [])].sort((a,b)=>(a.sort_order??0)-(b.sort_order??0));
const hasParts     = t => (t.training_parts || []).length > 0;
const getEffStatus = t => t.status || "pending"; // authoritative — the DB rolls part statuses up already
const getUnits = t => {
  if (!hasParts(t)) return { done: t.status==="approved"?1:0, total: 1 };
  const parts = t.training_parts;
  return { done: parts.filter(p=>p.status==="approved").length, total: parts.length };
};
const partsLabel = t => { if(!hasParts(t)) return null; const {done,total}=getUnits(t); return `${done}/${total} Parts`; };

const getAchievement = (user, fyTrainings) => {
  const ut = fyTrainings.filter(t=>t.assigned_to===user.id && t.status!=="discarded");
  if (!ut.length) return null;
  const {done,total} = ut.reduce((a,t)=>{const u=getUnits(t);return{done:a.done+u.done,total:a.total+u.total}},{done:0,total:0});
  const pct = total ? done/total : 0;
  const hasOD = ut.some(t=>isOpenStatus(t.status) && isOverdue(t.due_date));
  if (pct===1) return "star";
  if (pct>=0.7 && !hasOD) return "on-track";
  if (hasOD) return "behind";
  return "progressing";
};

// Find the latest completion_request for a training/part, optionally filtered by status.
function reqFor(requests, trainingId, partId, status) {
  return requests.find(r => r.training_id===trainingId && (r.part_id||null)===(partId||null) && (!status || r.status===status));
}

// ── Small presentational atoms ────────────────────────────────────────────────
function UAvatar({ name, color, className, solid }) {
  const col = avatarColor(color);
  return (
    <Avatar className={cn("shrink-0", className)}>
      <AvatarFallback style={solid ? { background: col, color: "#fff" } : { background: `${col}1f`, color: col }} className="font-bold text-[10.5px]">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function StatusBadge({ status, dueDate }) {
  if (status === "approved")    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 font-medium"><Check className="h-3 w-3" />Completed</Badge>;
  if (status === "in_progress") return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 gap-1 font-medium"><CircleDot className="h-3 w-3" />In Progress</Badge>;
  if (status === "submitted")   return <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1 font-medium"><Clock className="h-3 w-3" />Awaiting Approval</Badge>;
  if (status === "sent_back")   return <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1 font-medium"><AlertCircle className="h-3 w-3" />Sent Back</Badge>;
  if (status === "discarded")   return <Badge variant="outline" className="text-muted-foreground gap-1 font-medium">Discarded</Badge>;
  if (dueDate && isOverdue(dueDate)) return <Badge className="bg-rose-100 text-rose-700 border-rose-200 gap-1 font-medium"><AlertCircle className="h-3 w-3" />Overdue</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 font-medium"><Circle className="h-3 w-3" />Pending</Badge>;
}

function AchBadge({ level }) {
  const a = ACHIEVEMENT[level]; if (!a) return null;
  return <Badge variant="outline" className={cn("font-medium", a.cls)}>{a.label}</Badge>;
}

function FYBadge({ fy }) {
  return <Badge variant="outline" className="text-muted-foreground font-medium">FY {fy}</Badge>;
}

function PartDot({ n, status }) {
  const done = status === "approved";
  return (
    <div className={cn(
      "h-6 w-6 rounded-md border-2 flex items-center justify-center text-[11px] font-bold shrink-0",
      done ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-muted border-border text-muted-foreground"
    )}>
      {done ? <Check className="h-3.5 w-3.5" /> : n}
    </div>
  );
}

function SectionLabel({ children, className }) {
  return <h2 className={cn("text-[11px] font-bold uppercase tracking-[0.08em] text-[#56615a] mb-3", className)}>{children}</h2>;
}

// Inline error line used under forms and lists.
function FormError({ children, className }) {
  return (
    <p role="alert" className={cn("flex items-start gap-1.5 text-[12.5px] font-medium text-rose-600", className)}>
      <AlertCircle className="h-3.5 w-3.5 mt-[3px] shrink-0" /><span>{children}</span>
    </p>
  );
}

// Quiet callout box (info / success / warning).
const NOTICE_TONES = {
  info: "bg-indigo-50 border-indigo-200 text-indigo-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
};
function Notice({ tone = "info", children, className }) {
  return <div className={cn("rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed", NOTICE_TONES[tone], className)}>{children}</div>;
}

function Spinner({ className }) {
  return <span className={cn("inline-block h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin", className)} aria-hidden="true" />;
}

function LoadingScreen({ label = "Loading…" }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas text-[13px] text-muted-foreground" role="status">
      <Spinner />{label}
    </div>
  );
}

// Small status message, bottom-right; auto-dismisses.
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!toast) return null;
  return (
    <div role="status" className={cn("fixed bottom-5 right-5 z-[500] max-w-sm flex items-start gap-2.5 rounded-xl border bg-white px-4 py-3 text-[13px] shadow-[0_12px_32px_rgba(20,32,25,0.14)]",
      toast.tone === "warning" ? "border-amber-200" : "border-emerald-200")}>
      {toast.tone === "warning" ? <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" /> : <Check className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />}
      <span className="flex-1 leading-relaxed">{toast.text}</span>
      <button onClick={onClose} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

// Dashboard metric: label + small icon on top, value, muted note.
function StatCard({ label, value, note, Icon, tone, onClick }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick}
      className={cn("text-left flex flex-col rounded-xl border border-border bg-white px-[18px] py-4 min-h-[116px] transition-colors",
        onClick && "hover:border-indigo-300 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-indigo-100")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold leading-snug text-[#737b75]">{label}</span>
        <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", tone === "alert" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-800")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-auto pt-3">
        <div className={cn("text-[28px] font-bold tracking-[-0.03em] leading-none", tone === "alert" && "text-rose-600")}>{value}</div>
        <div className="text-[11px] text-[#949b95] mt-1.5">{note}</div>
      </div>
    </Comp>
  );
}

// Modal body with a guaranteed height cap + internal scroll, using INLINE styles
// so it never depends on Tailwind arbitrary-value compilation. maxWidth is a preset.
const MAXW = { md: 480, lg: 560, xl: 640 };
function ModalContent({ size = "lg", children }) {
  return (
    <DialogContent
      className="p-0"
      style={{ maxWidth: MAXW[size], width: "calc(100vw - 32px)", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      <div className="scroll-quiet" style={{ overflowY: "auto", padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
        {children}
      </div>
    </DialogContent>
  );
}

// Reusable confirm dialog — window.confirm() is blocked in the artifact sandbox.
function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", danger, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <Dialog open onOpenChange={o => !o && onCancel()}>
      <ModalContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className={cn("flex-1", danger && "bg-destructive hover:bg-rose-700")} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── Link editors & cards ──────────────────────────────────────────────────────
function LinkListEditor({ links, setLinks, urlP = "https://...", titleP = "Link title", addLabel = "Add link" }) {
  const upd = (i, f, v) => setLinks(p => p.map((l, idx) => idx === i ? { ...l, [f]: v } : l));
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input type="url" value={l.url} onChange={e => upd(i, "url", e.target.value)} placeholder={urlP} className="flex-[1.4]" />
          <Input type="text" value={l.title} onChange={e => upd(i, "title", e.target.value)} placeholder={titleP} className="flex-1" />
          <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => setLinks(p => p.filter((_, idx) => idx !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="border-dashed text-muted-foreground" onClick={() => setLinks(p => [...p, { url: "", title: "" }])}>
        <Plus className="h-3.5 w-3.5 mr-1" />{addLabel}
      </Button>
    </div>
  );
}

function LinkRow({ link, theme = "indigo" }) {
  const t = theme === "amber"
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-indigo-50 border-indigo-200 text-indigo-800";
  return (
    <a href={safeUrl(link.url)} target="_blank" rel="noreferrer" className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2.5 no-underline mb-2 hover:brightness-[0.98] transition", t)}>
      <Link2 className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{link.title || "Reference Link"}</div>
        <div className="text-[11px] opacity-70 truncate">{link.url}</div>
      </div>
      <span className="text-[11px] font-medium bg-white/70 rounded-md px-2 py-1 shrink-0 flex items-center gap-1">Open <ExternalLink className="h-3 w-3" /></span>
    </a>
  );
}

function LinkChips({ links }) {
  const l = cleanLinks(links); if (!l.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {l.map((x, i) => (
        <a key={i} href={safeUrl(x.url)} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5 no-underline hover:bg-indigo-100 transition inline-flex items-center gap-1">
          <Link2 className="h-3 w-3" />{x.title || "Link"}
        </a>
      ))}
    </div>
  );
}

function CategorySelect({ categories, value, onChange }) {
  const groups = [...new Set(categories.map(c => c.group_name))];
  const current = categories.find(c => c.id === value);
  const [group, setGroup] = useState(current?.group_name || "");
  useEffect(() => { const c = categories.find(c => c.id === value); if (c) setGroup(c.group_name); }, [value, categories]);
  const inGroup = categories.filter(c => c.group_name === group);
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select value={group} onValueChange={g => { setGroup(g); onChange(""); }}>
        <SelectTrigger><SelectValue placeholder="Group" /></SelectTrigger>
        <SelectContent>{groups.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={value} onValueChange={onChange} disabled={!group}>
        <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>{inGroup.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function BrandMark({ className, light }) {
  return <img src={light ? o2hLogoLight : o2hLogo} alt="o2h technology" className={cn("object-contain", className)} />;
}

// Split forest-green / sage backdrop shared by the auth screens.
const AUTH_BG = { background: "linear-gradient(135deg, #193525 0%, #294b38 48%, #e8ece9 48%, #e8ece9 100%)" };

function AuthCard({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-5 sm:p-8" style={AUTH_BG}>
      <div className="w-full max-w-[420px] rounded-[18px] border border-[#e8ece8] bg-white px-6 py-9 sm:px-10 sm:py-10 shadow-[0_24px_65px_rgba(19,39,27,0.18)]">
        {children}
      </div>
    </div>
  );
}

// The role picked here is checked against the role stored on the account
// (App verifies it once the profile loads and signs out on a mismatch).
function LoginScreen({ onSignInAs, roleError, notice }) {
  const [stage, setStage] = useState("signin"); // signin | forgot | forgot-sent
  const [role, setRole] = useState("reportee");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const shownErr = err || roleError;

  const doSignIn = async () => {
    setErr(""); setBusy(true);
    onSignInAs(role);
    try { await api.signIn(email.trim(), password); }
    catch (e) { onSignInAs(null); setErr(e.message === "Invalid login credentials" ? "Incorrect email or password." : e.message || "Sign-in failed."); }
    setBusy(false);
  };
  const doForgot = async () => {
    setErr(""); setBusy(true);
    try { await api.requestPasswordReset(email.trim()); setStage("forgot-sent"); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center mb-8">
        <BrandMark className="h-14" />
        <div className="text-[18px] font-bold tracking-[-0.01em] mt-4">Skillgo</div>
        <div className="text-[12px] text-muted-foreground mt-1">BAPM team learning, made accountable.</div>
      </div>

      {notice && stage === "signin" && <Notice tone="warning" className="mb-4">{notice}</Notice>}
      {stage === "signin" && (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (email && password && !busy) doSignIn(); }}>
          <div>
            <div className="text-[12px] font-bold text-[#525b54] mb-2.5" id="role-label">Sign in as</div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="role-label">
              {Object.entries(ROLE_LABELS).map(([r, label]) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => { setRole(r); setErr(""); }}
                  className={cn("h-12 rounded-[9px] border px-2 text-[12px] font-semibold leading-tight transition-colors",
                    role === r ? "border-indigo-500 bg-indigo-50 text-indigo-800 shadow-[inset_0_0_0_1px_rgba(115,155,92,0.15)]" : "border-[#dfe4df] bg-white text-[#525a54] hover:border-[#c5cec7]")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email <span className="text-rose-600">*</span></Label>
            <Input id="login-email" type="email" autoComplete="email" className="h-11" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="name@company.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password <span className="text-rose-600">*</span></Label>
            <Input id="login-password" type="password" autoComplete="current-password" className="h-11" value={password} onChange={e => { setPassword(e.target.value); setErr(""); }} placeholder="Your password" />
          </div>
          {shownErr && <FormError>{shownErr}</FormError>}
          <Button type="submit" className="w-full h-11" disabled={!email || !password || busy}>{busy ? "Signing in…" : <>Sign in <span className="opacity-80">→</span></>}</Button>
          <button type="button" className="block mx-auto text-[12px] text-[#6d756f] hover:text-indigo-700 transition-colors pt-1" onClick={() => { setStage("forgot"); setErr(""); }}>Forgot your password?</button>
        </form>
      )}
      {stage === "forgot" && (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (email && !busy) doForgot(); }}>
          <div>
            <div className="text-[15px] font-bold">Reset your password</div>
            <p className="text-[12.5px] text-muted-foreground mt-1">We'll email you a link to set a new password.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Registered email <span className="text-rose-600">*</span></Label>
            <Input id="forgot-email" type="email" autoComplete="email" className="h-11" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="name@company.com" />
          </div>
          {err && <FormError>{err}</FormError>}
          <Button type="submit" className="w-full h-11" disabled={!email || busy}>{busy ? "Sending…" : "Send reset link"}</Button>
          <button type="button" className="block mx-auto text-[12px] text-[#6d756f] hover:text-indigo-700 transition-colors" onClick={() => setStage("signin")}>Back to sign in</button>
        </form>
      )}
      {stage === "forgot-sent" && (
        <div className="space-y-4">
          <Notice tone="success">Check your email for a password reset link.</Notice>
          <Button variant="outline" className="w-full h-11" onClick={() => setStage("signin")}>Back to sign in</Button>
        </div>
      )}
    </AuthCard>
  );
}

// Landing page for invite / reset emails. The token is only used when the
// person presses the button (mail scanners that pre-open links don't).
function AcceptEmailLink({ type, onAccept, onCancel }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const isReset = type === "recovery";
  const accept = async () => {
    setBusy(true); setErr("");
    try { await onAccept(); }
    catch (e) {
      setErr(/expired|invalid/i.test(e.message || "")
        ? "This link has expired or was already used. Ask your manager or HR to send you a new setup link."
        : e.message || "This link couldn't be used.");
      setBusy(false);
    }
  };
  return (
    <AuthCard>
      <div className="flex flex-col items-center text-center">
        <BrandMark className="h-14" />
        <div className="text-[18px] font-bold tracking-[-0.01em] mt-4">{isReset ? "Reset your password" : "Welcome to Skillgo"}</div>
        <p className="text-[12.5px] text-muted-foreground mt-2 leading-relaxed">
          {isReset ? "Continue to choose a new password for your account." : "You've been invited to Skillgo, o2h's team learning tracker. Continue to set your password."}
        </p>
      </div>
      <div className="space-y-4 mt-7">
        {err && <FormError>{err}</FormError>}
        <Button className="w-full h-11" disabled={busy} onClick={accept}>{busy ? "Please wait…" : isReset ? "Continue" : "Accept invitation"}</Button>
        <button type="button" className="block mx-auto text-[12px] text-[#6d756f] hover:text-indigo-700 transition-colors" onClick={onCancel}>Go to sign in</button>
      </div>
    </AuthCard>
  );
}

// Shown when profiles.must_change_password is true (first login, or after a manager resets someone).
function ForcePasswordChange({ onDone, onCancel, recovery }) {
  const [np, setNp] = useState(""); const [cp, setCp] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (np.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (np !== cp) { setErr("Passwords do not match."); return; }
    setBusy(true); setErr("");
    try { await onDone(np); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <AuthCard>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!busy) submit(); }}>
        <BrandMark className="h-10 mb-2" />
        <div>
          <div className="flex items-center gap-2 text-[16px] font-bold"><ShieldCheck className="h-4 w-4 text-indigo-600" />{recovery ? "Reset your password" : "Set your password"}</div>
          <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">{recovery ? "Choose a new password for your account." : "Welcome to Skillgo! Choose a password only you know — you'll use it with your email to sign in."}</p>
        </div>
        <div className="space-y-2"><Label htmlFor="np">New password</Label><Input id="np" type="password" autoComplete="new-password" className="h-11" value={np} onChange={e => { setNp(e.target.value); setErr(""); }} /></div>
        <div className="space-y-2"><Label htmlFor="cp">Confirm password</Label><Input id="cp" type="password" autoComplete="new-password" className="h-11" value={cp} onChange={e => { setCp(e.target.value); setErr(""); }} /></div>
        {err && <FormError>{err}</FormError>}
        <Button type="submit" className="w-full h-11" disabled={busy}>{busy ? "Saving…" : "Set password & continue"}</Button>
        {onCancel && <button type="button" className="block mx-auto text-[12px] text-[#6d756f] hover:text-indigo-700 transition-colors" onClick={onCancel}>Cancel and sign out</button>}
      </form>
    </AuthCard>
  );
}

// ── APP SHELL ─────────────────────────────────────────────────────────────────
// Deep-green sidebar + sage canvas + white workspace. Below lg the sidebar
// becomes a drawer opened from a slim top bar.
function AppShell({ renderSidebar, children }) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!drawer) return;
    const onKey = e => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
  return (
    <div className="flex h-screen overflow-hidden bg-canvas font-sans text-foreground">
      <div className="hidden lg:flex">{renderSidebar(() => {})}</div>
      {drawer && (
        <div className="fixed inset-0 z-[250] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-[#142019]/45" onClick={() => setDrawer(false)} />
          <div className="relative h-full w-[264px] max-w-[85vw]">{renderSidebar(() => setDrawer(false))}</div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="lg:hidden flex items-center gap-3 h-14 px-4 bg-sidebar text-white shrink-0">
          <button type="button" aria-label="Open navigation" className="rounded-md p-1.5 -ml-1.5 hover:bg-white/10 transition-colors" onClick={() => setDrawer(true)}><Menu className="h-5 w-5" /></button>
          <BrandMark light className="h-7" />
          <span className="border-l border-white/20 pl-2.5 text-[14px] font-bold">Skillgo</span>
        </div>
        <main className="flex-1 overflow-auto scroll-quiet p-2 sm:p-3.5">
          <div className="min-h-full rounded-[18px] bg-workspace px-4 py-6 sm:px-8 sm:py-8 xl:px-9">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({ profile, tab, setTab, onLogout, myDone, myTotal, trainings, currentFY, pendingApprovalsCount, showMyTrainings }) {
  const isManager = profile.role === "reporting_manager";
  const isAdmin = profile.role === "admin";
  const overdue = trainings.filter(t => isOpenStatus(getEffStatus(t)) && isOverdue(t.due_date)).length;
  const nav = isAdmin ? [
    { id: "overview", icon: LayoutDashboard, label: "Overview" },
    { id: "users", icon: UserCog, label: "Users" },
    { id: "catalog", icon: FolderOpen, label: "Training Catalog" },
  ] : isManager ? [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "approvals", icon: Library, label: "Approvals", badge: pendingApprovalsCount || null },
    // A manager who reports to someone also has their own trainings.
    ...(showMyTrainings ? [{ id: "my-trainings", icon: BookOpen, label: "My Trainings", badge: `${myDone}/${myTotal}` }] : []),
    { id: "catalog", icon: FolderOpen, label: "Training Catalog" },
    { id: "knowledge-hub", icon: Lightbulb, label: "Knowledge Hub" },
    { id: "reminders", icon: Bell, label: "Reminders", badge: overdue || null },
    { id: "settings", icon: SettingsIcon, label: "Team & Settings" },
  ] : [
    { id: "my-trainings", icon: BookOpen, label: "My Trainings", badge: `${myDone}/${myTotal}` },
    { id: "knowledge-hub", icon: Lightbulb, label: "Knowledge Hub" },
  ];
  return (
    <aside className="w-[244px] h-full flex flex-col shrink-0 bg-gradient-to-b from-sidebar to-sidebar-deep text-[#eef4ef] px-3.5 pt-5 pb-3.5">
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <BrandMark light className="h-9 w-auto shrink-0" />
        <span className="border-l border-white/20 pl-2.5 text-[14px] font-bold tracking-[-0.01em] text-white">Skillgo</span>
      </div>
      <div className="flex items-center justify-between px-2.5 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#aebdb2]">Workspace</span>
        {isManager && <span className="text-[10.5px] font-semibold text-white/65 border border-white/15 rounded-full px-2 py-px">FY {currentFY}</span>}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Main">
        {nav.map(item => {
          const active = tab === item.id; const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setTab(item.id)} aria-current={active ? "page" : undefined}
              className={cn("w-full flex items-center justify-between rounded-lg px-2.5 h-10 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                active ? "bg-[rgba(221,237,224,0.13)] text-white font-semibold" : "text-[#d3ded6] hover:bg-white/[0.07] hover:text-white")}>
              <span className="flex items-center gap-2.5"><Icon className={cn("h-[17px] w-[17px]", active ? "opacity-100" : "opacity-80")} />{item.label}</span>
              {item.badge != null && (
                <span className={cn("text-[10.5px] font-bold rounded-full px-1.5 min-w-[22px] h-5 inline-flex items-center justify-center",
                  active ? "bg-white/90 text-sidebar" : "bg-white/[0.12] text-white/85")}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="mt-3 border-t border-white/[0.14] pt-3">
        <div className="flex items-center gap-2.5 px-2 pb-3">
          <UAvatar solid name={profile.full_name} color={profile.color} className="h-8 w-8 ring-2 ring-white/10" />
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-white truncate">{profile.full_name}</div>
            <div className="text-[10.5px] text-[#b4c1b8] mt-0.5">{ROLE_LABELS[profile.role]}</div>
          </div>
        </div>
        <button onClick={onLogout} className="w-full h-9 rounded-lg border border-white/[0.13] bg-white/[0.06] text-[12px] font-medium text-[#e3ebe5] inline-flex items-center justify-center gap-2 hover:bg-white/[0.1] transition-colors">
          <LogOut className="h-3.5 w-3.5" />Logout
        </button>
      </div>
    </aside>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ reportees, trainings, onAdd, onBulk, onRefresh, refreshing, fyList, fyFilter, setFyFilter, onExport, onDetail }) {
  const [drill, setDrill] = useState(null);
  const [memberModal, setMemberModal] = useState(null);
  const fyT = trainings.filter(t => t.fy === fyFilter && t.status !== "discarded");
  const totalU = fyT.reduce((s, t) => s + getUnits(t).total, 0);
  const doneU = fyT.reduce((s, t) => s + getUnits(t).done, 0);
  const pct = totalU ? Math.round(doneU / totalU * 100) : 0;
  const overdueList = fyT.filter(t => isOpenStatus(getEffStatus(t)) && isOverdue(t.due_date));
  const stars = reportees.filter(u => getAchievement(u, fyT) === "star");

  const stats = [
    { key: "members", label: "Team Members", value: reportees.length, note: "active", Icon: Users },
    { key: "units", label: "Training Units", value: totalU, note: `${fyT.length} trainings`, Icon: Package },
    { key: "completion", label: "Completion", value: `${pct}%`, note: `${doneU}/${totalU} units`, Icon: Target },
    { key: "overdue", label: "Overdue", value: overdueList.length, note: "need action", Icon: Clock, tone: overdueList.length ? "alert" : undefined },
  ];

  const userName = id => (reportees.find(u => u.id === id) || {}).full_name || "Unknown";
  const userColor = id => (reportees.find(u => u.id === id) || {}).color;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Team Dashboard</h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">Training progress overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Select value={fyFilter} onValueChange={setFyFilter}>
            <SelectTrigger className="w-[136px]"><SelectValue /></SelectTrigger>
            <SelectContent>{fyList.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={onExport}><Download className="h-4 w-4 mr-1.5" />Export</Button>
          <Button variant="outline" size="sm" onClick={onBulk}><Users className="h-4 w-4 mr-1.5" />Bulk Assign</Button>
          <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1.5" />Assign Training</Button>
        </div>
      </div>

      {stars.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/60">
          <CardContent className="p-5">
            <div className="text-sm font-bold text-amber-800 mb-3">Star Performers — FY {fyFilter}</div>
            <div className="flex flex-wrap gap-3">
              {stars.map(u => (
                <div key={u.id} className="flex items-center gap-2.5 bg-card border border-amber-200 rounded-xl px-4 py-2.5">
                  <UAvatar name={u.full_name} color={u.color} className="h-8 w-8" />
                  <div>
                    <div className="text-[13px] font-semibold">{u.full_name}</div>
                    <div className="text-[11px] text-amber-700">All trainings completed!</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => <StatCard key={s.key} label={s.label} value={s.value} note={s.note} Icon={s.Icon} tone={s.tone} onClick={() => setDrill(s.key)} />)}
      </div>

      <SectionLabel>Individual Progress — FY {fyFilter}</SectionLabel>
      {reportees.length === 0 ? (
        <Card className="border-dashed bg-table-head"><CardContent className="p-11 text-center text-[13px] text-muted-foreground">No reportees yet. Add them in Settings.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {reportees.map(u => {
            const ut = fyT.filter(t => t.assigned_to === u.id);
            const totalUU = ut.reduce((s, t) => s + getUnits(t).total, 0);
            const doneUU = ut.reduce((s, t) => s + getUnits(t).done, 0);
            const up = totalUU ? Math.round(doneUU / totalUU * 100) : 0;
            const tone = up >= 60 ? "text-emerald-600" : up >= 30 ? "text-amber-600" : "text-rose-600";
            const pending = ut.filter(t => isOpenStatus(getEffStatus(t)));
            const done = ut.filter(t => getEffStatus(t) === "approved");
            const od = pending.filter(t => isOverdue(t.due_date));
            const ach = getAchievement(u, fyT);
            return (
              <Card key={u.id} className="hover:border-indigo-200 transition-colors">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <UAvatar name={u.full_name} color={u.color} className="h-10 w-10" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14.5px] truncate">{u.full_name}</span>
                        {ach && <AchBadge level={ach} />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{doneUU}/{totalUU} units done</div>
                    </div>
                    <div className={cn("text-lg font-bold tracking-tight", tone)}>{up}%</div>
                  </div>
                  <Progress value={up} className="h-2 mb-3" />

                  {ut.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No trainings assigned for this FY.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {done.length > 0 && <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{done.length} done</span>}
                        {pending.length - od.length > 0 && <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{pending.length - od.length} pending</span>}
                        {od.length > 0 && <span className="text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">{od.length} overdue</span>}
                      </div>
                      {pending.slice(0, 2).map(t => (
                        <div key={t.id} className={cn("text-[12.5px] flex items-center gap-1.5 mb-1", isOverdue(t.due_date) ? "text-rose-600" : "text-muted-foreground")}>
                          <span className="text-[8px]">●</span><span className="truncate">{t.name}</span>
                          {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-px rounded-full shrink-0">{partsLabel(t)}</span>}
                        </div>
                      ))}
                      {pending.length === 0 && <p className="text-xs text-emerald-600 font-medium">✓ All done for this FY</p>}
                      <button onClick={() => setMemberModal(u)} className="text-xs font-medium text-indigo-700 hover:text-indigo-900 mt-1.5 inline-flex items-center gap-1">
                        View all {ut.length} <ChevronRight className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SectionLabel>Year-wise Summary</SectionLabel>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-head border-b">
                <th className="text-left font-medium text-muted-foreground px-4 py-3 text-[10.5px] font-semibold uppercase tracking-[0.06em]">Member</th>
                {fyList.map(fy => <th key={fy} className="text-center font-medium text-muted-foreground px-3 py-3 text-xs">FY {fy}</th>)}
              </tr>
            </thead>
            <tbody>
              {reportees.map(u => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-[#f7f9f7] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <UAvatar name={u.full_name} color={u.color} className="h-6 w-6" />
                      <span className="font-medium">{u.full_name}</span>
                    </div>
                  </td>
                  {fyList.map(fy => {
                    const utt = trainings.filter(t => t.assigned_to === u.id && t.fy === fy);
                    const tU = utt.reduce((s, t) => s + getUnits(t).total, 0);
                    const dU = utt.reduce((s, t) => s + getUnits(t).done, 0);
                    if (!tU) return <td key={fy} className="text-center px-3 py-3 text-muted-foreground/40">—</td>;
                    return <td key={fy} className="text-center px-3 py-3"><span className={cn("font-semibold", dU === tU ? "text-emerald-600" : "")}>{dU}/{tU}</span></td>;
                  })}
                </tr>
              ))}
              {reportees.length === 0 && <tr><td colSpan={fyList.length + 1} className="text-center text-muted-foreground py-6">No reportees yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <DashboardDrill
        which={drill} onClose={() => setDrill(null)} fyFilter={fyFilter}
        members={reportees} fyT={fyT} overdueList={overdueList}
        userName={userName} userColor={userColor} onDetail={onDetail}
      />
      <MemberTrainingsModal
        member={memberModal} onClose={() => setMemberModal(null)} fyFilter={fyFilter}
        trainings={fyT.filter(t => memberModal && t.assigned_to === memberModal.id)}
        onDetail={onDetail}
      />
    </div>
  );
}

function TrainingMiniRow({ t, who, whoColor, onDetail }) {
  const status = getEffStatus(t);
  const StatusIcon = status === "approved" ? Check : status === "in_progress" ? CircleDot : Circle;
  return (
    <button onClick={() => onDetail && onDetail(t, null)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition text-left">
      <StatusIcon className={cn("h-4 w-4 shrink-0", status === "approved" ? "text-emerald-600" : status === "in_progress" ? "text-indigo-600" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{t.name}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          {who && <span className="flex items-center gap-1"><UAvatar name={who} color={whoColor} className="h-3.5 w-3.5" />{who}</span>}
          {t.due_date && <span className={cn(isOverdue(t.due_date) && status !== "approved" && "text-rose-600")}>Due {fmtDate(t.due_date)}</span>}
        </div>
      </div>
      {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">{partsLabel(t)}</span>}
      <StatusBadge status={status} dueDate={t.due_date} />
    </button>
  );
}

function DashboardDrill({ which, onClose, fyFilter, members, fyT, overdueList, userName, userColor, onDetail }) {
  if (!which) return null;
  const titles = { members: "Team Members", units: "Training Units", completion: "Completion breakdown", overdue: "Overdue trainings" };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="lg">
        <DialogHeader>
          <DialogTitle>{titles[which]}</DialogTitle>
          <DialogDescription>FY {fyFilter}</DialogDescription>
        </DialogHeader>

        {which === "members" && (
          <div className="space-y-1">
            {members.map(u => {
              const ut = fyT.filter(t => t.assigned_to === u.id);
              const tot = ut.reduce((s, t) => s + getUnits(t).total, 0);
              const dn = ut.reduce((s, t) => s + getUnits(t).done, 0);
              const up = tot ? Math.round(dn / tot * 100) : 0;
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition">
                  <UAvatar name={u.full_name} color={u.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{u.full_name}</div><div className="text-[11px] text-muted-foreground">{u.email || "no email"}</div></div>
                  <div className="w-24"><Progress value={up} className="h-1.5" /></div>
                  <span className="text-[12px] font-semibold w-9 text-right">{up}%</span>
                </div>
              );
            })}
            {members.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No reportees yet.</p>}
          </div>
        )}

        {which === "completion" && (
          <div className="space-y-1">
            {members.map(u => {
              const ut = fyT.filter(t => t.assigned_to === u.id);
              const tot = ut.reduce((s, t) => s + getUnits(t).total, 0);
              const dn = ut.reduce((s, t) => s + getUnits(t).done, 0);
              const up = tot ? Math.round(dn / tot * 100) : 0;
              const tone = up >= 60 ? "text-emerald-600" : up >= 30 ? "text-amber-600" : "text-rose-600";
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <UAvatar name={u.full_name} color={u.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{u.full_name}</div><Progress value={up} className="h-1.5 mt-1" /></div>
                  <span className="text-[11px] text-muted-foreground w-16 text-right">{dn}/{tot} units</span>
                  <span className={cn("text-[13px] font-bold w-10 text-right", tone)}>{up}%</span>
                </div>
              );
            })}
          </div>
        )}

        {which === "units" && (
          <div className="space-y-1">
            {fyT.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No trainings this FY.</p>
              : fyT.map(t => <TrainingMiniRow key={t.id} t={t} who={userName(t.assigned_to)} whoColor={userColor(t.assigned_to)} onDetail={onDetail} />)}
          </div>
        )}

        {which === "overdue" && (
          <div className="space-y-1">
            {overdueList.length === 0 ? <p className="text-sm text-emerald-600 text-center py-6 font-medium">Nothing overdue. Great going!</p>
              : overdueList.map(t => <TrainingMiniRow key={t.id} t={t} who={userName(t.assigned_to)} whoColor={userColor(t.assigned_to)} onDetail={onDetail} />)}
          </div>
        )}

        <DialogFooter><Button variant="outline" className="w-full" onClick={onClose}>Close</Button></DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

function MemberTrainingsModal({ member, onClose, fyFilter, trainings, onDetail }) {
  if (!member) return null;
  const groups = [
    ["Overdue", trainings.filter(t => isOpenStatus(getEffStatus(t)) && isOverdue(t.due_date))],
    ["Awaiting Approval", trainings.filter(t => getEffStatus(t) === "submitted")],
    ["Sent Back", trainings.filter(t => getEffStatus(t) === "sent_back" && !isOverdue(t.due_date))],
    ["In Progress", trainings.filter(t => getEffStatus(t) === "in_progress" && !isOverdue(t.due_date))],
    ["Not Started", trainings.filter(t => getEffStatus(t) === "pending" && !isOverdue(t.due_date))],
    ["Completed", trainings.filter(t => getEffStatus(t) === "approved")],
  ].filter(([, arr]) => arr.length);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <UAvatar name={member.full_name} color={member.color} className="h-9 w-9" />
            <div><DialogTitle>{member.full_name}</DialogTitle><DialogDescription>All trainings — FY {fyFilter}</DialogDescription></div>
          </div>
        </DialogHeader>
        {trainings.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No trainings assigned this FY.</p>
          : groups.map(([label, arr]) => (
            <div key={label}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1 mt-1">{label} · {arr.length}</div>
              <div className="space-y-0.5">{arr.map(t => <TrainingMiniRow key={t.id} t={t} onDetail={onDetail} />)}</div>
            </div>
          ))}
        <DialogFooter><Button variant="outline" className="w-full" onClick={onClose}>Close</Button></DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── MY TRAININGS (reportee) ────────────────────────────────────────────────────
function MyTrainings({ trainings, requests, onRequestApproval, onDetail, onStart, onProgress, fyList, fyFilter, setFyFilter }) {
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  const run = async (id, fn) => { setBusyId(id); setErr(""); try { await fn(); } catch (e) { setErr(e.message); } setBusyId(null); };
  const [expanded, setExpanded] = useState(new Set());
  const toggle = id => setExpanded(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const fyT = trainings.filter(t => t.fy === fyFilter);
  const filtered = fyT.filter(t => {
    const s = getEffStatus(t);
    if (filter === "all") return s !== "discarded";
    if (filter === "pending") return s === "pending" || s === "sent_back";
    if (filter === "in-progress") return s === "in_progress" || s === "submitted";
    if (filter === "overdue") return isOpenStatus(s) && isOverdue(t.due_date);
    if (filter === "completed") return s === "approved";
    return true;
  });
  const activeT = fyT.filter(t => t.status !== "discarded");
  const totalU = activeT.reduce((s, t) => s + getUnits(t).total, 0);
  const doneU = activeT.reduce((s, t) => s + getUnits(t).done, 0);
  const filters = [["all", "All"], ["pending", "Pending"], ["in-progress", "In Progress"], ["overdue", "Overdue"], ["completed", "Completed"]];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">My Trainings</h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">{doneU}/{totalU} units completed in FY {fyFilter}</p>
        </div>
        <Select value={fyFilter} onValueChange={setFyFilter}>
          <SelectTrigger className="w-[136px]"><SelectValue /></SelectTrigger>
          <SelectContent>{fyList.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-4 py-1.5 rounded-full text-[13px] font-medium border transition",
              filter === f ? "bg-indigo-50 border-indigo-400 text-indigo-800 font-semibold" : "bg-white border-border text-muted-foreground hover:border-[#c5cec7] hover:text-foreground")}>{l}</button>
        ))}
      </div>

      {err && <FormError className="mb-3">{err}</FormError>}
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-11 text-center text-sm text-muted-foreground">No trainings in this filter.</div>
        ) : filtered.map((t, i) => {
          const status = getEffStatus(t);
          const { done: pd, total: pt } = getUnits(t);
          const isM = hasParts(t); const isE = expanded.has(t.id);
          const overdueRow = isOpenStatus(status) && isOverdue(t.due_date);
          const StatusIcon = status === "approved" ? Check : status === "in_progress" ? CircleDot : Circle;
          const wholeReq = !isM ? reqFor(requests, t.id, null, "sent_back") : null;
          return (
            <div key={t.id} className={cn(i < filtered.length - 1 && "border-b")}>
              <div className={cn("flex items-center gap-3 px-5 py-3.5", overdueRow && "bg-rose-50/40")}>
                <StatusIcon className={cn("h-5 w-5 shrink-0", status === "approved" ? "text-emerald-600" : status === "in_progress" ? "text-indigo-600" : "text-muted-foreground")} />
                <div className={cn("flex-1 min-w-0", isM && "cursor-pointer")} onClick={() => isM && toggle(t.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{t.name}</span>
                    {t.carried_from_fy && <FYBadge fy={`↪ ${t.carried_from_fy}`} />}
                    {isM && <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{pd}/{pt} Parts</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                    {t.due_date && <span className={cn(isOverdue(t.due_date) && status !== "approved" && "text-rose-600")}><CalendarDays className="h-3 w-3 inline mr-0.5" />Due {fmtDate(t.due_date)}</span>}
                    {!isM && t.completed_date && <span>✓ {fmtDate(t.completed_date)}</span>}
                    {cleanLinks(t.resources).length > 0 && <span className="text-indigo-600">{cleanLinks(t.resources).length} resource(s)</span>}
                    {isM && <span>{isE ? "▲ Collapse" : "▼ View parts"}</span>}
                  </div>
                  {!isM && status === "sent_back" && wholeReq?.manager_remarks && (
                    <div className="text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1.5 mt-2">↩ {wholeReq.manager_remarks}</div>
                  )}
                  {isM && pt > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={Math.round(pd / pt * 100)} className="h-1.5 flex-1" />
                      <span className="text-[11px] text-muted-foreground shrink-0">{Math.round(pd / pt * 100)}%</span>
                    </div>
                  )}
                  {!isM && (status === "in_progress" || status === "sent_back") && (
                    <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <Progress value={t.progress_pct || 0} className="h-1.5 flex-1" />
                      <Select value={String(t.progress_pct || 0)} onValueChange={v => run(t.id, () => onProgress(t.id, Number(v)))}>
                        <SelectTrigger className="h-8 w-[118px] text-[12px]" aria-label="Progress"><SelectValue /></SelectTrigger>
                        <SelectContent>{PROGRESS_STEPS.map(p => <SelectItem key={p} value={String(p)}>{p}% done</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <StatusBadge status={status} dueDate={t.due_date} />
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => onDetail(t, null)}>Details</Button>
                {status === "pending" && <Button size="sm" className="shrink-0" disabled={busyId === t.id} onClick={() => run(t.id, () => onStart(t.id))}><Play className="h-3.5 w-3.5 mr-1" />{busyId === t.id ? "Starting…" : "Start"}</Button>}
                {!isM && (status === "in_progress" || status === "sent_back") && <Button size="sm" className="shrink-0" onClick={() => onRequestApproval(t, null)}>{status === "sent_back" ? "Resubmit" : "Mark as Done"}</Button>}
                {isM && <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => toggle(t.id)}>{isE ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</Button>}
              </div>
              {isM && isE && (
                <div className="bg-muted/40 border-t px-5 py-2 pl-14">
                  {sortedParts(t).map((part, pi) => {
                    const partReq = reqFor(requests, t.id, part.id, "sent_back");
                    return (
                      <div key={part.id} className={cn("py-3", pi < sortedParts(t).length - 1 && "border-b")}>
                        <div className="flex items-center gap-3">
                          <PartDot n={pi + 1} status={part.status} />
                          <div className="flex-1 min-w-0">
                            <div className={cn("text-[13.5px] font-medium", part.status === "approved" ? "text-muted-foreground line-through" : "")}>{part.title}</div>
                            {part.completed_date && <div className="text-xs text-muted-foreground mt-0.5">✓ Completed {fmtDate(part.completed_date)}</div>}
                            {part.status === "sent_back" && partReq?.manager_remarks && (
                              <div className="text-[12px] text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1.5 mt-1.5">↩ {partReq.manager_remarks}</div>
                            )}
                          </div>
                          <StatusBadge status={part.status} />
                          {status !== "pending" && (part.status === "pending" || part.status === "sent_back") && <Button size="sm" className="shrink-0" onClick={() => onRequestApproval(t, part)}>{part.status === "sent_back" ? "Resubmit" : "Mark as Done"}</Button>}
                          {part.status === "approved" && <Button variant="outline" size="sm" className="shrink-0" onClick={() => onDetail(t, part)}>View Notes</Button>}
                        </div>
                        {part.part_link && part.status !== "approved" && <div className="mt-2 pl-9"><LinkChips links={[{ url: part.part_link, title: "Part material" }]} /></div>}
                      </div>
                    );
                  })}
                  {status === "pending" && <div className="text-xs text-muted-foreground bg-card border rounded-lg px-3 py-1.5 my-2.5">Start this training to mark its parts as done.</div>}
                  {pd === pt && pt > 0 && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 my-2.5">All parts completed! This training is fully done.</div>}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ── KNOWLEDGE HUB ─────────────────────────────────────────────────────────────
function KnowledgeHub({ trainings, reportees, requests, onDetail }) {
  const [search, setSearch] = useState("");
  const [fyF, setFyF] = useState("all");
  const [openGroup, setOpenGroup] = useState(null);
  const getUser = id => reportees.find(u => u.id === id) || { full_name: "Unknown", color: "#94a3b8" };

  const completed = trainings.filter(t => getEffStatus(t) === "approved");
  const fyPool = fyF === "all" ? completed : completed.filter(t => t.fy === fyF);
  const allFYs = [...new Set(completed.map(t => t.fy))].filter(Boolean).sort().reverse();

  const groupsMap = {};
  fyPool.forEach(t => {
    const key = `name:${t.name.toLowerCase()}`;
    if (!groupsMap[key]) groupsMap[key] = { key, title: t.name, entries: [] };
    groupsMap[key].entries.push(t);
  });
  let groups = Object.values(groupsMap).map(g => {
    const byUser = {};
    g.entries.forEach(t => {
      const prev = byUser[t.assigned_to];
      if (!prev || (t.completed_date || "") > (prev.completed_date || "")) byUser[t.assigned_to] = t;
    });
    const contributors = Object.values(byUser).sort((a, b) => (b.completed_date || "").localeCompare(a.completed_date || ""));
    const latest = contributors[0]?.completed_date || "";
    return { ...g, contributors, latest };
  });

  const notePreview = t => {
    if (hasParts(t)) { const fp = sortedParts(t).map(p => reqFor(requests, t.id, p.id, "approved")).find(r => r?.notes); return fp ? fp.notes : ""; }
    return reqFor(requests, t.id, null, "approved")?.notes || "";
  };

  const q = search.trim().toLowerCase();
  if (q) {
    groups = groups.filter(g =>
      g.title.toLowerCase().includes(q) || g.contributors.some(t => notePreview(t).toLowerCase().includes(q))
    );
  }
  groups.sort((a, b) => (b.latest || "").localeCompare(a.latest || ""));

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Knowledge Hub</h1>
        <p className="text-[12.5px] text-muted-foreground mt-1.5">A shared library of completed trainings — browse what your teammates learned and where they learned it.</p>
      </div>
      <div className="flex gap-2.5 mb-5">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search trainings or anyone's notes..." className="pl-9" />
        </div>
        <Select value={fyF} onValueChange={setFyF}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All FYs</SelectItem>
            {allFYs.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed bg-table-head"><CardContent className="p-14 text-center text-[13px] text-muted-foreground">{completed.length === 0 ? "No completed trainings yet — once someone finishes a training, it'll appear here for everyone to learn from." : "No results found."}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => {
            const preview = notePreview(g.contributors[0]);
            const shown = g.contributors.slice(0, 4);
            const extra = g.contributors.length - shown.length;
            return (
              <Card key={g.key} className="hover:border-indigo-200 transition-colors cursor-pointer flex flex-col" onClick={() => setOpenGroup(g)}>
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 flex items-center justify-center"><GraduationCap className="w-[18px] h-[18px] text-indigo-600" /></div>
                      <div className="font-semibold text-[14.5px] truncate">{g.title}</div>
                    </div>
                    <Badge variant="outline" className="text-indigo-700 bg-indigo-50 border-indigo-200 font-medium shrink-0">{g.contributors.length} {g.contributors.length === 1 ? "contributor" : "contributors"}</Badge>
                  </div>

                  {preview ? (
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">“{preview}”</p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground/70 italic mb-3">Completed — open to see references.</p>
                  )}

                  <div className="mt-auto pt-3 border-t flex items-center justify-between gap-2">
                    <div className="flex items-center">
                      <div className="flex -space-x-2">
                        {shown.map(t => { const u = getUser(t.assigned_to); return (
                          <div key={t.id} className="ring-2 ring-white rounded-full"><UAvatar name={u.full_name} color={u.color} className="h-7 w-7" /></div>
                        ); })}
                      </div>
                      {extra > 0 && <span className="ml-2 text-xs font-medium text-muted-foreground">+{extra}</span>}
                    </div>
                    <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">Open →</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <KnowledgeDetailModal group={openGroup} reportees={reportees} requests={requests} onClose={() => setOpenGroup(null)} />
    </div>
  );
}

function KnowledgeDetailModal({ group, reportees, requests, onClose }) {
  if (!group) return null;
  const getUser = id => reportees.find(u => u.id === id) || { full_name: "Unknown", color: "#94a3b8" };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-indigo-50 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-indigo-600" /></div>
            <div className="min-w-0">
              <DialogTitle className="leading-snug">{group.title}</DialogTitle>
              <DialogDescription>{group.contributors.length} {group.contributors.length === 1 ? "person has" : "people have"} completed this — learn from their notes below.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {group.contributors.map(t => {
            const u = getUser(t.assigned_to);
            const isM = hasParts(t);
            const trainingRes = cleanLinks(t.resources);
            return (
              <div key={t.id} className="border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-table-head border-b">
                  <UAvatar name={u.full_name} color={u.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold">{u.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">Completed {fmtDate(t.completed_date)} · FY {t.fy}</div>
                  </div>
                  {isM && <Badge variant="outline" className="text-indigo-700 bg-indigo-50 border-indigo-200 font-medium shrink-0">{t.training_parts.length} parts</Badge>}
                </div>

                <div className="p-4 space-y-3">
                  {isM ? (
                    sortedParts(t).map((p, pi) => {
                      const r = reqFor(requests, t.id, p.id, "approved");
                      const oc = cleanLinks(r?.outcome_links);
                      return (
                        <div key={p.id} className="pl-3 border-l-2 border-indigo-200">
                          <div className="text-[12px] font-semibold text-indigo-700 mb-1">Part {pi + 1}: {p.title}</div>
                          {r?.notes ? <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap mb-2">{r.notes}</p> : <p className="text-[12.5px] text-muted-foreground italic mb-2">No notes.</p>}
                          {oc.length > 0 && <div className="mb-1"><LinkChips links={oc} /></div>}
                        </div>
                      );
                    })
                  ) : (
                    (() => {
                      const r = reqFor(requests, t.id, null, "approved");
                      const oc = cleanLinks(r?.outcome_links);
                      return (
                        <>
                          {r?.notes ? <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{r.notes}</p> : <p className="text-[12.5px] text-muted-foreground italic">No notes added.</p>}
                          {oc.length > 0 && (
                            <div>
                              <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Outcome references</div>
                              {oc.map((l, i) => <LinkRow key={i} link={l} theme="indigo" />)}
                            </div>
                          )}
                        </>
                      );
                    })()
                  )}

                  {trainingRes.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Reference material used</div>
                      <LinkChips links={trainingRes} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter><Button variant="outline" className="w-full" onClick={onClose}>Close</Button></DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
function DetailModal({ training, part: focusPart, reportees, requests, onClose, onEdit, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const u = reportees.find(x => x.id === training.assigned_to) || { full_name: "Unknown", color: "#94a3b8" };
  const isM = hasParts(training); const status = getEffStatus(training);
  const resources = cleanLinks(training.resources);
  const category = training.training_categories;

  const PartSec = ({ part, n }) => {
    const r = reqFor(requests, training.id, part.id, "approved");
    const oc = cleanLinks(r?.outcome_links);
    return (
      <div className="bg-muted/50 border rounded-xl p-4 mb-2.5">
        <div className="flex items-center gap-2.5 mb-2.5">
          <PartDot n={n} status={part.status} />
          <div className="flex-1 font-semibold text-sm">{part.title}</div>
          <StatusBadge status={part.status} />
        </div>
        {part.part_link && (
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Reference material for this part:</div>
            <LinkRow link={{ url: part.part_link, title: "Part material" }} theme="amber" />
          </div>
        )}
        {part.status === "approved" ? (
          <>
            <div className="text-xs text-muted-foreground mb-2">✓ Completed {fmtDate(part.completed_date)}</div>
            {r?.notes && <div className="text-[13px] leading-relaxed mb-2.5 whitespace-pre-wrap bg-card rounded-lg p-3 border">{r.notes}</div>}
            {r?.manager_remarks && <div className="text-[12.5px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2.5"><strong>Manager's remarks:</strong> {r.manager_remarks}</div>}
            {oc.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Outcome references:</div>{oc.map((l, i) => <LinkRow key={i} link={l} theme="indigo" />)}</>}
          </>
        ) : (
          <div className="text-[13px] text-muted-foreground italic">Not completed yet.</div>
        )}
      </div>
    );
  };

  const wholeReq = !isM ? reqFor(requests, training.id, null, "approved") : null;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1 flex-wrap">
            Training Detail <FYBadge fy={training.fy} />
            {category && <span className="bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full normal-case tracking-normal">{category.group_name} · {category.name}</span>}
            {isM && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full normal-case tracking-normal">{training.training_parts.length} Parts</span>}
          </div>
          <DialogTitle className="text-lg leading-snug">{training.name}</DialogTitle>
          {training.description && <DialogDescription className="whitespace-pre-wrap">{training.description}</DialogDescription>}
        </DialogHeader>

        <div className="flex items-center gap-3 p-3.5 bg-muted/50 rounded-xl border">
          <UAvatar name={u.full_name} color={u.color} className="h-10 w-10" />
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">{u.full_name}</div>
            <div className="text-xs text-muted-foreground">{status === "approved" ? `Completed ${fmtDate(training.completed_date)}` : training.due_date ? `Due ${fmtDate(training.due_date)}` : "No due date"}</div>
            <div className="text-xs text-muted-foreground mt-0.5 capitalize">{MODE_OPTIONS.find(m => m.value === training.mode)?.label || training.mode}{training.trainer ? ` · Trainer: ${training.trainer}` : ""} · Priority: {training.priority}</div>
            {training.expected_end_date && <div className="text-xs text-muted-foreground mt-0.5">Expected end: {fmtDate(training.expected_end_date)}</div>}
            {isM && <Progress value={Math.round(getUnits(training).done / getUnits(training).total * 100)} className="h-1.5 mt-2" />}
            {!isM && (status === "in_progress" || status === "sent_back") && <div className="flex items-center gap-2 mt-2"><Progress value={training.progress_pct || 0} className="h-1.5 flex-1" /><span className="text-[11px] text-muted-foreground">{training.progress_pct || 0}%</span></div>}
          </div>
          <StatusBadge status={status} dueDate={training.due_date} />
        </div>

        <div>
          <div className="text-[13px] font-bold mb-2.5">Training Material</div>
          <LinkRow link={{ url: training.training_link, title: "Training material" }} theme="amber" />
        </div>
        {resources.length > 0 && (
          <div>
            <div className="text-[13px] font-bold mb-2.5">Additional Reference Material</div>
            {resources.map((l, i) => <LinkRow key={i} link={l} theme="amber" />)}
          </div>
        )}

        {!isM && wholeReq?.manager_remarks && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
            <strong>Manager's remarks:</strong> {wholeReq.manager_remarks}
          </div>
        )}

        {isM ? (
          <div>
            <div className="text-[13px] font-bold mb-3">Parts & Learnings</div>
            {sortedParts(training).map((part, pi) => <PartSec key={part.id} part={part} n={pi + 1} />)}
          </div>
        ) : (
          <>
            <div>
              <div className="text-[13px] font-bold mb-2.5">Key Learnings & Outcome Notes</div>
              <div className="bg-muted/50 rounded-xl p-4 text-sm leading-relaxed border whitespace-pre-wrap min-h-[60px]">
                {wholeReq?.notes || <span className="text-muted-foreground italic">{status === "approved" ? "No notes added." : "Not completed yet."}</span>}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-2.5">Outcome Reference Material</div>
              {cleanLinks(wholeReq?.outcome_links).length > 0
                ? cleanLinks(wholeReq?.outcome_links).map((l, i) => <LinkRow key={i} link={l} theme="indigo" />)
                : <div className="p-3.5 bg-muted/50 rounded-xl border border-dashed text-[13px] text-muted-foreground italic">{status === "approved" ? "No reference material added." : "Not completed yet."}</div>}
            </div>
          </>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
          {onEdit && status !== "discarded" && <Button variant="outline" onClick={() => onEdit(training)}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
          {onDelete && <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete</Button>}
        </DialogFooter>
      </ModalContent>
      <ConfirmDialog
        open={confirmDel} danger
        title={`Delete "${training.name}"?`}
        body={`This removes the training from ${u.full_name}'s list, including any submitted notes and approvals. This can't be undone.`}
        confirmLabel="Delete training"
        onConfirm={async () => { setConfirmDel(false); await onDelete(training); }}
        onCancel={() => setConfirmDel(false)}
      />
    </Dialog>
  );
}

// ── APPROVAL REQUEST MODAL (reportee submits / resubmits) ────────────────────
function ApprovalRequestModal({ training, part, requests, onSubmit, onClose }) {
  const [notes, setNotes] = useState(""); const [outcomes, setOutcomes] = useState([{ url: "", title: "" }]);
  const [busy, setBusy] = useState(false);
  const ok = notes.trim().length > 0 && cleanLinks(outcomes).length > 0;
  const partsList = sortedParts(training);
  const partIdx = part ? partsList.findIndex(p => p.id === part.id) : -1;
  const isResubmit = (part ? part.status : training.status) === "sent_back";
  const sentBackReq = reqFor(requests, training.id, part?.id || null, "sent_back");
  const materialLink = part?.part_link || training.training_link;

  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try { await onSubmit(training.id, part?.id || null, notes.trim(), cleanLinks(outcomes)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="lg">
        <DialogHeader>
          <DialogTitle>{isResubmit ? "Resubmit for Approval" : "Request Approval"}{part ? ` — Part ${partIdx + 1}` : ""}</DialogTitle>
          <DialogDescription className="text-indigo-700 font-semibold">{training.name}</DialogDescription>
        </DialogHeader>

        {isResubmit && sentBackReq?.manager_remarks && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 px-3.5 py-2.5 text-[12.5px] text-orange-700">
            <strong>Manager's remarks:</strong> {sentBackReq.manager_remarks}
          </div>
        )}

        {part && <div className="text-[13px] text-muted-foreground px-3.5 py-2 bg-indigo-50 rounded-lg border border-indigo-200">Part {partIdx + 1}: {part.title}</div>}

        {materialLink && (
          <a href={safeUrl(materialLink)} target="_blank" rel="noreferrer" className="block text-[12.5px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 no-underline hover:brightness-95">
            <Link2 className="h-3 w-3 inline mr-1" />Open study material <ExternalLink className="h-3 w-3 inline" />
          </a>
        )}

        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 text-[12.5px] text-indigo-700">
          <strong>Both fields are mandatory</strong> — your manager reviews these before approving.
        </div>

        <div className="space-y-1.5">
          <Label>{part ? `Key Learnings — Part ${partIdx + 1}` : "Key Learnings / Outcome Notes"} <span className="text-rose-500">*</span></Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="What did you learn? Be specific so your manager and teammates benefit." />
        </div>
        <div className="space-y-1.5">
          <Label>Outcome Reference Material <span className="text-rose-500">*</span></Label>
          <LinkListEditor links={outcomes} setLinks={setOutcomes} titleP="e.g. 'My notes doc', 'Certificate'" addLabel="Add another reference" />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok || busy} onClick={submit}>{busy ? "Submitting…" : isResubmit ? "Resubmit" : "Submit for Approval"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── APPROVALS (manager) ────────────────────────────────────────────────────────
function ApprovalsPanel({ approvals, onApprove, onSendBack, onRefresh, refreshing }) {
  const [target, setTarget] = useState(null); // { req, action: "approve" | "send_back" }
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isApprove = target?.action === "approve";
  const open = (req, action) => { setTarget({ req, action }); setRemarks(""); setErr(""); };
  const confirm = async () => {
    setBusy(true); setErr("");
    try {
      if (isApprove) await onApprove(target.req.request_id, remarks.trim());
      else await onSendBack(target.req.request_id, remarks.trim());
      setTarget(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Approvals</h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">Review completion requests from your reportees</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />Refresh</Button>
      </div>
      {approvals.length === 0 ? (
        <Card className="border-dashed bg-table-head"><CardContent className="p-14 text-center text-[13px] text-muted-foreground">Nothing waiting on you right now.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {approvals.map(r => (
            <Card key={r.request_id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-[14.5px]">{r.training_name}{r.part_title ? ` — ${r.part_title}` : ""}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5"><UAvatar name={r.reportee_name} className="h-4 w-4" />{r.reportee_name} · requested {fmtDate((r.created_at || "").slice(0, 10))}</div>
                  </div>
                </div>
                <div className="bg-muted/50 border rounded-lg p-3 text-[13px] whitespace-pre-wrap mb-2.5">{r.notes}</div>
                <LinkChips links={r.outcome_links} />
                <div className="flex gap-2 mt-3.5">
                  <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => open(r, "send_back")}><X className="h-3.5 w-3.5 mr-1" />Send Back</Button>
                  <Button size="sm" onClick={() => open(r, "approve")}><Check className="h-3.5 w-3.5 mr-1" />Approve</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!target} onOpenChange={o => !o && setTarget(null)}>
        <ModalContent size="md">
          <DialogHeader>
            <DialogTitle>{isApprove ? "Approve" : "Send back"}{target ? ` — ${target.req.training_name}${target.req.part_title ? ` (${target.req.part_title})` : ""}` : ""}</DialogTitle>
            <DialogDescription>{isApprove ? `This marks it as complete for ${target?.req.reportee_name} and adds it to the Knowledge Hub. Remarks are optional.` : `Remarks are required so ${target?.req.reportee_name} knows what to fix.`}</DialogDescription>
          </DialogHeader>
          <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={4} placeholder={isApprove ? "Feedback for the reportee (optional)" : "What needs to change?"} />
          {err && <FormError>{err}</FormError>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setTarget(null)}>Cancel</Button>
            {isApprove
              ? <Button className="flex-[2] bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={confirm}><Check className="h-3.5 w-3.5 mr-1" />{busy ? "Approving…" : "Approve & mark complete"}</Button>
              : <Button className="flex-[2] bg-destructive hover:bg-rose-700" disabled={!remarks.trim() || busy} onClick={confirm}>{busy ? "Sending…" : "Send Back"}</Button>}
          </DialogFooter>
        </ModalContent>
      </Dialog>
    </div>
  );
}

// ── TRAINING FORM (shared by assign / edit / catalog) ─────────────────────────
// Fields the pilot feedback requires on every training: name, category, link,
// mode (+ trainer for face-to-face), priority — plus optional extras.
const emptyTrainingForm = () => ({
  name: "", description: "", category_id: "", training_link: "", mode: "online", trainer: "", priority: "medium",
  resources: [{ url: "", title: "" }], parts: [],
});
const formFromTemplate = t => ({
  name: t.name || "", description: t.description || "", category_id: t.category_id || "", training_link: t.training_link || "",
  mode: t.mode || "online", trainer: t.trainer || "", priority: t.priority || "medium",
  resources: cleanLinks(t.resources).length ? cleanLinks(t.resources) : [{ url: "", title: "" }],
  parts: (t.parts || []).map(p => ({ id: uid("p"), title: p.title || "", part_link: p.part_link || "" })),
});
// The material link is mandatory on an assigned training; catalog entries may leave it for later.
const trainingFormValid = (f, linkRequired = true) => f.name.trim() && f.category_id && (!linkRequired || f.training_link.trim()) && (f.mode !== "face_to_face" || f.trainer.trim());
const trainingFormPayload = f => ({
  name: f.name.trim(), description: f.description.trim() || null, category_id: f.category_id, training_link: f.training_link.trim() || null,
  mode: f.mode, trainer: f.mode === "face_to_face" ? f.trainer.trim() : null,
  priority: f.priority, resources: cleanLinks(f.resources),
});
const formParts = f => f.parts.filter(p => p.title.trim()).map(p => ({ title: p.title.trim(), part_link: p.part_link.trim() || null }));

function TrainingFields({ form, setForm, categories, showParts = true, partsLocked, linkRequired = true }) {
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const addPart = () => set("parts", [...form.parts, { id: uid("p"), title: "", part_link: "" }]);
  const updPart = (id, f, v) => set("parts", form.parts.map(x => x.id === id ? { ...x, [f]: v } : x));
  const rmPart = id => set("parts", form.parts.filter(x => x.id !== id));
  return (
    <>
      <div className="space-y-1.5">
        <Label>Training Name <span className="text-rose-500">*</span></Label>
        <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder='e.g. "Advanced SQL for Analysts"' />
      </div>
      <div className="space-y-1.5">
        <Label>Training Details (optional)</Label>
        <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="What this training covers" />
      </div>
      <div className="space-y-1.5">
        <Label>Training Category <span className="text-rose-500">*</span></Label>
        <CategorySelect categories={categories} value={form.category_id} onChange={v => set("category_id", v)} />
      </div>
      <div className="space-y-1.5">
        <Label>Training Material Link {linkRequired ? <span className="text-rose-500">*</span> : <span className="text-muted-foreground font-normal">(can be added later)</span>}</Label>
        <Input type="url" value={form.training_link} onChange={e => set("training_link", e.target.value)} placeholder="https://..." />
        <p className="text-xs text-muted-foreground">{linkRequired ? "Mandatory — the reportee needs this before requesting approval." : "Required when this training is assigned to someone."}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Training Mode</Label>
          <Select value={form.mode} onValueChange={v => set("mode", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MODE_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Training Priority</Label>
          <Select value={form.priority} onValueChange={v => set("priority", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {form.mode === "face_to_face" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Trainer <span className="text-rose-500">*</span></Label>
            <Input value={form.trainer} onChange={e => set("trainer", e.target.value)} placeholder="Trainer name" />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Additional Reference Material (optional)</Label>
        <LinkListEditor links={form.resources} setLinks={fn => set("resources", typeof fn === "function" ? fn(form.resources) : fn)} addLabel="Add link" />
      </div>
      {showParts && (
        <div className="bg-muted/50 border rounded-xl p-4">
          <div className="text-[13px] font-semibold mb-1">Parts / Modules <span className="text-muted-foreground font-normal">(optional)</span></div>
          {partsLocked ? (
            <p className="text-xs text-muted-foreground">{partsLocked}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3.5">Break it into parts if needed — the reportee requests approval part by part.</p>
              <div className="space-y-2">
                {form.parts.map((p, i) => (
                  <div key={p.id} className="flex gap-2 items-start">
                    <PartDot n={i + 1} status="pending" />
                    <Input value={p.title} onChange={e => updPart(p.id, "title", e.target.value)} placeholder={`Part ${i + 1} name`} className="flex-1" />
                    <Input value={p.part_link} onChange={e => updPart(p.id, "part_link", e.target.value)} placeholder="Link (optional)" className="flex-1" />
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => rmPart(p.id)}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="border-dashed text-muted-foreground" onClick={addPart}><Plus className="h-3.5 w-3.5 mr-1" />Add Part</Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function DateFields({ expectedEnd, setExpectedEnd, dueDate, setDueDate }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label>Expected Training End Date <span className="text-rose-500">*</span></Label>
        <Input type="date" value={expectedEnd} onChange={e => setExpectedEnd(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Due Date (optional)</Label>
        <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
      </div>
    </div>
  );
}

function ReporteePicker({ reportees, memberIds, setMemberIds, onGoToSettings }) {
  const toggle = id => setMemberIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const active = reportees.filter(u => u.is_active);
  const allOn = active.length > 0 && active.every(u => memberIds.includes(u.id));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Reportees <span className="text-rose-500">*</span> {memberIds.length > 0 && <span className="text-muted-foreground font-normal">· {memberIds.length} selected</span>}</Label>
        {active.length > 1 && <button type="button" className="text-[12px] text-indigo-700 hover:underline" onClick={() => setMemberIds(allOn ? [] : active.map(u => u.id))}>{allOn ? "Clear all" : "Select all"}</button>}
      </div>
      {active.length === 0 ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] text-amber-800">
          No active reportees yet. <button onClick={onGoToSettings} className="underline font-semibold">Add one in Team & Settings</button> first.
        </div>
      ) : (
        <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
          {active.map(u => (
            <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted transition">
              <Checkbox checked={memberIds.includes(u.id)} onCheckedChange={() => toggle(u.id)} />
              <UAvatar name={u.full_name} color={u.color} className="h-7 w-7" />
              <div className="min-w-0"><div className="text-[13px] font-medium truncate">{u.full_name}</div><div className="text-[11px] text-muted-foreground truncate">{u.email}</div></div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ASSIGN MODAL (one training → one or more reportees) ───────────────────────
function AssignModal({ reportees, categories, catalog, currentFY, initialCatalogId, onSubmit, onClose, onGoToSettings }) {
  const initial = catalog.find(c => c.id === initialCatalogId);
  const [catalogId, setCatalogId] = useState(initial?.id || "");
  const [form, setForm] = useState(initial ? formFromTemplate(initial) : emptyTrainingForm());
  const [memberIds, setMemberIds] = useState([]);
  const [expectedEnd, setExpectedEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saveToCatalog, setSaveToCatalog] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pickCatalog = id => {
    setCatalogId(id === "__none__" ? "" : id);
    const c = catalog.find(x => x.id === id);
    setForm(c ? formFromTemplate(c) : emptyTrainingForm());
  };
  const ok = memberIds.length > 0 && trainingFormValid(form) && expectedEnd;

  const submit = async () => {
    if (!ok) return;
    setBusy(true); setErr("");
    try {
      await onSubmit({
        memberIds,
        payload: { ...trainingFormPayload(form), expected_end_date: expectedEnd, due_date: dueDate || null, fy: currentFY, status: "pending", catalog_id: catalogId || null },
        parts: formParts(form),
        saveToCatalog: !catalogId && saveToCatalog,
      });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <DialogTitle>Assign Training</DialogTitle>
          <DialogDescription className="flex items-center gap-2">Pick from the catalog or fill in a new one, then assign to one or more reportees. <FYBadge fy={currentFY} /></DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>From Training Catalog</Label>
          <Select value={catalogId || "__none__"} onValueChange={pickCatalog}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">+ New training (not in catalog)</SelectItem>
              {catalog.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <TrainingFields form={form} setForm={setForm} categories={categories} />
        <DateFields expectedEnd={expectedEnd} setExpectedEnd={setExpectedEnd} dueDate={dueDate} setDueDate={setDueDate} />
        <ReporteePicker reportees={reportees} memberIds={memberIds} setMemberIds={setMemberIds} onGoToSettings={onGoToSettings} />

        {!catalogId && (
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <Checkbox checked={saveToCatalog} onCheckedChange={v => setSaveToCatalog(!!v)} />
            Also save this training to the Training Catalog for future use
          </label>
        )}
        {err && <FormError>{err}</FormError>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok || busy} onClick={submit}>{busy ? "Assigning…" : memberIds.length > 1 ? `Assign to ${memberIds.length} reportees` : "Assign Training"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── BULK ASSIGN (many catalog trainings → many reportees) ─────────────────────
function BulkAssignModal({ reportees, catalog, currentFY, initialIds, onSubmit, onClose, onGoToSettings }) {
  const [itemIds, setItemIds] = useState(initialIds || []);
  const [links, setLinks] = useState({}); // catalog id → link, for selected items that have none yet
  const [memberIds, setMemberIds] = useState([]);
  const [expectedEnd, setExpectedEnd] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = id => setItemIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const shown = catalog.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const total = itemIds.length * memberIds.length;
  const needLink = catalog.filter(c => itemIds.includes(c.id) && !c.training_link);
  const ok = itemIds.length > 0 && memberIds.length > 0 && expectedEnd && needLink.every(c => (links[c.id] || "").trim());

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const items = catalog.filter(c => itemIds.includes(c.id)).map(c => c.training_link ? c : { ...c, training_link: links[c.id].trim() });
      await onSubmit({ items, memberIds, expectedEnd, dueDate: dueDate || null });
    }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <DialogTitle>Bulk Assign from Catalog</DialogTitle>
          <DialogDescription className="flex items-center gap-2">Pick several catalog trainings and assign all of them to the selected reportees in one go. <FYBadge fy={currentFY} /></DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Trainings <span className="text-rose-500">*</span> {itemIds.length > 0 && <span className="text-muted-foreground font-normal">· {itemIds.length} selected</span>}</Label>
          {catalog.length === 0 ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] text-amber-800">The Training Catalog is empty — add or import trainings there first.</div>
          ) : (
            <>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search catalog..." className="pl-9" />
              </div>
              <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                {shown.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted transition">
                    <Checkbox checked={itemIds.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.training_categories ? `${c.training_categories.group_name} · ${c.training_categories.name}` : "No category"} · {MODE_OPTIONS.find(m => m.value === c.mode)?.label} · <span className="capitalize">{c.priority}</span>{(c.parts || []).length ? ` · ${c.parts.length} parts` : ""}</div>
                    </div>
                  </label>
                ))}
                {shown.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No matches.</p>}
              </div>
            </>
          )}
        </div>

        {needLink.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
            <div className="text-[13px] font-semibold text-amber-800">Training material link needed <span className="text-rose-500">*</span></div>
            <p className="text-xs text-amber-800">These catalog trainings don't have a link yet — it's mandatory before assigning. It will also be saved to the catalog.</p>
            {needLink.map(c => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium w-44 shrink-0 truncate" title={c.name}>{c.name}</span>
                <Input type="url" value={links[c.id] || ""} onChange={e => setLinks(p => ({ ...p, [c.id]: e.target.value }))} placeholder="https://..." className="h-8" />
              </div>
            ))}
          </div>
        )}
        <DateFields expectedEnd={expectedEnd} setExpectedEnd={setExpectedEnd} dueDate={dueDate} setDueDate={setDueDate} />
        <ReporteePicker reportees={reportees} memberIds={memberIds} setMemberIds={setMemberIds} onGoToSettings={onGoToSettings} />
        {err && <FormError>{err}</FormError>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok || busy} onClick={submit}>{busy ? "Assigning…" : total ? `Create ${total} assignment${total > 1 ? "s" : ""}` : "Assign"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── EDIT TRAINING (manager) ───────────────────────────────────────────────────
function EditTrainingModal({ training, categories, onSubmit, onClose }) {
  const [form, setForm] = useState(formFromTemplate(training));
  const [expectedEnd, setExpectedEnd] = useState(training.expected_end_date || "");
  const [dueDate, setDueDate] = useState(training.due_date || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = trainingFormValid(form) && expectedEnd;
  const submit = async () => {
    setBusy(true); setErr("");
    try { await onSubmit(training.id, { ...trainingFormPayload(form), expected_end_date: expectedEnd, due_date: dueDate || null }); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <DialogTitle>Edit Training</DialogTitle>
          <DialogDescription>Changes apply to this reportee's assignment only.</DialogDescription>
        </DialogHeader>
        <TrainingFields form={form} setForm={setForm} categories={categories} showParts={hasParts(training)} partsLocked="Parts can't be changed once assigned — delete and re-assign the training to change its parts." />
        <DateFields expectedEnd={expectedEnd} setExpectedEnd={setExpectedEnd} dueDate={dueDate} setDueDate={setDueDate} />
        {err && <FormError>{err}</FormError>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok || busy} onClick={submit}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── TRAINING CATALOG ──────────────────────────────────────────────────────────
function CatalogItemModal({ item, categories, onSubmit, onClose }) {
  const [form, setForm] = useState(item ? formFromTemplate(item) : emptyTrainingForm());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true); setErr("");
    try { await onSubmit({ ...(item?.id ? { id: item.id } : {}), ...trainingFormPayload(form), parts: formParts(form) }); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Catalog Training" : "Add Training to Catalog"}</DialogTitle>
          <DialogDescription>Catalog trainings can be assigned to reportees any time, singly or in bulk.</DialogDescription>
        </DialogHeader>
        <TrainingFields form={form} setForm={setForm} categories={categories} linkRequired={false} />
        {err && <FormError>{err}</FormError>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!trainingFormValid(form, false) || busy} onClick={submit}>{busy ? "Saving…" : item ? "Save changes" : "Add to catalog"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── Bulk import from o2h's company training sheets ────────────────────────────
// Recognised automatically (any tab of an .xlsx/.csv):
//  • New Joiner 6 Months Training Plan — "Training Topic | Training details |
//    Module | Trainer | Method | Status…", grouped under section rows
//    (Human Resource, BA, Quality Assurance, Information Technology).
//  • TNI plan — "Trainings | Method | Source/Trainer | Duration | Priority |
//    Detail/Comment…", grouped under the o2h taxonomy (A Business › 1 Finance…).
//  • Any simple sheet with a "Training Name" column.
// Per-person columns (Status, Completion Date, Learnings, signatures) are
// ignored — the catalog holds reusable trainings, not someone's progress.
const norm = s => String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+]+/g, " ").trim();
const URL_RE = /https?:\/\/[^\s"'<>]+/i;

// Older category names that may still appear in sheets.
const CATEGORY_ALIASES = {
  "design": "Design, Research & Expertise", "research and expertise": "Design, Research & Expertise",
  "process and capability development and culture": "Process & Capability Development",
  "team and learning": "Culture, Team & Learning", "culture": "Culture, Team & Learning",
};
// Keyword guesses for sheets that don't carry the taxonomy (New Joiner plan).
const CATEGORY_HINTS = [
  [/financ|profit|cost|budget|account/, "Finance"],
  [/market|customer|client|competit/, "Market & Customer"],
  [/strateg|innovat|decision/, "Strategy & Innovation"],
  [/genai|\bai\b|technical|software|develop|coding|solution/, "Technical Execution Skills"],
  [/productiv|time manage/, "Productivity"],
  [/design|figma|wirefram|research|user stor|analysis/, "Design, Research & Expertise"],
  [/project|planning|tracking|reporting/, "Project Management & Reporting"],
  [/excel|process|polic|protection|data manage|quality|tool/, "Process & Capability Development"],
  [/induction|posh|ethic|conduct|value|leader|culture|team|communicat|delegat|learning/, "Culture, Team & Learning"],
];
const SECTION_HINTS = {
  "human resource": "Culture, Team & Learning", "hr": "Culture, Team & Learning",
  "quality assurance": "Process & Capability Development", "information technology": "Process & Capability Development",
  "ba": "Design, Research & Expertise", "business analysis": "Design, Research & Expertise",
};

function findCategory(categories, text, group) {
  const n = norm(text); if (!n) return null;
  const target = CATEGORY_ALIASES[n] ? norm(CATEGORY_ALIASES[n]) : n;
  return categories.find(c => norm(c.name) === target && (!group || c.group_name === group))
    || categories.find(c => norm(c.name) === target) || null;
}
function guessCategory(categories, name, section) {
  const n = norm(name);
  const hit = CATEGORY_HINTS.find(([re]) => re.test(n));
  const byName = hit && findCategory(categories, hit[1]);
  return byName || findCategory(categories, SECTION_HINTS[norm(section)] || "") || null;
}
function modeFromMethod(m) {
  const s = norm(m); if (!s) return null;
  if (/blend/.test(s)) return "blended";
  if (/1 2 1|large g|\bsg\b|classroom|face|workshop|in person|session/.test(s)) return "face_to_face";
  if (/otc|online|course|edx|coursera|udemy|webinar|youtube/.test(s)) return "online";
  if (/\bsad\b|self|\bred\b|read|book/.test(s)) return "self_paced";
  return null;
}
function priorityFrom(p) {
  const s = String(p || "").trim().toLowerCase();
  if (PRIORITY_OPTIONS.includes(s)) return s;
  return { "a+": "critical", "a": "high", "b+": "medium", "b": "low", "c": "low" }[s] || "medium";
}
// Detail/Comment cells hold either a link, a note, or both.
function splitDetail(cell) {
  const link = cell.link || (cell.text.match(URL_RE) || [])[0] || "";
  const text = cell.text.replace(URL_RE, "").trim();
  return { link, text };
}

// Sheet → rows of { text, link } (keeps hyperlinks, which sheet_to_json drops).
function sheetGrid(XLSX, ws) {
  if (!ws?.["!ref"]) return [];
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const grid = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push({ text: cell ? String(cell.w ?? cell.v ?? "").trim() : "", link: cell?.l?.Target || "" });
    }
    grid.push(row);
  }
  return grid;
}

function parseTrainingSheet(grid, categories) {
  const EMPTY = { text: "", link: "" };
  const at = (row, i) => (i >= 0 && row[i]) || EMPTY;
  const rowLink = row => row.map(c => c.link || (c.text.match(URL_RE) || [])[0] || "").find(Boolean) || "";
  const hIdx = grid.findIndex(row => row.some(c => ["training topic", "trainings", "training name"].includes(norm(c.text))));
  if (hIdx < 0) return null;
  const header = grid[hIdx].map(c => norm(c.text));
  const col = (...names) => header.findIndex(h => names.includes(h));
  const out = [];

  if (header.includes("training topic")) {
    // New Joiner plan
    const iTopic = col("training topic"), iDet = col("training details"), iTrainer = col("trainer"), iMethod = col("method");
    let section = "";
    for (const row of grid.slice(hIdx + 1)) {
      const topic = at(row, iTopic).text;
      if (!topic) continue;
      if (/^(total trainings|self sign)/i.test(topic)) break;
      if (![iDet, iTrainer, iMethod].some(i => at(row, i).text)) { section = topic; continue; }
      const mode = modeFromMethod(at(row, iMethod).text) || "face_to_face";
      out.push({
        name: topic, description: at(row, iDet).text || null, section,
        category_id: guessCategory(categories, topic, section)?.id || "",
        training_link: rowLink(row), mode,
        trainer: mode === "face_to_face" ? at(row, iTrainer).text || null : null, priority: "medium",
      });
    }
    return { format: "New Joiner Training Plan", rows: out };
  }

  if (header.includes("trainings")) {
    // TNI plan — category comes from the taxonomy cells left of "Trainings"
    const iName = col("trainings"), iMethod = col("method"), iSrc = col("source trainer", "source", "trainer"),
      iPri = col("priority"), iDet = col("detail comment", "details", "detail", "comment");
    const groups = [...new Set(categories.map(c => c.group_name))];
    let group = null, category = null;
    for (const row of grid.slice(hIdx + 1)) {
      if (row.some(c => /^b\s*particulars/.test(norm(c.text)))) break;
      for (const c of row.slice(0, iName)) {
        const g = groups.find(x => norm(x) === norm(c.text));
        if (g) { group = g; category = null; continue; }
        const cat = findCategory(categories, c.text, group);
        if (cat) { category = cat; group = cat.group_name; }
      }
      const name = at(row, iName).text;
      if (!name || /^\d+$/.test(name)) continue;
      const mode = modeFromMethod(at(row, iMethod).text) || "self_paced";
      const src = at(row, iSrc).text;
      const detail = splitDetail(at(row, iDet));
      out.push({
        name, description: detail.text || null, section: category ? `${category.group_name} › ${category.name}` : "",
        category_id: category?.id || guessCategory(categories, name, "")?.id || "",
        training_link: detail.link || rowLink(row), mode,
        trainer: mode === "face_to_face" ? (src && norm(src) !== "self" ? src : null) : null,
        priority: priorityFrom(at(row, iPri).text),
      });
    }
    return { format: "TNI Training Plan", rows: out };
  }

  // Simple sheet with a "Training Name" column
  const iName = col("training name"), iGroup = col("category group"), iCat = col("category", "training category"),
    iLink = col("training link", "link"), iMode = col("mode", "training mode", "method"), iTrainer = col("trainer"),
    iPri = col("priority", "training priority"), iDet = col("training details", "details", "description");
  for (const row of grid.slice(hIdx + 1)) {
    const name = at(row, iName).text; if (!name) continue;
    const m = norm(at(row, iMode).text).replace(/ /g, "_");
    const mode = MODE_OPTIONS.some(o => o.value === m) ? m : modeFromMethod(at(row, iMode).text) || "online";
    out.push({
      name, description: at(row, iDet).text || null, section: "",
      category_id: (findCategory(categories, at(row, iCat).text, categories.find(x => norm(x.group_name) === norm(at(row, iGroup).text))?.group_name) || guessCategory(categories, name, ""))?.id || "",
      training_link: at(row, iLink).link || at(row, iLink).text || rowLink(row), mode,
      trainer: mode === "face_to_face" ? at(row, iTrainer).text || null : null, priority: priorityFrom(at(row, iPri).text),
    });
  }
  return { format: "Training list", rows: out };
}

function ImportModal({ categories, catalog, onImport, onClose }) {
  const [rows, setRows] = useState(null); // [{ ...parsed, include }]
  const [formats, setFormats] = useState([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const existing = new Set(catalog.map(c => norm(c.name)));
  const checked = (rows || []).map((r, i, all) => {
    const errors = [];
    if (existing.has(norm(r.name))) errors.push("already in catalog");
    else if (all.slice(0, i).some(x => x.include && norm(x.name) === norm(r.name))) errors.push("duplicate in sheet");
    if (!r.category_id) errors.push("pick a category");
    if (r.mode === "face_to_face" && !r.trainer) errors.push("trainer missing");
    return { ...r, errors };
  });
  const ready = checked.filter(r => r.include && !r.errors.length);
  const setRow = (i, patch) => setRows(p => p.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const groups = [...new Set(categories.map(c => c.group_name))];

  const onFile = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(""); setFileName(file.name); setRows(null);
    try {
      const XLSX = window.XLSX; if (!XLSX) throw new Error("Excel library is still loading — try again in a moment.");
      if (/\.pdf$/i.test(file.name)) throw new Error("PDFs can't be read — open the sheet in Google Sheets / Excel and download it as .xlsx.");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = wb.SheetNames.map(n => parseTrainingSheet(sheetGrid(XLSX, wb.Sheets[n]), categories)).filter(p => p?.rows.length);
      if (!parsed.length) throw new Error("No trainings found. Use a New Joiner Training Plan or TNI sheet (or a sheet with a \"Training Name\" column).");
      setFormats([...new Set(parsed.map(p => p.format))]);
      const all = parsed.flatMap(p => p.rows);
      setRows(all.map(r => ({ ...r, include: !existing.has(norm(r.name)) })));
    } catch (ex) { setErr(ex.message); }
    e.target.value = "";
  };

  const doImport = async () => {
    setBusy(true); setErr("");
    try {
      await onImport(ready.map(r => ({
        name: r.name, description: r.description, category_id: r.category_id, training_link: r.training_link || null,
        mode: r.mode, trainer: r.trainer, priority: r.priority, parts: [],
      })));
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Trainings</DialogTitle>
          <DialogDescription>Upload a company training sheet — a <strong>New Joiner 6 Months Training Plan</strong> or a <strong>TNI plan</strong> — as it is. Trainings are read and added to the catalog.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-xl py-6 cursor-pointer hover:bg-muted transition text-[13px] text-muted-foreground">
          <Upload className="h-4 w-4" />{fileName || "Choose .xlsx / .csv file"}
          <input type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={onFile} />
        </label>
        <p className="text-xs text-muted-foreground -mt-2">From Google Sheets: File → Download → Microsoft Excel (.xlsx). All tabs are read.</p>

        {rows && (
          <div>
            <div className="text-[13px] font-semibold mb-1">Detected: {formats.join(" + ")} · {ready.length} of {rows.length} ready to import</div>
            <p className="text-xs text-muted-foreground mb-2">Check the categories (auto-matched), untick anything you don't want. Links can be added later — they're required only when assigning.</p>
            <div className="border rounded-lg divide-y max-h-[340px] overflow-y-auto">
              {checked.map((r, i) => (
                <div key={i} className={cn("flex items-start gap-2.5 px-3 py-2.5 text-[12.5px]", !r.include && "opacity-50", r.include && r.errors.length && "bg-rose-50/60")}>
                  <Checkbox checked={r.include} onCheckedChange={v => setRow(i, { include: !!v })} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                      {r.section && <span>{r.section}</span>}
                      <span>{MODE_OPTIONS.find(m => m.value === r.mode)?.label}{r.trainer ? ` · ${r.trainer}` : ""}</span>
                      <span className="capitalize">{r.priority}</span>
                      {r.training_link ? <span className="text-indigo-700 inline-flex items-center gap-0.5"><Link2 className="h-3 w-3" />link</span> : <span>no link</span>}
                    </div>
                    {r.include && r.errors.length > 0 && <div className="text-[11px] text-rose-600 mt-0.5">{r.errors.join(", ")}</div>}
                  </div>
                  <select value={r.category_id} onChange={e => setRow(i, { category_id: e.target.value })}
                    className={cn("h-8 rounded-md border bg-card px-2 text-[12px] max-w-[210px]", !r.category_id && "border-rose-300")}>
                    <option value="">— Category —</option>
                    {groups.map(g => (
                      <optgroup key={g} label={g}>
                        {categories.filter(c => c.group_name === g).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        {err && <FormError>{err}</FormError>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ready.length || busy} onClick={doImport}>{busy ? "Importing…" : `Import ${ready.length} training${ready.length === 1 ? "" : "s"}`}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

function CatalogPage({ catalog, categories, trainings, canAssign, onSave, onImport, onDelete, onAssign, onBulkAssign }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | item
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null); // catalog items pending delete
  const [err, setErr] = useState("");
  const usage = id => trainings.filter(t => t.catalog_id === id && t.status !== "discarded" && t.status !== "approved").length;
  const q = search.trim().toLowerCase();
  const shown = catalog.filter(c => !q || c.name.toLowerCase().includes(q) || `${c.training_categories?.group_name} ${c.training_categories?.name}`.toLowerCase().includes(q));
  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const allShown = shown.length > 0 && shown.every(c => selected.includes(c.id));
  const toggleAll = () => setSelected(allShown ? selected.filter(id => !shown.some(c => c.id === id)) : [...new Set([...selected, ...shown.map(c => c.id)])]);
  const delItems = confirmDel || [];
  const delActive = delItems.reduce((s, c) => s + usage(c.id), 0);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Training Catalog</h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">Keep trainings ready here, then assign them to reportees — one at a time or in bulk.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-1.5" />Bulk Import</Button>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4 mr-1.5" />Add Training</Button>
        </div>
      </div>

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or category..." className="pl-9" />
        </div>
        {selected.length > 0 && (
          <>
            {canAssign && <Button onClick={() => onBulkAssign(selected)}><Users className="h-4 w-4 mr-1.5" />Assign {selected.length} selected</Button>}
            <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setConfirmDel(catalog.filter(c => selected.includes(c.id)))}><Trash2 className="h-4 w-4 mr-1.5" />Delete {selected.length} selected</Button>
          </>
        )}
      </div>
      {shown.length > 0 && (
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground mb-2 px-1 cursor-pointer w-fit">
          <Checkbox checked={allShown} onCheckedChange={toggleAll} />Select all {q ? "matching" : ""} ({shown.length})
        </label>
      )}
      {err && <FormError className="mb-3">{err}</FormError>}

      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <div className="p-11 text-center text-sm text-muted-foreground">{catalog.length ? "No matches." : "The catalog is empty. Add a training or bulk-import an Excel sheet to get started."}</div>
        ) : shown.map((c, i) => {
          const used = usage(c.id);
          return (
            <div key={c.id} className={cn("flex items-center gap-3 px-5 py-3.5", i < shown.length - 1 && "border-b")}>
              <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{c.name}</span>
                  <span className="text-[11px] font-medium capitalize bg-muted text-muted-foreground rounded-full px-2 py-0.5">{c.priority}</span>
                  {(c.parts || []).length > 0 && <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{c.parts.length} parts</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                  <span>{c.training_categories ? `${c.training_categories.group_name} · ${c.training_categories.name}` : "No category"}</span>
                  <span>{MODE_OPTIONS.find(m => m.value === c.mode)?.label}{c.trainer ? ` · ${c.trainer}` : ""}</span>
                  {c.training_link
                    ? <a href={safeUrl(c.training_link)} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline inline-flex items-center gap-1"><Link2 className="h-3 w-3" />Material</a>
                    : <span className="text-amber-700">No link yet</span>}
                  <span className={cn(used && "text-indigo-700 font-medium")}>{used} active</span>
                </div>
              </div>
              {canAssign && <Button size="sm" variant="outline" onClick={() => onAssign(c.id)}>Assign</Button>}
              <Button size="icon" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-600" title="Delete from catalog" onClick={() => setConfirmDel([c])}><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </Card>
      <p className="text-xs text-muted-foreground mt-2">Deleting from the catalog doesn't remove trainings already assigned to people — remove those from the training's detail view.</p>

      {editing && <CatalogItemModal item={editing === "new" ? null : editing} categories={categories} onClose={() => setEditing(null)} onSubmit={async item => { await onSave(item); setEditing(null); }} />}
      {importOpen && <ImportModal categories={categories} catalog={catalog} onClose={() => setImportOpen(false)} onImport={async rows => { await onImport(rows); setImportOpen(false); }} />}
      <ConfirmDialog
        open={delItems.length > 0} danger
        title={delItems.length === 1 ? `Delete "${delItems[0].name}" from the catalog?` : `Delete ${delItems.length} trainings from the catalog?`}
        body={delActive
          ? `${delActive} active assignment(s) came from ${delItems.length === 1 ? "this training" : "these trainings"}. They stay with the reportees — only the catalog entry is removed.`
          : "People who already have these trainings keep them — only the catalog entry is removed."}
        confirmLabel={delItems.length === 1 ? "Delete" : `Delete ${delItems.length}`}
        onConfirm={async () => {
          const ids = delItems.map(c => c.id); setConfirmDel(null); setErr("");
          try { await onDelete(ids); setSelected(p => p.filter(id => !ids.includes(id))); } catch (e) { setErr(e.message); }
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

// ── REMINDERS ─────────────────────────────────────────────────────────────────
function Reminders({ reportees, trainings, settings, onSaveSettings, onMarkReminded }) {
  const [pd, setPd] = useState(settings.pendingReminderDays); const [od, setOd] = useState(settings.overdueReminderDays);
  const [savedS, setSavedS] = useState(false); const [copied, setCopied] = useState(false);
  const allPending = trainings.filter(t => isOpenStatus(getEffStatus(t)));
  const dueFor = allPending.filter(t => { const ov = isOverdue(t.due_date), thr = ov ? Number(settings.overdueReminderDays) || 3 : Number(settings.pendingReminderDays) || 7, sb = t.last_reminder_sent || (ov ? t.due_date : t.assigned_date); return daysSince(sb) >= thr; });
  const buildBody = list => {
    const g = list.reduce((acc, t) => { const u = reportees.find(x => x.id === t.assigned_to); if (!u) return acc; acc[u.id] = acc[u.id] || { user: u, items: [] }; acc[u.id].items.push(t); return acc; }, {});
    return "Hi team,\n\nThis is a reminder about your pending training(s):\n\n" +
      Object.values(g).map(({ user, items }) => `${user.full_name}:\n${items.map(t => { const { done, total } = getUnits(t); return `  • ${t.name}${hasParts(t) ? ` [${done}/${total} parts done]` : ""}${t.due_date ? ` — Due: ${fmtDate(t.due_date)}${isOverdue(t.due_date) ? " (OVERDUE)" : ""}` : ""}`; }).join("\n")}`).join("\n\n") +
      "\n\nPlease complete your pending trainings at the earliest and log your learnings on the Knowledge Hub.\n\nThanks,\nYour Manager";
  };
  const send = list => { const emails = [...new Set(list.map(t => reportees.find(u => u.id === t.assigned_to)?.email).filter(Boolean))].join(","); window.open(`mailto:${emails}?subject=${encodeURIComponent("Training Reminder — Action Required")}&body=${encodeURIComponent(buildBody(list))}`, "_self"); onMarkReminded(list.map(t => t.id)); };
  const copy = list => { navigator.clipboard.writeText(buildBody(list)); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const saveS = async () => { await onSaveSettings({ pendingReminderDays: Number(pd) || 1, overdueReminderDays: Number(od) || 1 }); setSavedS(true); setTimeout(() => setSavedS(false), 2500); };

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Reminders</h1>
        <p className="text-[12.5px] text-muted-foreground mt-1.5">Configure reminder frequency & send nudges</p>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-5 text-[13px] text-amber-800 leading-relaxed">
        <strong>How this works:</strong> This app can't send fully-automatic background emails. Each time you open this page, it shows who is due for a reminder. One click opens a pre-filled email for all of them.
      </div>

      <Card className="mb-5">
        <CardContent className="p-5">
          <SectionLabel>Reminder Frequency</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5"><Label>Pending — remind every (days)</Label><Input type="number" min={1} value={pd} onChange={e => setPd(e.target.value)} /><p className="text-xs text-muted-foreground">While training is not yet overdue.</p></div>
            <div className="space-y-1.5"><Label>Overdue — remind every (days)</Label><Input type="number" min={1} value={od} onChange={e => setOd(e.target.value)} /><p className="text-xs text-muted-foreground">More frequent once due date is crossed.</p></div>
          </div>
          <Button onClick={saveS} className={cn(savedS && "bg-emerald-600 hover:bg-emerald-600")}>{savedS ? "Saved!" : "Save Settings"}</Button>
        </CardContent>
      </Card>

      <Card className={cn("mb-4", dueFor.length ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50")}>
        <CardContent className="p-5">
          <div className={cn("flex items-center justify-between gap-2.5 flex-wrap", dueFor.length && "mb-3.5")}>
            <div className={cn("text-sm font-bold", dueFor.length ? "text-rose-700" : "text-emerald-700")}>{dueFor.length ? `${dueFor.length} reminder(s) due now` : "No reminders due right now"}</div>
            {dueFor.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(dueFor)}><Copy className="h-3.5 w-3.5 mr-1.5" />{copied ? "Copied!" : "Copy"}</Button>
                <Button size="sm" onClick={() => send(dueFor)}><Mail className="h-3.5 w-3.5 mr-1.5" />Send & Mark Reminded</Button>
              </div>
            )}
          </div>
          {dueFor.map(t => { const u = reportees.find(x => x.id === t.assigned_to); return (
            <div key={t.id} className={cn("flex items-center gap-2.5 text-[13px] py-2 border-t", dueFor.length ? "border-rose-200" : "border-emerald-200")}>
              <UAvatar name={u?.full_name || "?"} color={u?.color} className="h-6 w-6" />
              <span className="font-medium">{u?.full_name}</span><span className="text-muted-foreground">— {t.name}</span>
              {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-px rounded-full">{partsLabel(t)}</span>}
              <StatusBadge status={getEffStatus(t)} dueDate={t.due_date} />
            </div>
          ); })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <SectionLabel>All Pending Trainings</SectionLabel>
          {allPending.length === 0 ? <p className="text-center py-6 text-muted-foreground text-[13px]">Nothing pending — great job team!</p>
            : allPending.map(t => { const u = reportees.find(x => x.id === t.assigned_to), ov = isOverdue(t.due_date), thr = ov ? settings.overdueReminderDays : settings.pendingReminderDays, ni = Math.max(0, thr - daysSince(t.last_reminder_sent || (ov ? t.due_date : t.assigned_date))); return (
              <div key={t.id} className="flex items-center gap-2.5 text-[13px] py-2.5 border-b last:border-0">
                <UAvatar name={u?.full_name || "?"} color={u?.color} className="h-6 w-6" />
                <span className="font-medium">{u?.full_name}</span><span className="text-muted-foreground flex-1">{t.name}</span>
                {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-px rounded-full">{partsLabel(t)}</span>}
                <StatusBadge status={getEffStatus(t)} dueDate={t.due_date} />
                <span className={cn("text-[11.5px] min-w-[92px] text-right", ni === 0 ? "text-rose-600" : "text-muted-foreground")}>{ni === 0 ? "Reminder due" : `Next in ${ni}d`}</span>
              </div>
            ); })}
        </CardContent>
      </Card>
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
// Confirm step for the irreversible "Delete user".
function DeleteUserDialog({ user, onConfirm, onCancel }) {
  if (!user) return null;
  return (
    <ConfirmDialog open danger
      title={`Delete ${user.full_name}?`}
      body={`This permanently removes ${user.full_name} (${user.email}) and all of their trainings, notes and approval history. It can't be undone. To only block sign-in, use Deactivate instead.`}
      confirmLabel="Delete permanently"
      onConfirm={onConfirm} onCancel={onCancel} />
  );
}

// Result of an invite / setup-link send: either the email went out, or we show
// the link so it can be shared manually (e.g. when SMTP isn't configured yet).
function InviteResult({ result, onDismiss }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  const copy = () => { navigator.clipboard.writeText(result.invite_link); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <Card className={cn("mb-5", result.email_sent ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60")}>
      <CardContent className="p-5">
        {result.email_sent ? (
          <>
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 mb-1"><Mail className="h-4 w-4" />Email sent to {result.email}</div>
            <p className="text-[13px] text-emerald-800">They'll get a link to set their own password, then sign in with their email.</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-bold text-amber-800 mb-1"><AlertCircle className="h-4 w-4" />Account ready — but the email couldn't be sent</div>
            <p className="text-[13px] text-amber-800 mb-2">Share this one-time link with <strong>{result.email}</strong> (Teams / Outlook). It opens Skillgo and asks them to set a password.</p>
            <div className="bg-card border rounded-lg p-3 text-[12px] font-mono flex items-center justify-between gap-2">
              <span className="truncate">{result.invite_link}</span>
              <Button variant="outline" size="sm" onClick={copy}><Copy className="h-3.5 w-3.5 mr-1" />{copied ? "Copied!" : "Copy"}</Button>
            </div>
            {result.email_error && <p className="text-[11px] text-amber-700 mt-2">Email error: {result.email_error}</p>}
          </>
        )}
        <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>Dismiss</Button>
      </CardContent>
    </Card>
  );
}

function Settings({ reportees, trainings, currentFY, onAddReportee, onToggleActive, onSendLink, onDelete, onFinalizeYear, onRefreshReportees }) {
  const [toDelete, setToDelete] = useState(null);
  const [addForm, setAddForm] = useState(false);
  const [newU, setNewU] = useState({ full_name: "", email: "", color: COLORS[0] });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // { email, email_sent, invite_link? }
  const [busyId, setBusyId] = useState(null);
  const [choices, setChoices] = useState({});
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [err, setErr] = useState("");

  const addM = async () => {
    if (!newU.full_name.trim() || !newU.email.trim()) return;
    setCreating(true); setErr("");
    try {
      const res = await onAddReportee({ full_name: newU.full_name.trim(), email: newU.email.trim(), color: newU.color, role: "reportee" });
      setCreated(res); setNewU({ full_name: "", email: "", color: COLORS[0] }); setAddForm(false);
      await onRefreshReportees();
    } catch (e) { setErr(e.message); }
    setCreating(false);
  };
  const rowAction = async (id, fn) => {
    setBusyId(id); setErr("");
    try { const res = await fn(); if (res?.email) setCreated(res); } catch (e) { setErr(e.message); }
    setBusyId(null);
  };

  const yfPending = trainings.filter(t => t.fy === currentFY && isOpenStatus(getEffStatus(t)));
  const doFinalize = async () => { const d = yfPending.map(t => ({ id: t.id, action: choices[t.id] || "carry" })); setConfirmFinalize(false); await onFinalizeYear(d); };

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Team & Settings</h1>
        <p className="text-[12.5px] text-muted-foreground mt-1.5">Manage reportees and the financial year</p>
      </div>

      <InviteResult result={created} onDismiss={() => setCreated(null)} />
      <DeleteUserDialog user={toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { const u = toDelete; setToDelete(null); rowAction(u.id, () => onDelete(u)); }} />

      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel className="mb-0">Reportees</SectionLabel>
            <Button size="sm" onClick={() => setAddForm(!addForm)}><Plus className="h-3.5 w-3.5 mr-1" />Add Reportee</Button>
          </div>
          {addForm && (
            <div className="bg-muted/50 border rounded-xl p-4 mb-4">
              <div className="text-[13px] font-semibold mb-3">New Reportee</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                <Input value={newU.full_name} onChange={e => setNewU(p => ({ ...p, full_name: e.target.value }))} placeholder="Full name *" />
                <Input value={newU.email} onChange={e => setNewU(p => ({ ...p, email: e.target.value }))} placeholder="Email address *" type="email" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Color:</span>
                <div className="flex gap-1.5 flex-wrap">{COLORS.map(c => <button key={c} onClick={() => setNewU(p => ({ ...p, color: c }))} className={cn("h-[22px] w-[22px] rounded-full transition", newU.color === c ? "ring-2 ring-offset-2 ring-foreground" : "")} style={{ background: c, width: 22, height: 22 }} />)}</div>
              </div>
              <p className="text-xs text-muted-foreground mb-2.5">They'll get an email with a link to set their password.</p>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setAddForm(false)}>Cancel</Button><Button size="sm" disabled={!newU.full_name.trim() || !newU.email.trim() || creating} onClick={addM}>{creating ? "Creating…" : "Add & send invite"}</Button></div>
            </div>
          )}
          {err && <FormError className="mb-2">{err}</FormError>}
          <div className="space-y-3">
            {reportees.map(u => (
              <div key={u.id} className="flex items-center gap-3 flex-wrap">
                <UAvatar name={u.full_name} color={u.color} className="h-8 w-8" />
                <div className="flex-1 min-w-0"><div className="text-[13px] font-medium truncate">{u.full_name}</div><div className="text-[11px] text-muted-foreground truncate">{u.email}</div></div>
                {u.must_change_password && u.is_active && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700">Invite pending</span>}
                <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-md", u.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>{u.is_active ? "Active" : "Inactive"}</span>
                {u.is_active && <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => rowAction(u.id, () => onSendLink(u))}><Send className="h-3.5 w-3.5 mr-1" />Send setup link</Button>}
                <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => rowAction(u.id, () => onToggleActive(u))}>{u.is_active ? "Deactivate" : "Reactivate"}</Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-rose-600" title="Delete user" aria-label={`Delete ${u.full_name}`} disabled={busyId === u.id} onClick={() => setToDelete(u)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {reportees.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No reportees yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-6">
          <SectionLabel>Year-End Tools</SectionLabel>
          <div className="text-[13px] text-muted-foreground mb-4 flex items-center gap-2 flex-wrap">Current FY: <FYBadge fy={currentFY} /> — decide what to do with pending trainings before closing the year.</div>
          {yfPending.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-[13px] text-emerald-700 mb-3.5">No pending trainings in FY {currentFY}.</div>
          ) : (
            <div className="mb-3.5">{yfPending.map(t => { const u = reportees.find(x => x.id === t.assigned_to), { done, total } = getUnits(t); return (
              <div key={t.id} className="flex items-center gap-2.5 py-2.5 border-b last:border-0 text-[13px]">
                <UAvatar name={u?.full_name || "?"} color={u?.color} className="h-6 w-6" />
                <span className="flex-1">{u?.full_name} — {t.name}{hasParts(t) ? <span className="text-indigo-600 ml-1.5">({done}/{total} parts done)</span> : ""}</span>
                <Select value={choices[t.id] || "carry"} onValueChange={v => setChoices(p => ({ ...p, [t.id]: v }))}>
                  <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carry">↪ Carry to FY {nextFY(currentFY)}</SelectItem>
                    <SelectItem value="discard">Discard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ); })}</div>
          )}
          <Button onClick={() => setConfirmFinalize(true)} className="bg-emerald-600 hover:bg-emerald-700">Finalize FY {currentFY} → Start FY {nextFY(currentFY)}</Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmFinalize}
        title={`Finalize FY ${currentFY}?`}
        body={`Pending trainings will be carried over or discarded per your choices, and FY ${nextFY(currentFY)} will begin.`}
        confirmLabel="Finalize year"
        onConfirm={doFinalize}
        onCancel={() => setConfirmFinalize(false)}
      />
    </div>
  );
}

// ── OVERVIEW (admin / HR, read-only) ──────────────────────────────────────────
// Org-wide picture: who has how many trainings, their status, and how each
// manager is keeping up with approvals.
function statusCounts(ts) {
  const c = { total: 0, notStarted: 0, inProgress: 0, awaiting: 0, sentBack: 0, completed: 0, overdue: 0, doneU: 0, totalU: 0 };
  for (const t of ts) {
    const s = getEffStatus(t); if (s === "discarded") continue;
    c.total++;
    if (s === "pending") c.notStarted++;
    else if (s === "in_progress") c.inProgress++;
    else if (s === "submitted") c.awaiting++;
    else if (s === "sent_back") c.sentBack++;
    else if (s === "approved") c.completed++;
    if (isOpenStatus(s) && isOverdue(t.due_date)) c.overdue++;
    const u = getUnits(t); c.doneU += u.done; c.totalU += u.total;
  }
  c.pct = c.totalU ? Math.round(c.doneU / c.totalU * 100) : 0;
  return c;
}

function AdminOverview({ people, trainings, requests, onDetail, onExport, onRefresh, refreshing }) {
  const [fy, setFy] = useState(getFY());
  const [mgrF, setMgrF] = useState("all");
  const [member, setMember] = useState(null);
  const fyList = [...new Set([getFY(), ...trainings.map(t => t.fy)])].filter(Boolean).sort().reverse();
  const managers = people.filter(p => p.role === "reporting_manager");
  // Everyone who reports to someone — includes managers with their own senior.
  const reportees = people.filter(p => p.role !== "admin" && (p.role === "reportee" || p.manager_id) && (mgrF === "all" || p.manager_id === mgrF));
  const repIds = new Set(reportees.map(r => r.id));
  const fyT = trainings.filter(t => t.fy === fy && repIds.has(t.assigned_to));
  const fyIds = new Set(fyT.map(t => t.id));
  const fyReqs = requests.filter(r => fyIds.has(r.training_id));
  const all = statusCounts(fyT);
  const nameOf = id => people.find(p => p.id === id)?.full_name || "—";
  const pctTone = p => p >= 60 ? "text-emerald-600" : p >= 30 ? "text-amber-600" : "text-rose-600";

  const stats = [
    { label: "Employees", value: reportees.length, note: `${managers.length} managers`, Icon: Users },
    { label: "Trainings assigned", value: all.total, note: `${all.totalU} units`, Icon: Package },
    { label: "Completed", value: all.completed, note: `${all.pct}% of units`, Icon: Check },
    { label: "In progress", value: all.inProgress + all.sentBack, note: `${all.notStarted} not started`, Icon: CircleDot },
    { label: "Awaiting approval", value: fyReqs.filter(r => r.status === "pending").length, note: "with managers", Icon: Clock },
    { label: "Overdue", value: all.overdue, note: "past due date", Icon: AlertCircle, tone: all.overdue ? "alert" : undefined },
  ];

  const mgrRows = managers.filter(m => mgrF === "all" || m.id === mgrF).map(m => {
    const team = reportees.filter(r => r.manager_id === m.id);
    const ids = new Set(team.map(r => r.id));
    const ts = fyT.filter(t => ids.has(t.assigned_to));
    const tIds = new Set(ts.map(t => t.id));
    const reqs = fyReqs.filter(r => tIds.has(r.training_id));
    return {
      m, team: team.length, c: statusCounts(ts),
      approved: reqs.filter(r => r.status === "approved").length,
      sentBack: reqs.filter(r => r.status === "sent_back").length,
      pending: reqs.filter(r => r.status === "pending").length,
    };
  });

  const Th = ({ children, left }) => <th className={cn("px-3 h-10 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#858d87] whitespace-nowrap", left ? "text-left" : "text-center")}>{children}</th>;
  const Td = ({ children, className }) => <td className={cn("px-3 py-3 text-center", className)}>{children}</td>;
  const num = (v, cls) => v ? <span className={cls}>{v}</span> : <span className="text-muted-foreground/40">0</span>;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Training Overview</h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">Organisation-wide progress and approvals (view only)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Select value={mgrF} onValueChange={setMgrF}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All managers</SelectItem>
              {managers.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fy} onValueChange={setFy}>
            <SelectTrigger className="w-[136px]"><SelectValue /></SelectTrigger>
            <SelectContent>{fyList.map(f => <SelectItem key={f} value={f}>FY {f}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => onExport(reportees, fy)}><Download className="h-4 w-4 mr-1.5" />Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {stats.map(s => <StatCard key={s.label} label={s.label} value={s.value} note={s.note} Icon={s.Icon} tone={s.tone} />)}
      </div>

      <SectionLabel>Managers — FY {fy}</SectionLabel>
      <Card className="overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-table-head border-b">
              <Th left>Manager</Th><Th>Team</Th><Th>Assigned</Th><Th>Completed</Th><Th>Approvals given</Th><Th>Sent back</Th><Th>Awaiting approval</Th><Th>Overdue</Th><Th>Completion</Th>
            </tr></thead>
            <tbody>
              {mgrRows.map(({ m, team, c, approved, sentBack, pending }) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-[#f7f9f7] transition-colors">
                  <td className="px-3 py-3"><div className="flex items-center gap-2.5"><UAvatar name={m.full_name} color={m.color} className="h-7 w-7" /><span className="font-medium">{m.full_name}</span></div></td>
                  <Td>{team}</Td><Td>{c.total}</Td><Td>{num(c.completed, "text-emerald-600 font-semibold")}</Td>
                  <Td>{num(approved, "font-semibold")}</Td><Td>{num(sentBack, "text-orange-600")}</Td>
                  <Td>{num(pending, "text-violet-700 font-semibold")}</Td><Td>{num(c.overdue, "text-rose-600 font-semibold")}</Td>
                  <Td><span className={cn("font-bold", c.total ? pctTone(c.pct) : "text-muted-foreground/40")}>{c.total ? `${c.pct}%` : "—"}</span></Td>
                </tr>
              ))}
              {mgrRows.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-6">No managers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionLabel>Employees — FY {fy}</SectionLabel>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-table-head border-b">
              <Th left>Employee</Th><Th left>Manager</Th><Th>Assigned</Th><Th>Not started</Th><Th>In progress</Th><Th>Awaiting approval</Th><Th>Completed</Th><Th>Overdue</Th><Th>Progress</Th><Th></Th>
            </tr></thead>
            <tbody>
              {reportees.map(u => { const c = statusCounts(fyT.filter(t => t.assigned_to === u.id)); return (
                <tr key={u.id} className={cn("border-b last:border-0 hover:bg-[#f7f9f7] transition-colors", !u.is_active && "opacity-60")}>
                  <td className="px-3 py-3"><div className="flex items-center gap-2.5"><UAvatar name={u.full_name} color={u.color} className="h-7 w-7" /><div className="min-w-0"><div className="font-medium truncate">{u.full_name}{!u.is_active && <span className="text-muted-foreground font-normal"> (inactive)</span>}</div><div className="text-[11px] text-muted-foreground truncate">{u.email}</div></div></div></td>
                  <td className="px-3 py-3 text-[13px] text-muted-foreground whitespace-nowrap">{nameOf(u.manager_id)}</td>
                  <Td>{c.total}</Td><Td>{num(c.notStarted)}</Td><Td>{num(c.inProgress + c.sentBack, "text-indigo-700")}</Td>
                  <Td>{num(c.awaiting, "text-violet-700 font-semibold")}</Td><Td>{num(c.completed, "text-emerald-600 font-semibold")}</Td>
                  <Td>{num(c.overdue, "text-rose-600 font-semibold")}</Td>
                  <td className="px-3 py-3 min-w-[130px]">{c.total ? <div className="flex items-center gap-2"><Progress value={c.pct} className="h-1.5 flex-1" /><span className={cn("text-[12px] font-semibold w-9 text-right", pctTone(c.pct))}>{c.pct}%</span></div> : <span className="text-muted-foreground/40 text-[12px]">No trainings</span>}</td>
                  <Td>{c.total > 0 && <Button size="sm" variant="ghost" className="text-indigo-700" onClick={() => setMember(u)}>View <ChevronRight className="h-3.5 w-3.5 ml-0.5" /></Button>}</Td>
                </tr>
              ); })}
              {reportees.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground py-6">No employees yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <MemberTrainingsModal member={member} onClose={() => setMember(null)} fyFilter={fy}
        trainings={fyT.filter(t => member && t.assigned_to === member.id)} onDetail={onDetail} />
    </div>
  );
}

// ── USERS (admin / HR) ────────────────────────────────────────────────────────
function UserFormModal({ user, managers, onSubmit, onClose }) {
  const [f, setF] = useState({ full_name: user?.full_name || "", email: user?.email || "", role: user?.role || "reportee", manager_id: user?.manager_id || "", color: user?.color || COLORS[0] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const mgrOptions = managers.filter(m => m.id !== user?.id);
  const ok = f.full_name.trim() && f.email.trim() && (f.role !== "reportee" || f.manager_id);
  const submit = async () => {
    setBusy(true); setErr("");
    try { await onSubmit({ ...f, manager_id: f.role === "admin" ? null : f.manager_id || null }); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>{user ? user.email : "They'll get an email with a link to set their password."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5"><Label>Full name <span className="text-rose-500">*</span></Label><Input value={f.full_name} onChange={e => set("full_name", e.target.value)} /></div>
        {!user && <div className="space-y-1.5"><Label>Email <span className="text-rose-500">*</span></Label><Input type="email" value={f.email} onChange={e => set("email", e.target.value)} placeholder="name@o2h.com" /></div>}
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={f.role} onValueChange={v => set("role", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ROLE_LABELS).map(([r, l]) => <SelectItem key={r} value={r}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {f.role !== "admin" && (
          <div className="space-y-1.5">
            <Label>Reporting Manager {f.role === "reportee" && <span className="text-rose-500">*</span>}</Label>
            <Select value={f.manager_id || "__none__"} onValueChange={v => set("manager_id", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
              <SelectContent>
                {f.role !== "reportee" && <SelectItem value="__none__">— None —</SelectItem>}
                {mgrOptions.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {mgrOptions.length === 0 && <p className="text-xs text-amber-700">No managers yet — add a Reporting Manager first.</p>}
            {f.role === "reporting_manager" && <p className="text-xs text-muted-foreground">Set this if the manager also reports to someone — their senior can then assign and approve their trainings.</p>}
          </div>
        )}
        {err && <FormError>{err}</FormError>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok || busy} onClick={submit}>{busy ? "Saving…" : user ? "Save changes" : "Add & send invite"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

function UsersAdmin({ me, people, onCreate, onUpdate, onToggleActive, onSendLink, onDelete }) {
  const [toDelete, setToDelete] = useState(null);
  const [search, setSearch] = useState("");
  const [roleF, setRoleF] = useState("all");
  const [editing, setEditing] = useState(null); // null | "new" | profile
  const [result, setResult] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");
  const managers = people.filter(p => p.role === "reporting_manager");
  const nameOf = id => people.find(p => p.id === id)?.full_name;
  const q = search.trim().toLowerCase();
  const shown = people.filter(p => (roleF === "all" || p.role === roleF) && (!q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  const rowAction = async (id, fn) => {
    setBusyId(id); setErr("");
    try { const res = await fn(); if (res?.email) setResult(res); } catch (e) { setErr(e.message); }
    setBusyId(null);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-[23px] sm:text-[25px] font-bold tracking-[-0.025em] leading-tight text-foreground">Users</h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">Add managers and reportees, set reporting lines, and control access.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4 mr-1.5" />Add User</Button>
      </div>
      <InviteResult result={result} onDismiss={() => setResult(null)} />
      <DeleteUserDialog user={toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { const u = toDelete; setToDelete(null); rowAction(u.id, () => onDelete(u)); }} />
      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email..." className="pl-9" />
        </div>
        <Select value={roleF} onValueChange={setRoleF}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([r, l]) => <SelectItem key={r} value={r}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {err && <FormError className="mb-3">{err}</FormError>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-table-head border-b text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <th className="font-medium px-4 py-3">User</th>
                <th className="font-medium px-3 py-3">Role</th>
                <th className="font-medium px-3 py-3">Reporting Manager</th>
                <th className="font-medium px-3 py-3">Status</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-[#f7f9f7] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <UAvatar name={p.full_name} color={p.color} className="h-7 w-7" />
                      <div className="min-w-0"><div className="font-medium truncate">{p.full_name}{p.id === me.id && <span className="text-muted-foreground font-normal"> (you)</span>}</div><div className="text-[11px] text-muted-foreground truncate">{p.email}</div></div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[13px]">{ROLE_LABELS[p.role]}</td>
                  <td className="px-3 py-3 text-[13px] text-muted-foreground">{nameOf(p.manager_id) || "—"}</td>
                  <td className="px-3 py-3">
                    <span className={cn("text-[11px] font-semibold px-2 py-1 rounded-md", !p.is_active ? "bg-muted text-muted-foreground" : p.must_change_password ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                      {!p.is_active ? "Inactive" : p.must_change_password ? "Invite pending" : "Active"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5 justify-end">
                      <Button size="icon" variant="ghost" className="text-muted-foreground" title="Edit" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                      {p.is_active && p.id !== me.id && <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => rowAction(p.id, () => onSendLink(p))}><Send className="h-3.5 w-3.5 mr-1" />Setup link</Button>}
                      {p.id !== me.id && <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => rowAction(p.id, () => onToggleActive(p))}>{p.is_active ? "Deactivate" : "Reactivate"}</Button>}
                      {p.id !== me.id && <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-rose-600" title="Delete user" aria-label={`Delete ${p.full_name}`} disabled={busyId === p.id} onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <UserFormModal
          user={editing === "new" ? null : editing} managers={managers} onClose={() => setEditing(null)}
          onSubmit={async f => {
            if (editing === "new") setResult(await onCreate(f));
            else await onUpdate(editing.id, { full_name: f.full_name, role: f.role, manager_id: f.manager_id });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── EXPORT MODAL ──────────────────────────────────────────────────────────────
function ExportModal({ reportees, trainings, requests, fyList, currentFY, onClose }) {
  const [selFYs, setSelFYs] = useState([currentFY]); const [exporting, setExporting] = useState(false);
  const tog = fy => setSelFYs(p => p.includes(fy) ? p.filter(f => f !== fy) : [...p, fy]);

  const doExport = () => {
    setExporting(true);
    try {
      const XLSX = window.XLSX || (() => { throw new Error("XLSX not loaded"); })();
      const wb = XLSX.utils.book_new();

      const s1 = [
        ["Skillgo — Team Performance Report"],
        [`Generated: ${new Date().toLocaleDateString("en-IN")}`], [""],
        ["Member", ...selFYs.map(fy => `FY ${fy} Done/Total`), ...selFYs.map(fy => `FY ${fy} %`), "Overall Status"],
      ];
      reportees.forEach(u => {
        const row = [u.full_name];
        selFYs.forEach(fy => { const ut = trainings.filter(t => t.assigned_to === u.id && t.fy === fy); const tU = ut.reduce((s, t) => s + getUnits(t).total, 0); const dU = ut.reduce((s, t) => s + getUnits(t).done, 0); row.push(`${dU}/${tU}`); });
        selFYs.forEach(fy => { const ut = trainings.filter(t => t.assigned_to === u.id && t.fy === fy); const tU = ut.reduce((s, t) => s + getUnits(t).total, 0); const dU = ut.reduce((s, t) => s + getUnits(t).done, 0); row.push(tU ? `${Math.round(dU / tU * 100)}%` : "N/A"); });
        const fyT = trainings.filter(t => selFYs.includes(t.fy) && t.assigned_to === u.id && t.status !== "discarded");
        const ach = getAchievement(u, fyT);
        row.push(ach ? (ACHIEVEMENT[ach]?.emoji + " " + ACHIEVEMENT[ach]?.label) : "—");
        s1.push(row);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), "Team Summary");

      const s2 = [["Member", "Training", "FY", "Type", "Part", "Status", "Due Date", "Completed Date", "Notes Preview"]];
      trainings.filter(t => selFYs.includes(t.fy)).forEach(t => {
        const u = reportees.find(x => x.id === t.assigned_to);
        if (hasParts(t)) sortedParts(t).forEach((p, pi) => { const r = reqFor(requests, t.id, p.id); s2.push([u?.full_name || "", t.name, t.fy, "Multi-Part", `Part ${pi + 1}: ${p.title}`, p.status === "approved" ? "Completed" : p.status, t.due_date || "", p.completed_date || "", (r?.notes || "").substring(0, 100)]); });
        else { const s = getEffStatus(t); const r = reqFor(requests, t.id, null); s2.push([u?.full_name || "", t.name, t.fy, "Single", "—", s === "approved" ? "Completed" : s === "discarded" ? "Discarded" : isOverdue(t.due_date) ? "Overdue" : s, t.due_date || "", t.completed_date || "", (r?.notes || "").substring(0, 100)]); }
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), "Training Details");

      const s3 = [["Member", "Training", "FY", "Part", "Completed Date", "Key Learnings", "Outcome Links"]];
      trainings.filter(t => selFYs.includes(t.fy)).forEach(t => {
        const u = reportees.find(x => x.id === t.assigned_to);
        if (hasParts(t)) sortedParts(t).filter(p => p.status === "approved").forEach((p, pi) => { const r = reqFor(requests, t.id, p.id, "approved"); s3.push([u?.full_name || "", t.name, t.fy, `Part ${pi + 1}: ${p.title}`, p.completed_date || "", r?.notes || "", cleanLinks(r?.outcome_links).map(l => l.url).join(" | ")]); });
        else if (t.status === "approved") { const r = reqFor(requests, t.id, null, "approved"); s3.push([u?.full_name || "", t.name, t.fy, "", t.completed_date || "", r?.notes || "", cleanLinks(r?.outcome_links).map(l => l.url).join(" | ")]); }
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), "Learnings & Notes");

      XLSX.writeFile(wb, `Skillgo_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) { console.error("Export error:", e); }
    setExporting(false); onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="md">
        <DialogHeader>
          <DialogTitle>Export Management Report</DialogTitle>
          <DialogDescription>Download a multi-sheet Excel report for management review.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Select Financial Years to include <span className="text-rose-500">*</span></Label>
          <div className="space-y-2">
            {fyList.map(fy => (
              <label key={fy} className={cn("flex items-center gap-2.5 cursor-pointer px-3.5 py-2.5 rounded-lg border transition", selFYs.includes(fy) ? "bg-indigo-50 border-indigo-200" : "bg-table-head border-border")}>
                <Checkbox checked={selFYs.includes(fy)} onCheckedChange={() => tog(fy)} />
                <span className={cn("text-[13px] font-semibold", selFYs.includes(fy) ? "text-indigo-700" : "")}>FY {fy}</span>
                <span className="text-xs text-muted-foreground ml-auto">{trainings.filter(t => t.fy === fy).length} trainings</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-[13px] text-emerald-700">
          The Excel file will have 3 sheets:
          <div className="mt-1.5 space-y-0.5 text-xs">
            <div>• <strong>Team Summary</strong> — member-wise FY completion + achievements</div>
            <div>• <strong>Training Details</strong> — all trainings with status, dates & parts</div>
            <div>• <strong>Learnings & Notes</strong> — all completed notes & outcome links</div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={selFYs.length === 0 || exporting} onClick={doExport}><Download className="h-4 w-4 mr-1.5" />{exporting ? "Generating…" : "Download Excel"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginRole, setLoginRole] = useState(null); // role picked on the login screen, verified once the profile loads
  const [loginError, setLoginError] = useState("");
  const [recovery, setRecovery] = useState(false);  // arrived via a password-reset link
  // Invite / reset emails link to ?token_hash=…&type=… — verified on a button press.
  const [emailLink, setEmailLink] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const token_hash = q.get("token_hash"), type = q.get("type");
    return token_hash && ["invite", "recovery", "magiclink", "email", "signup"].includes(type) ? { token_hash, type } : null;
  });
  // Supabase sends people back with #error_code=… when a link is expired/used.
  const [linkError, setLinkError] = useState(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const code = h.get("error_code");
    if (!code) return "";
    return code === "otp_expired"
      ? "This link has expired or was already used. Ask your manager or HR to send you a new setup link."
      : (h.get("error_description") || "This link couldn't be used.").replace(/\+/g, " ");
  });
  useEffect(() => {
    if (linkError) window.history.replaceState(null, "", window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [reportees, setReportees] = useState([]);
  const [people, setPeople] = useState([]);         // every profile visible to this user (name lookups, admin list)
  const [catalog, setCatalog] = useState([]);
  const [categories, setCategories] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [managerSettings, setManagerSettings] = useState(DEFAULT_SETTINGS);
  const [currentFY, setCurrentFY] = useState(getFY());
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState("dashboard");
  const [requestTarget, setRequestT] = useState(null);
  const [addModal, setAdd] = useState(false);         // false | { catalogId? }
  const [bulkModal, setBulk] = useState(null);        // null | { ids }
  const [editTarget, setEditT] = useState(null);
  const [toast, setToast] = useState(null); // { tone, text }
  const [detailTarget, setDetailT] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [fyFilterD, setFyFilterD] = useState(getFY());
  const [fyFilterM, setFyFilterM] = useState(getFY());

  // One-time: XLSX loader + compat CSS (unchanged from the original build).
  useEffect(() => {
    if (!window.XLSX) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      document.head.appendChild(s);
    }
    if (!document.getElementById("tt-compat-css")) {
      const st = document.createElement("style");
      st.id = "tt-compat-css";
      st.textContent = `.text-\[8px\]{font-size:8px;line-height:1}
.text-\[10px\]{font-size:10px;line-height:1.3}
.text-\[10\.5px\]{font-size:10.5px;line-height:1.3}
.text-\[11px\]{font-size:11px;line-height:1.4}
.text-\[11\.5px\]{font-size:11.5px;line-height:1.4}
.text-\[12px\]{font-size:12px;line-height:1.4}
.text-\[12\.5px\]{font-size:12.5px;line-height:1.5}
.text-\[13px\]{font-size:13px;line-height:1.5}
.text-\[13\.5px\]{font-size:13.5px;line-height:1.5}
.text-\[14\.5px\]{font-size:14.5px;line-height:1.5}
.text-\[15px\]{font-size:15px;line-height:1.5}
.w-\[18px\]{width:18px}
.h-\[18px\]{height:18px}
.w-\[22px\]{width:22px}
.h-\[22px\]{height:22px}
.w-\[44px\]{width:44px}
.h-\[44px\]{height:44px}
.w-\[120px\]{width:120px}
.w-\[130px\]{width:130px}
.w-\[220px\]{width:220px}
.min-w-\[86px\]{min-width:86px}
.min-w-\[92px\]{min-width:92px}
.min-h-\[60px\]{min-height:60px}
.max-h-\[88vh\]{max-height:88vh}
.flex-\[2\]{flex:2 2 0%}
.flex-\[1\.4\]{flex:1.4 1.4 0%}
.tracking-\[0\.3em\]{letter-spacing:0.3em}
.brightness-\[0\.98\]:hover{filter:brightness(0.98)}
svg.lucide{display:block;flex-shrink:0}
.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
`;
      document.head.appendChild(st);
    }
  }, []);

  // Auth: pick up existing session, and react to sign-in/out/password-recovery.
  useEffect(() => {
    api.getSession().then(s => { setSession(s || null); setAuthLoading(false); });
    const unsub = api.onAuthChange((s, event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      // Only replace the session object when the user actually changes — token
      // refreshes shouldn't reload the profile and data.
      setSession(prev => (prev?.user?.id && prev.user.id === s?.user?.id ? prev : s || null));
    });
    return unsub;
  }, []);

  // Once signed in, load this user's profile and check the role they signed in as.
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (!sessionUserId) { setProfile(null); return; }
    api.getMyProfile().then(p => {
      if (!p) return;
      if (!p.is_active) {
        setLoginError("Your account has been deactivated. Please contact your manager or HR.");
        setLoginRole(null); api.signOut(); return;
      }
      // A manager who reports to someone may also sign in as a Reportee (lands on their own trainings).
      const asReportee = loginRole === "reportee" && p.role === "reporting_manager" && !!p.manager_id;
      if (loginRole && p.role !== loginRole && !asReportee) {
        setLoginError(`This account is registered as ${ROLE_LABELS[p.role]}, not ${ROLE_LABELS[loginRole]}. Please pick the right role.`);
        setLoginRole(null); api.signOut(); return;
      }
      setLoginRole(null); setLoginError("");
      setTab(p.role === "admin" ? "overview" : p.role === "reporting_manager" && !asReportee ? "dashboard" : "my-trainings");
      setProfile(p);
    }).catch(() => setProfile(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUserId]);

  const loadData = async () => {
    if (!profile) return;
    if (profile.role === "admin") {
      const [cats, ppl, cat, trs, reqs] = await Promise.all([api.listCategories(), api.listVisibleProfiles(), api.listCatalog(), api.listTrainings(), api.listAllRequests()]);
      setCategories(cats); setPeople(ppl); setCatalog(cat); setTrainings(trs); setRequests(reqs);
      return;
    }
    const [cats, trs, ppl] = await Promise.all([api.listCategories(), api.listTrainings(), api.listVisibleProfiles()]);
    setCategories(cats);
    setTrainings(trs);
    setPeople(ppl);
    const reqs = trs.length ? await api.listRequestsFor(trs.map(t => t.id)) : [];
    setRequests(reqs);

    if (profile.role === "reporting_manager") {
      const [rep, appr, st, cat] = await Promise.all([api.listMyReportees(), api.listPendingApprovals(), api.getSettings(), api.listCatalog()]);
      setCatalog(cat);
      setReportees(rep);
      setApprovals(appr);
      const fy = st?.current_fy || getFY();
      setManagerSettings({ pendingReminderDays: st?.pending_reminder_days ?? 7, overdueReminderDays: st?.overdue_reminder_days ?? 3 });
      setCurrentFY(fy); setFyFilterD(fy);
      if (!st) await api.upsertSettings({ pending_reminder_days: 7, overdue_reminder_days: 3, current_fy: fy });
    } else {
      const fys = [...new Set(trs.map(t => t.fy))].filter(Boolean).sort().reverse();
      const fy = fys[0] || getFY();
      setFyFilterM(fy);
    }
  };

  useEffect(() => {
    if (!profile) return;
    setDataLoading(true);
    loadData().finally(() => setDataLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const refresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const logout = async () => { await api.signOut(); setProfile(null); setRecovery(false); };

  const finishForcedPasswordChange = async (newPassword) => {
    await api.updateMyPassword(newPassword);
    if (profile.must_change_password) await api.clearMustChangePassword(profile.id);
    setRecovery(false);
    setProfile(p => ({ ...p, must_change_password: false }));
  };

  const requestApproval = async (trainingId, partId, notes, outcomeLinks) => {
    await api.submitForApproval(trainingId, partId, notes, outcomeLinks);
    setRequestT(null);
    await loadData();
  };

  const startTraining = async (id) => { await api.startTraining(id); await loadData(); };
  const updateProgress = async (id, pct) => { await api.updateProgress(id, pct); await loadData(); };

  const addTraining = async ({ memberIds, payload, parts, saveToCatalog }) => {
    let catalog_id = payload.catalog_id;
    if (saveToCatalog) {
      const { fy, status, expected_end_date, due_date, catalog_id: _, ...tpl } = payload;
      // Same name already in the catalog → just link to the existing entry.
      try { await api.saveCatalogItem({ ...tpl, parts }); } catch (e) { if (!/already exists/.test(e.message)) throw e; }
      catalog_id = (await api.listCatalog()).find(c => c.name.toLowerCase() === tpl.name.toLowerCase())?.id || null;
    }
    const ids = [];
    for (const assigned_to of memberIds) {
      ids.push((await api.createTraining({ ...payload, catalog_id, assigned_to }, parts)).id);
    }
    setAdd(false);
    await loadData();
    notifyAssignees(ids);
  };

  const bulkAssign = async ({ items, memberIds, expectedEnd, dueDate }) => {
    const ids = [];
    for (const c of items) {
      // Link entered during bulk assign → keep it on the catalog entry too.
      if (!catalog.find(x => x.id === c.id)?.training_link) await api.saveCatalogItem({ id: c.id, training_link: c.training_link });
      for (const assigned_to of memberIds) {
        ids.push((await api.createTraining({
          name: c.name, description: c.description || null, category_id: c.category_id, training_link: c.training_link, mode: c.mode,
          trainer: c.trainer, priority: c.priority, resources: c.resources || [],
          expected_end_date: expectedEnd, due_date: dueDate, fy: currentFY, status: "pending",
          catalog_id: c.id, assigned_to,
        }, (c.parts || []).map(p => ({ title: p.title, part_link: p.part_link || null })))).id);
      }
    }
    setBulk(null);
    await loadData();
    notifyAssignees(ids);
  };

  // Assignment is already saved; the email is best-effort and reported separately.
  const notifyAssignees = async (ids) => {
    if (!ids.length) return;
    try {
      const r = await api.notifyAssigned(ids);
      if (r.skipped) setToast({ tone: "warning", text: `Training assigned. No email sent — ${r.reason}.` });
      else if (r.failed?.length) setToast({ tone: "warning", text: `Training assigned. Email failed for ${r.failed.map(f => f.email).join(", ")}.` });
      else setToast({ tone: "success", text: `Training assigned — email sent to ${r.sent} reportee${r.sent === 1 ? "" : "s"}.` });
    } catch (e) {
      setToast({ tone: "warning", text: `Training assigned, but the email couldn't be sent (${e.message}).` });
    }
  };

  const editTraining = async (id, patch) => { await api.updateTraining(id, patch); setEditT(null); setDetailT(null); await loadData(); };
  const deleteTraining = async (t) => { await api.deleteTraining(t.id); setDetailT(null); await loadData(); };

  const saveCatalogItem = async (item) => { await api.saveCatalogItem(item); setCatalog(await api.listCatalog()); };
  const importCatalog = async (rows) => { await api.insertCatalogItems(rows); setCatalog(await api.listCatalog()); };
  const deleteCatalogItems = async (ids) => { await api.deleteCatalogItems(ids); setCatalog(await api.listCatalog()); };

  const approveOne = async (requestId, remarks) => { await api.approveRequest(requestId, remarks); await loadData(); };
  const sendBackOne = async (requestId, remarks) => { await api.sendBackRequest(requestId, remarks); await loadData(); };

  const markReminded = async ids => { await Promise.all(ids.map(id => api.markReminderSent(id))); await loadData(); };
  const saveReminderSettings = async patch => {
    setManagerSettings(patch);
    await api.upsertSettings({ pending_reminder_days: patch.pendingReminderDays, overdue_reminder_days: patch.overdueReminderDays, current_fy: currentFY });
  };

  const finalizeYear = async decisions => {
    const nfy = nextFY(currentFY);
    await api.finalizeYear(currentFY, nfy, decisions, trainings);
    await api.upsertSettings({ current_fy: nfy });
    setCurrentFY(nfy); setFyFilterD(nfy);
    await loadData();
  };

  const createUser = async (payload) => { const res = await api.provisionUser(payload); await loadData(); return res; };
  const updateUser = async (id, patch) => { await api.adminUpdateUser(id, patch); await loadData(); };
  const toggleUserActive = async (u) => { await api.setUserActive(u.id, !u.is_active); await loadData(); };
  const deleteUser = async (u) => { await api.deleteUser(u.id); await loadData(); setToast({ tone: "success", text: `${u.full_name} was deleted.` }); };
  const sendSetupLink = async (u) => { const res = await api.sendSetupLink(u.id); await loadData(); return res; };

  if (authLoading) return <LoadingScreen />;
  if (emailLink) return (
    <AcceptEmailLink type={emailLink.type}
      onAccept={async () => {
        await api.verifyEmailLink(emailLink.token_hash, emailLink.type);
        if (emailLink.type === "recovery") setRecovery(true);
        window.history.replaceState(null, "", window.location.pathname);
        setEmailLink(null);
      }}
      onCancel={() => { window.history.replaceState(null, "", window.location.pathname); setEmailLink(null); }} />
  );
  if (!session) return <LoginScreen onSignInAs={r => { setLoginRole(r); if (r) { setLoginError(""); setLinkError(""); } }} roleError={loginError} notice={linkError} />;
  if (!profile) return <LoadingScreen label="Loading your profile…" />;
  if (recovery || profile.must_change_password) return <ForcePasswordChange recovery={recovery && !profile.must_change_password} onDone={finishForcedPasswordChange} onCancel={logout} />;
  if (dataLoading) return <LoadingScreen />;

  const isAdmin = profile.role === "admin";
  if (isAdmin) {
    return (
      <>
        <AppShell renderSidebar={close => <Sidebar profile={profile} tab={tab} setTab={t => { setTab(t); close(); }} onLogout={logout} myDone={0} myTotal={0} trainings={[]} currentFY={currentFY} pendingApprovalsCount={0} />}>
          {tab === "overview" && <AdminOverview people={people} trainings={trainings} requests={requests} onRefresh={refresh} refreshing={refreshing}
            onDetail={(t, p) => setDetailT({ training: t, part: p })} onExport={(reps, fy) => setExportOpen({ reportees: reps, fy })} />}
          {tab === "users" && <UsersAdmin me={profile} people={people} onCreate={createUser} onUpdate={updateUser} onToggleActive={toggleUserActive} onSendLink={sendSetupLink} onDelete={deleteUser} />}
          {tab === "catalog" && <CatalogPage catalog={catalog} categories={categories} trainings={trainings} canAssign={false} onSave={saveCatalogItem} onImport={importCatalog} onDelete={deleteCatalogItems} />}
        </AppShell>
        {detailTarget && <DetailModal training={detailTarget.training} part={detailTarget.part} reportees={people} requests={requests} onClose={() => setDetailT(null)} />}
        <Toast toast={toast} onClose={() => setToast(null)} />
        {exportOpen && <ExportModal reportees={exportOpen.reportees} trainings={trainings.filter(t => exportOpen.reportees.some(r => r.id === t.assigned_to))} requests={requests}
          fyList={[...new Set([getFY(), ...trainings.map(t => t.fy)])].filter(Boolean).sort().reverse()} currentFY={exportOpen.fy} onClose={() => setExportOpen(false)} />}
      </>
    );
  }

  const isManager = profile.role === "reporting_manager";
  // Only the user's own assignments — `trainings` also holds their team's and
  // (via Knowledge Hub visibility) teammates' approved trainings.
  const myT = trainings.filter(t => t.assigned_to === profile.id);
  const hasOwnTrainings = !isManager || !!profile.manager_id || myT.length > 0;
  // A manager's team view: direct reportees' trainings only.
  const teamIds = new Set(reportees.map(r => r.id));
  const teamT = isManager ? trainings.filter(t => teamIds.has(t.assigned_to)) : [];
  const myAFY = myT.filter(t => t.fy === fyFilterM && t.status !== "discarded");
  const myDone = myAFY.reduce((s, t) => s + getUnits(t).done, 0);
  const myTotal = myAFY.reduce((s, t) => s + getUnits(t).total, 0);
  const allFYs = [...new Set([...(isManager ? [currentFY] : []), ...trainings.map(t => t.fy)])].filter(Boolean).sort().reverse();

  return (
    <>
      <AppShell renderSidebar={close => <Sidebar profile={profile} tab={tab} setTab={t => { setTab(t); close(); }} onLogout={logout} myDone={myDone} myTotal={myTotal} trainings={teamT} currentFY={currentFY} pendingApprovalsCount={approvals.length} showMyTrainings={isManager && hasOwnTrainings} />}>
        {tab === "dashboard" && isManager && <Dashboard reportees={reportees} trainings={teamT} onAdd={() => setAdd({})} onBulk={() => setBulk({ ids: [] })} onRefresh={refresh} refreshing={refreshing} fyList={allFYs} fyFilter={fyFilterD} setFyFilter={setFyFilterD} onExport={() => setExportOpen(true)} onDetail={(t, p) => setDetailT({ training: t, part: p })} />}
        {tab === "approvals" && isManager && <ApprovalsPanel approvals={approvals} onApprove={approveOne} onSendBack={sendBackOne} onRefresh={refresh} refreshing={refreshing} />}
        {tab === "catalog" && isManager && <CatalogPage catalog={catalog} categories={categories} trainings={teamT} canAssign onSave={saveCatalogItem} onImport={importCatalog} onDelete={deleteCatalogItems} onAssign={id => setAdd({ catalogId: id })} onBulkAssign={ids => setBulk({ ids })} />}
        {tab === "my-trainings" && hasOwnTrainings && <MyTrainings trainings={myT} requests={requests} onRequestApproval={(t, p) => setRequestT({ training: t, part: p })} onDetail={(t, p) => setDetailT({ training: t, part: p })} onStart={startTraining} onProgress={updateProgress} fyList={allFYs.length ? allFYs : [getFY()]} fyFilter={fyFilterM} setFyFilter={setFyFilterM} />}
        {tab === "knowledge-hub" && <KnowledgeHub trainings={trainings} reportees={people} requests={requests} onDetail={(t, p) => setDetailT({ training: t, part: p })} />}
        {tab === "reminders" && isManager && <Reminders reportees={reportees} trainings={teamT} settings={managerSettings} onSaveSettings={saveReminderSettings} onMarkReminded={markReminded} />}
        {tab === "settings" && isManager && <Settings reportees={reportees} trainings={teamT} currentFY={currentFY} onAddReportee={createUser} onToggleActive={toggleUserActive} onSendLink={sendSetupLink} onDelete={deleteUser} onFinalizeYear={finalizeYear} onRefreshReportees={refresh} />}
      </AppShell>
      {detailTarget && <DetailModal training={detailTarget.training} part={detailTarget.part} reportees={people} requests={requests} onClose={() => setDetailT(null)}
        onEdit={isManager && detailTarget.training.assigned_to !== profile.id ? t => setEditT(t) : null}
        onDelete={isManager && detailTarget.training.assigned_to !== profile.id ? deleteTraining : null} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
      {editTarget && <EditTrainingModal training={editTarget} categories={categories} onSubmit={editTraining} onClose={() => setEditT(null)} />}
      {requestTarget && <ApprovalRequestModal training={requestTarget.training} part={requestTarget.part} requests={requests} onSubmit={requestApproval} onClose={() => setRequestT(null)} />}
      {addModal && <AssignModal reportees={reportees} categories={categories} catalog={catalog} currentFY={currentFY} initialCatalogId={addModal.catalogId} onSubmit={addTraining} onClose={() => setAdd(false)} onGoToSettings={() => { setAdd(false); setTab("settings"); }} />}
      {bulkModal && <BulkAssignModal reportees={reportees} catalog={catalog} currentFY={currentFY} initialIds={bulkModal.ids} onSubmit={bulkAssign} onClose={() => setBulk(null)} onGoToSettings={() => { setBulk(null); setTab("settings"); }} />}
      {exportOpen && <ExportModal reportees={reportees} trainings={teamT} requests={requests} fyList={allFYs} currentFY={currentFY} onClose={() => setExportOpen(false)} />}
    </>
  );
}
