import { useState, useEffect } from "react";
import {
  LayoutDashboard, Lightbulb, Library, Bell, Settings as SettingsIcon,
  BookOpen, LogOut, Plus, RefreshCw, Download, Search, Link2, X,
  ChevronDown, ChevronUp, ChevronRight, Check, CircleDot, Circle, Clock, AlertCircle,
  Target, Users, Package, Trophy, Pencil, Trash2, GraduationCap, ExternalLink,
  Mail, Copy, Sparkles, ShieldCheck, CalendarDays,
} from "lucide-react";
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

// Local classNames helper (shadcn's @/lib/utils isn't available in this environment)
const cn = (...args) => args.flat(Infinity).filter(Boolean).join(" ");

// ── Domain constants ──────────────────────────────────────────────────────────
const COLORS = ["#4f46e5","#0891b2","#0f9d6b","#d97706","#e0455e","#2563eb","#7c3aed","#0f766e","#db2777","#475569"];
const CATALOG_SEED = [
  "Agile & Scrum Fundamentals","Business Analysis Techniques",
  "Data Analysis with Excel","JIRA & Project Management",
  "Stakeholder Communication","SQL for Business Analysts",
  "Power BI Dashboards","Risk Management Basics",
  "Requirements Elicitation","Process Mapping & BPM",
  "UX Research Methods","Presentation Skills",
];
const DEFAULT_SUPERVISOR = { id:"u0", name:"Supervisor", role:"supervisor", email:"", color:"#4f46e5", pin:"0000", pinSet:true };
const DEFAULT_SETTINGS   = { pendingReminderDays:7, overdueReminderDays:3 };

const ACHIEVEMENT = {
  star:        { emoji:"🌟", label:"Star Performer",  cls:"bg-amber-100 text-amber-700 border-amber-200" },
  "on-track":  { emoji:"✅", label:"On Track",        cls:"bg-emerald-100 text-emerald-700 border-emerald-200" },
  progressing: { emoji:"📈", label:"In Progress",     cls:"bg-indigo-100 text-indigo-700 border-indigo-200" },
  behind:      { emoji:"⚠️", label:"Needs Attention", cls:"bg-orange-100 text-orange-700 border-orange-200" },
};

// ── Storage (SAFE) ────────────────────────────────────────────────────────────
// Bug in previous build: a schema-version gate wiped everything whenever the
// version key failed to read, so every refresh looked like a "first run".
// Fix: never wipe on read. Only *migrate* old shapes forward, and keep an
// in-memory mirror so a flaky storage backend can't blank the UI mid-session.
const mem = {};
const S = {
  get: async k => {
    try { const r = await window.storage.get(k, true); if (r) { const v = JSON.parse(r.value); mem[k]=v; return v; } }
    catch (e) { /* fall through to mirror */ }
    return k in mem ? mem[k] : null;
  },
  set: async (k, v) => {
    mem[k] = v;
    try { await window.storage.set(k, JSON.stringify(v), true); }
    catch (e) { console.error("storage.set failed, kept in memory:", e); }
  },
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
const uid       = p => `${p}${Date.now()}${Math.random().toString(36).slice(2,6)}`;

function getFY(ds) { const d=ds?new Date(ds+"T00:00:00"):new Date(),y=d.getFullYear(),m=d.getMonth()+1; return m>=4?`${y}-${String(y+1).slice(-2)}`:`${y-1}-${String(y).slice(-2)}`; }
function nextFY(fy) { const y=parseInt(fy.split("-")[0]); return `${y+1}-${String(y+2).slice(-2)}`; }

// Catalog normalization → {id,name,resources:[],parts:[{id,title,resources:[]}]}
const normPart = p => typeof p==="string"
  ? {id:uid("cp"),title:p,resources:[]}
  : {id:p.id||uid("cp"),title:p.title||"",resources:cleanLinks(p.resources)};
const normCatalog = catalog => (catalog||[]).map(item => {
  if (typeof item==="string") return {id:uid("c"),name:item,resources:[],parts:[]};
  return {
    id:item.id||uid("c"),
    name:item.name||"",
    resources:cleanLinks(item.resources),
    parts:(item.parts||item.defaultParts||[]).filter(p=>typeof p==="string"?p.trim():p&&p.title!==undefined).map(normPart),
  };
});
const mkDefaultCatalog = () => CATALOG_SEED.map(name=>({id:uid("c"),name,resources:[],parts:[]}));

// Training-instance helpers
const hasParts     = t => t.parts && t.parts.length > 0;
const getEffStatus = t => {
  if (!hasParts(t)) return t.status||"pending";
  const done = t.parts.filter(p=>p.status==="completed").length;
  if (done===0) return "pending";
  if (done===t.parts.length) return "completed";
  return "in-progress";
};
const getUnits = t => {
  if (!hasParts(t)) return {done:t.status==="completed"?1:0, total:1};
  const done=t.parts.filter(p=>p.status==="completed").length;
  return {done,total:t.parts.length};
};
const partsLabel = t => { if(!hasParts(t)) return null; const {done,total}=getUnits(t); return `${done}/${total} Parts`; };

const getAchievement = (user, fyTrainings) => {
  const ut = fyTrainings.filter(t=>t.userId===user.id && getEffStatus(t)!=="discarded");
  if (!ut.length) return null;
  const {done,total} = ut.reduce((a,t)=>{const u=getUnits(t);return{done:a.done+u.done,total:a.total+u.total}},{done:0,total:0});
  const pct = total ? done/total : 0;
  const hasOD = ut.some(t=>{const s=getEffStatus(t);return(s==="pending"||s==="in-progress")&&isOverdue(t.dueDate);});
  if (pct===1) return "star";
  if (pct>=0.7 && !hasOD) return "on-track";
  if (hasOD) return "behind";
  return "progressing";
};

// ── Small presentational atoms ────────────────────────────────────────────────
function UAvatar({ name, color, className }) {
  return (
    <Avatar className={cn("shrink-0", className)}>
      <AvatarFallback style={{ background: color || "#4f46e5" }} className="text-white font-semibold text-xs">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function StatusBadge({ status, dueDate }) {
  if (status === "completed")   return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1 font-medium"><Check className="h-3 w-3" />Completed</Badge>;
  if (status === "in-progress") return <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 gap-1 font-medium"><CircleDot className="h-3 w-3" />In Progress</Badge>;
  if (status === "discarded")   return <Badge variant="outline" className="text-muted-foreground gap-1 font-medium">Discarded</Badge>;
  if (dueDate && isOverdue(dueDate)) return <Badge className="bg-rose-100 text-rose-700 border-rose-200 gap-1 font-medium"><AlertCircle className="h-3 w-3" />Overdue</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1 font-medium"><Circle className="h-3 w-3" />Pending</Badge>;
}

function AchBadge({ level }) {
  const a = ACHIEVEMENT[level]; if (!a) return null;
  return <Badge variant="outline" className={cn("font-medium", a.cls)}>{a.emoji} {a.label}</Badge>;
}

function FYBadge({ fy }) {
  return <Badge variant="outline" className="text-muted-foreground font-medium">FY {fy}</Badge>;
}

function PartDot({ n, status }) {
  const done = status === "completed";
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
  return <h2 className={cn("text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3", className)}>{children}</h2>;
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
      <div style={{ overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
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
          <Button className={cn("flex-1", danger && "bg-rose-600 hover:bg-rose-700")} onClick={onConfirm}>{confirmLabel}</Button>
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

// ── Catalog Part Editor (parts WITH per-part links) ───────────────────────────
function CatalogPartEditor({ parts, setParts }) {
  const [openId, setOpenId] = useState(null);
  const add = () => { const id = uid("cp"); setParts(p => [...p, { id, title: "", resources: [] }]); setOpenId(id); };
  const rm = id => setParts(p => p.filter(x => x.id !== id));
  const upd = (id, f, v) => setParts(p => p.map(x => x.id === id ? { ...x, [f]: v } : x));
  return (
    <div className="space-y-2.5">
      {parts.map((pt, i) => {
        const open = openId === pt.id; const nlinks = cleanLinks(pt.resources).length;
        return (
          <div key={pt.id} className={cn("rounded-xl border bg-card overflow-hidden", open ? "border-indigo-300 bg-indigo-50/30" : "border-border")}>
            <div className="flex items-center gap-2.5 p-2.5">
              <PartDot n={i + 1} status="pending" />
              <Input value={pt.title} onChange={e => upd(pt.id, "title", e.target.value)} placeholder={`Part ${i + 1} name (e.g. "Module 1: Introduction")`} className="border-0 shadow-none focus-visible:ring-0 px-1 bg-transparent h-8" />
              {nlinks > 0 && <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 rounded-md px-2 py-0.5 shrink-0 inline-flex items-center gap-1"><Link2 className="h-3 w-3" />{nlinks}</span>}
              <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground h-8" onClick={() => setOpenId(open ? null : pt.id)}>
                {open ? <ChevronUp className="h-4 w-4" /> : <><Plus className="h-3 w-3 mr-1" />links</>}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-rose-400 h-8 w-8" onClick={() => rm(pt.id)}><X className="h-4 w-4" /></Button>
            </div>
            {open && (
              <div className="px-3 pb-3 pt-1 pl-12 border-t">
                <p className="text-[11px] text-muted-foreground my-2">Reference material for this part only</p>
                <LinkListEditor
                  links={pt.resources || []}
                  setLinks={fn => upd(pt.id, "resources", typeof fn === "function" ? fn(pt.resources || []) : fn)}
                  addLabel="Add part link" titleP="e.g. 'Module video'"
                />
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="border-dashed text-muted-foreground" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1" />Add Part
      </Button>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin, onUpdateUser }) {
  const [userId, setUserId] = useState(""); const [stage, setStage] = useState("select");
  const [pin, setPin] = useState(""); const [email, setEmail] = useState(""); const [np, setNp] = useState(""); const [cp, setCp] = useState(""); const [err, setErr] = useState("");
  const user = users.find(u => u.id === userId);
  const sel = id => { setUserId(id); setErr(""); setPin(""); setEmail(""); setNp(""); setCp(""); const u = users.find(x => x.id === id); setStage(u?.pinSet ? "pin" : id ? "setup-email" : "select"); };
  const doPin = () => { if ((user.pin || "") !== pin) { setErr("Incorrect PIN. Please try again."); setPin(""); return; } onLogin(user); };
  const doEmail = () => { if (!user.email) { setErr("No email on file. Contact your supervisor."); return; } if (email.trim().toLowerCase() !== user.email.trim().toLowerCase()) { setErr("Email does not match records. Contact your supervisor."); return; } setErr(""); setStage("setup-pin"); };
  const doPin2 = () => { if (np.length < 4) { setErr("PIN must be at least 4 digits."); return; } if (np !== cp) { setErr("PINs do not match."); return; } const u = { ...user, pin: np, pinSet: true }; onUpdateUser(u); onLogin(u); };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50">
      <Card className="w-full max-w-sm shadow-xl border-border/60">
        <CardContent className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-[44px] h-[44px] shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm">
              <Target className="w-[22px] h-[22px] text-white" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">TrainTrack</div>
              <div className="text-xs text-muted-foreground">Team learning, made accountable.</div>
            </div>
          </div>

          <div className="space-y-1.5 mb-4">
            <Label>Select your profile <span className="text-rose-500">*</span></Label>
            <Select value={userId} onValueChange={sel}>
              <SelectTrigger><SelectValue placeholder="— Choose —" /></SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}{u.role === "supervisor" ? " 👑" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {stage === "pin" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>PIN <span className="text-rose-500">*</span></Label>
                <Input type="password" maxLength={8} value={pin} onChange={e => { setPin(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && doPin()} placeholder="Enter your PIN" className="tracking-[0.3em]" />
              </div>
              {err && <p className="text-sm text-rose-600">⚠ {err}</p>}
              <Button className="w-full" disabled={!pin} onClick={doPin}>Continue →</Button>
              <p className="text-center text-[11px] text-muted-foreground">Forgot your PIN? Ask your supervisor to reset it.</p>
            </div>
          )}
          {stage === "setup-email" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 text-[12.5px] text-indigo-700">👋 First time here? Verify your email to set up a personal PIN.</div>
              <div className="space-y-1.5">
                <Label>Your registered email <span className="text-rose-500">*</span></Label>
                <Input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && doEmail()} placeholder="name@company.com" />
              </div>
              {err && <p className="text-sm text-rose-600">⚠ {err}</p>}
              <Button className="w-full" disabled={!email} onClick={doEmail}>Verify →</Button>
            </div>
          )}
          {stage === "setup-pin" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[12.5px] text-emerald-700">✅ Email verified! Create a personal PIN — only you will know it.</div>
              <div className="space-y-1.5">
                <Label>Create PIN (min 4 digits) <span className="text-rose-500">*</span></Label>
                <Input type="password" maxLength={8} value={np} onChange={e => { setNp(e.target.value); setErr(""); }} placeholder="e.g. 4821" className="tracking-[0.3em]" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm PIN <span className="text-rose-500">*</span></Label>
                <Input type="password" maxLength={8} value={cp} onChange={e => { setCp(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && doPin2()} placeholder="Re-enter PIN" className="tracking-[0.3em]" />
              </div>
              {err && <p className="text-sm text-rose-600">⚠ {err}</p>}
              <Button className="w-full" disabled={!np || !cp} onClick={doPin2}>Set PIN & Continue →</Button>
            </div>
          )}
          {stage === "select" && (
            <p className="text-center text-[11px] text-muted-foreground leading-relaxed mt-1">Select your profile to continue.<br />First-time users verify email to set a personal PIN.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({ user, tab, setTab, onLogout, myDone, myTotal, trainings, currentFY }) {
  const sup = user.role === "supervisor";
  const overdue = trainings.filter(t => { const s = getEffStatus(t); return (s === "pending" || s === "in-progress") && isOverdue(t.dueDate); }).length;
  const nav = sup ? [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "knowledge-hub", icon: Lightbulb, label: "Knowledge Hub" },
    { id: "catalog", icon: Library, label: "Training Catalog" },
    { id: "reminders", icon: Bell, label: "Reminders", badge: overdue || null },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ] : [
    { id: "my-trainings", icon: BookOpen, label: "My Trainings", badge: `${myDone}/${myTotal}` },
    { id: "knowledge-hub", icon: Lightbulb, label: "Knowledge Hub" },
  ];
  return (
    <aside className="w-60 bg-card border-r flex flex-col p-3.5 shrink-0">
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
          <Target className="w-4 h-4 text-white" />
        </div>
        <span className="text-base font-bold tracking-tight">TrainTrack</span>
      </div>
      <div className="px-2 pt-2 pb-4"><FYBadge fy={currentFY} /></div>
      <nav className="flex-1 space-y-1">
        {nav.map(item => {
          const active = tab === item.id; const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={cn("w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-indigo-50 text-indigo-700" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <span className="flex items-center gap-2.5"><Icon className="h-[18px] w-[18px]" />{item.label}</span>
              {item.badge != null && (
                <span className={cn("text-[11px] font-bold rounded-full px-2 py-0.5 border",
                  active ? "bg-white text-indigo-700 border-indigo-200" : "bg-muted text-muted-foreground border-border")}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
      <Separator className="my-3" />
      <div className="flex items-center gap-2.5 px-2 mb-2.5">
        <UAvatar name={user.name} color={user.color} className="h-8 w-8" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{user.name.split(" ")[0]}</div>
          <div className="text-[11px] text-muted-foreground capitalize">{user.role}</div>
        </div>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onLogout}><LogOut className="h-3.5 w-3.5 mr-1.5" />Logout</Button>
    </aside>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ users, trainings, onAdd, onRefresh, refreshing, fyList, fyFilter, setFyFilter, onExport, onDetail }) {
  const [drill, setDrill] = useState(null);      // stat-card drilldown
  const [memberModal, setMemberModal] = useState(null); // full training list for a member
  const members = users.filter(u => u.role === "member");
  const fyT = trainings.filter(t => t.fy === fyFilter && getEffStatus(t) !== "discarded");
  const totalU = fyT.reduce((s, t) => s + getUnits(t).total, 0);
  const doneU = fyT.reduce((s, t) => s + getUnits(t).done, 0);
  const pct = totalU ? Math.round(doneU / totalU * 100) : 0;
  const overdueList = fyT.filter(t => { const s = getEffStatus(t); return (s === "pending" || s === "in-progress") && isOverdue(t.dueDate); });
  const stars = members.filter(u => getAchievement(u, fyT) === "star");

  const stats = [
    { key: "members", label: "Team Members", value: members.length, note: "active", Icon: Users, tint: "bg-indigo-50 text-indigo-600" },
    { key: "units", label: "Training Units", value: totalU, note: `${fyT.length} trainings`, Icon: Package, tint: "bg-emerald-50 text-emerald-600" },
    { key: "completion", label: "Completion", value: `${pct}%`, note: `${doneU}/${totalU} units`, Icon: Target, tint: "bg-amber-50 text-amber-600" },
    { key: "overdue", label: "Overdue", value: overdueList.length, note: "need action", Icon: Clock, tint: overdueList.length ? "bg-rose-50 text-rose-600" : "bg-muted text-muted-foreground" },
  ];

  const userName = id => (users.find(u => u.id === id) || {}).name || "Unknown";
  const userColor = id => (users.find(u => u.id === id) || {}).color;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Training progress overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Select value={fyFilter} onValueChange={setFyFilter}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>{fyList.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={onExport}><Download className="h-4 w-4 mr-1.5" />Export</Button>
          <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1.5" />Assign Training</Button>
        </div>
      </div>

      {stars.length > 0 && (
        <Card className="mb-5 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50/50">
          <CardContent className="p-5">
            <div className="text-sm font-bold text-amber-800 mb-3">🌟 Star Performers — FY {fyFilter}</div>
            <div className="flex flex-wrap gap-3">
              {stars.map(u => (
                <div key={u.id} className="flex items-center gap-2.5 bg-card border border-amber-200 rounded-xl px-4 py-2.5">
                  <UAvatar name={u.name} color={u.color} className="h-8 w-8" />
                  <div>
                    <div className="text-[13px] font-semibold">{u.name}</div>
                    <div className="text-[11px] text-amber-700">All trainings completed! 🎉</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(s => {
          const Icon = s.Icon;
          return (
            <Card key={s.key} className="cursor-pointer hover:shadow-md hover:border-indigo-200 transition" onClick={() => setDrill(s.key)}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", s.tint)}><Icon className="h-[18px] w-[18px]" /></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                </div>
                <div className="text-3xl font-bold tracking-tight leading-none">{s.value}</div>
                <div className="text-[13px] font-semibold mt-1.5">{s.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.note}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SectionLabel>Individual Progress — FY {fyFilter}</SectionLabel>
      {members.length === 0 ? (
        <Card className="border-dashed"><CardContent className="p-11 text-center text-sm text-muted-foreground">No team members yet. Add them in Settings.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          {members.map(u => {
            const ut = fyT.filter(t => t.userId === u.id);
            const totalUU = ut.reduce((s, t) => s + getUnits(t).total, 0);
            const doneUU = ut.reduce((s, t) => s + getUnits(t).done, 0);
            const up = totalUU ? Math.round(doneUU / totalUU * 100) : 0;
            const tone = up >= 60 ? "text-emerald-600" : up >= 30 ? "text-amber-600" : "text-rose-600";
            const pending = ut.filter(t => { const s = getEffStatus(t); return s === "pending" || s === "in-progress"; });
            const done = ut.filter(t => getEffStatus(t) === "completed");
            const od = pending.filter(t => isOverdue(t.dueDate));
            const ach = getAchievement(u, fyT);
            return (
              <Card key={u.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <UAvatar name={u.name} color={u.color} className="h-10 w-10" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14.5px] truncate">{u.name}</span>
                        {ach && <AchBadge level={ach} />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{doneUU}/{totalUU} units done</div>
                    </div>
                    <div className={cn("text-lg font-bold tracking-tight", tone)}>{up}%</div>
                  </div>
                  <Progress value={up} className="h-2 mb-3" />

                  {/* Summary chips — scale cleanly no matter how many trainings */}
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
                        <div key={t.id} className={cn("text-[12.5px] flex items-center gap-1.5 mb-1", isOverdue(t.dueDate) ? "text-rose-600" : "text-muted-foreground")}>
                          <span className="text-[8px]">●</span><span className="truncate">{t.title}</span>
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
              <tr className="bg-muted/50 border-b">
                <th className="text-left font-medium text-muted-foreground px-4 py-3 text-xs uppercase tracking-wide">Member</th>
                {fyList.map(fy => <th key={fy} className="text-center font-medium text-muted-foreground px-3 py-3 text-xs">FY {fy}</th>)}
              </tr>
            </thead>
            <tbody>
              {members.map(u => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <UAvatar name={u.name} color={u.color} className="h-6 w-6" />
                      <span className="font-medium">{u.name}</span>
                    </div>
                  </td>
                  {fyList.map(fy => {
                    const utt = trainings.filter(t => t.userId === u.id && t.fy === fy);
                    const tU = utt.reduce((s, t) => s + getUnits(t).total, 0);
                    const dU = utt.reduce((s, t) => s + getUnits(t).done, 0);
                    if (!tU) return <td key={fy} className="text-center px-3 py-3 text-muted-foreground/40">—</td>;
                    return <td key={fy} className="text-center px-3 py-3"><span className={cn("font-semibold", dU === tU ? "text-emerald-600" : "")}>{dU}/{tU}</span></td>;
                  })}
                </tr>
              ))}
              {members.length === 0 && <tr><td colSpan={fyList.length + 1} className="text-center text-muted-foreground py-6">No members yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stat-card drilldown */}
      <DashboardDrill
        which={drill} onClose={() => setDrill(null)} fyFilter={fyFilter}
        members={members} fyT={fyT} overdueList={overdueList}
        userName={userName} userColor={userColor} onDetail={onDetail}
      />

      {/* Full training list for one member */}
      <MemberTrainingsModal
        member={memberModal} onClose={() => setMemberModal(null)} fyFilter={fyFilter}
        trainings={fyT.filter(t => memberModal && t.userId === memberModal.id)}
        onDetail={onDetail}
      />
    </div>
  );
}

// Row used inside dashboard modals
function TrainingMiniRow({ t, who, whoColor, onDetail }) {
  const status = getEffStatus(t);
  const StatusIcon = status === "completed" ? Check : status === "in-progress" ? CircleDot : Circle;
  return (
    <button onClick={() => onDetail && onDetail(t, null)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition text-left">
      <StatusIcon className={cn("h-4 w-4 shrink-0", status === "completed" ? "text-emerald-600" : status === "in-progress" ? "text-indigo-600" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{t.title}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          {who && <span className="flex items-center gap-1"><UAvatar name={who} color={whoColor} className="h-3.5 w-3.5" />{who}</span>}
          {t.dueDate && <span className={cn(isOverdue(t.dueDate) && status !== "completed" && "text-rose-600")}>Due {fmtDate(t.dueDate)}</span>}
        </div>
      </div>
      {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">{partsLabel(t)}</span>}
      <StatusBadge status={status} dueDate={t.dueDate} />
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
              const ut = fyT.filter(t => t.userId === u.id);
              const tot = ut.reduce((s, t) => s + getUnits(t).total, 0);
              const dn = ut.reduce((s, t) => s + getUnits(t).done, 0);
              const up = tot ? Math.round(dn / tot * 100) : 0;
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition">
                  <UAvatar name={u.name} color={u.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{u.name}</div><div className="text-[11px] text-muted-foreground">{u.email || "no email"}</div></div>
                  <div className="w-24"><Progress value={up} className="h-1.5" /></div>
                  <span className="text-[12px] font-semibold w-9 text-right">{up}%</span>
                </div>
              );
            })}
            {members.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No members yet.</p>}
          </div>
        )}

        {which === "completion" && (
          <div className="space-y-1">
            {members.map(u => {
              const ut = fyT.filter(t => t.userId === u.id);
              const tot = ut.reduce((s, t) => s + getUnits(t).total, 0);
              const dn = ut.reduce((s, t) => s + getUnits(t).done, 0);
              const up = tot ? Math.round(dn / tot * 100) : 0;
              const tone = up >= 60 ? "text-emerald-600" : up >= 30 ? "text-amber-600" : "text-rose-600";
              return (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <UAvatar name={u.name} color={u.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-medium">{u.name}</div><Progress value={up} className="h-1.5 mt-1" /></div>
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
              : fyT.map(t => <TrainingMiniRow key={t.id} t={t} who={userName(t.userId)} whoColor={userColor(t.userId)} onDetail={onDetail} />)}
          </div>
        )}

        {which === "overdue" && (
          <div className="space-y-1">
            {overdueList.length === 0 ? <p className="text-sm text-emerald-600 text-center py-6 font-medium">🎉 Nothing overdue. Great going!</p>
              : overdueList.map(t => <TrainingMiniRow key={t.id} t={t} who={userName(t.userId)} whoColor={userColor(t.userId)} onDetail={onDetail} />)}
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
    ["Overdue", trainings.filter(t => { const s = getEffStatus(t); return (s === "pending" || s === "in-progress") && isOverdue(t.dueDate); })],
    ["In Progress", trainings.filter(t => getEffStatus(t) === "in-progress" && !isOverdue(t.dueDate))],
    ["Pending", trainings.filter(t => getEffStatus(t) === "pending" && !isOverdue(t.dueDate))],
    ["Completed", trainings.filter(t => getEffStatus(t) === "completed")],
  ].filter(([, arr]) => arr.length);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <UAvatar name={member.name} color={member.color} className="h-9 w-9" />
            <div><DialogTitle>{member.name}</DialogTitle><DialogDescription>All trainings — FY {fyFilter}</DialogDescription></div>
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
function MyTrainings({ trainings, onComplete, onDetail, fyList, fyFilter, setFyFilter }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(new Set());
  const toggle = id => setExpanded(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const fyT = trainings.filter(t => t.fy === fyFilter);
  const filtered = fyT.filter(t => {
    const s = getEffStatus(t);
    if (filter === "all") return s !== "discarded";
    if (filter === "pending") return s === "pending";
    if (filter === "in-progress") return s === "in-progress";
    if (filter === "overdue") return (s === "pending" || s === "in-progress") && isOverdue(t.dueDate);
    if (filter === "completed") return s === "completed";
    return true;
  });
  const activeT = fyT.filter(t => getEffStatus(t) !== "discarded");
  const totalU = activeT.reduce((s, t) => s + getUnits(t).total, 0);
  const doneU = activeT.reduce((s, t) => s + getUnits(t).done, 0);
  const filters = [["all", "All"], ["pending", "Pending"], ["in-progress", "In Progress"], ["overdue", "Overdue"], ["completed", "Completed"]];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Trainings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{doneU}/{totalU} units completed in FY {fyFilter}</p>
        </div>
        <Select value={fyFilter} onValueChange={setFyFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>{fyList.map(fy => <SelectItem key={fy} value={fy}>FY {fy}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-4 py-1.5 rounded-full text-[13px] font-medium border transition",
              filter === f ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-card border-border text-muted-foreground hover:border-muted-foreground/30")}>{l}</button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-11 text-center text-sm text-muted-foreground">No trainings in this filter.</div>
        ) : filtered.map((t, i) => {
          const status = getEffStatus(t);
          const { done: pd, total: pt } = getUnits(t);
          const isM = hasParts(t); const isE = expanded.has(t.id);
          const overdueRow = (status === "pending" || status === "in-progress") && isOverdue(t.dueDate);
          const StatusIcon = status === "completed" ? Check : status === "in-progress" ? CircleDot : Circle;
          return (
            <div key={t.id} className={cn(i < filtered.length - 1 && "border-b")}>
              <div className={cn("flex items-center gap-3 px-5 py-3.5", overdueRow && "bg-rose-50/40")}>
                <StatusIcon className={cn("h-5 w-5 shrink-0", status === "completed" ? "text-emerald-600" : status === "in-progress" ? "text-indigo-600" : "text-muted-foreground")} />
                <div className={cn("flex-1 min-w-0", isM && "cursor-pointer")} onClick={() => isM && toggle(t.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{t.title}</span>
                    {t.carriedFromFy && <FYBadge fy={`↪ ${t.carriedFromFy}`} />}
                    {isM && <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{pd}/{pt} Parts</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3 flex-wrap">
                    {t.dueDate && <span className={cn(isOverdue(t.dueDate) && status !== "completed" && "text-rose-600")}><CalendarDays className="h-3 w-3 inline mr-0.5" />Due {fmtDate(t.dueDate)}</span>}
                    {!isM && t.completedDate && <span>✓ {fmtDate(t.completedDate)}</span>}
                    {cleanLinks(t.resources).length > 0 && <span className="text-indigo-600">📎 {cleanLinks(t.resources).length} resource(s)</span>}
                    {isM && <span>{isE ? "▲ Collapse" : "▼ View parts"}</span>}
                  </div>
                  {isM && pt > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <Progress value={Math.round(pd / pt * 100)} className="h-1.5 flex-1" />
                      <span className="text-[11px] text-muted-foreground shrink-0">{Math.round(pd / pt * 100)}%</span>
                    </div>
                  )}
                </div>
                <StatusBadge status={status} dueDate={t.dueDate} />
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => onDetail(t, null)}>Details</Button>
                {!isM && status === "pending" && <Button size="sm" className="shrink-0" onClick={() => onComplete(t, null)}>Mark Done</Button>}
                {isM && <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => toggle(t.id)}>{isE ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</Button>}
              </div>
              {isM && isE && (
                <div className="bg-muted/40 border-t px-5 py-2 pl-14">
                  {t.parts.map((part, pi) => {
                    const plinks = cleanLinks(part.resources);
                    return (
                      <div key={part.id} className={cn("py-3", pi < t.parts.length - 1 && "border-b")}>
                        <div className="flex items-center gap-3">
                          <PartDot n={pi + 1} status={part.status} />
                          <div className="flex-1 min-w-0">
                            <div className={cn("text-[13.5px] font-medium", part.status === "completed" ? "text-muted-foreground line-through" : "")}>{part.title}</div>
                            {part.completedDate && <div className="text-xs text-muted-foreground mt-0.5">✓ Completed {fmtDate(part.completedDate)}</div>}
                          </div>
                          {part.status === "completed" && <Button variant="outline" size="sm" className="shrink-0" onClick={() => onDetail(t, part)}>View Notes</Button>}
                          {part.status === "pending" && <Button size="sm" className="shrink-0" onClick={() => onComplete(t, part)}>Mark Done</Button>}
                        </div>
                        {plinks.length > 0 && part.status !== "completed" && <div className="mt-2 pl-9"><LinkChips links={plinks} /></div>}
                      </div>
                    );
                  })}
                  {pd === pt && pt > 0 && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 my-2.5">🎉 All parts completed! This training is fully done.</div>}
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
function KnowledgeHub({ trainings, users, onDetail }) {
  const [search, setSearch] = useState("");
  const [fyF, setFyF] = useState("all");
  const [openGroup, setOpenGroup] = useState(null);
  const getUser = id => users.find(u => u.id === id) || { name: "Unknown", color: "#94a3b8" };

  // Only fully-completed trainings enter the repository.
  const completed = trainings.filter(t => getEffStatus(t) === "completed");
  const fyPool = fyF === "all" ? completed : completed.filter(t => t.fy === fyF);
  const allFYs = [...new Set(completed.map(t => t.fy))].filter(Boolean).sort().reverse();

  // Group by catalog training (catId), fall back to title when no catId.
  const groupsMap = {};
  fyPool.forEach(t => {
    const key = t.catId || `title:${t.title.toLowerCase()}`;
    if (!groupsMap[key]) groupsMap[key] = { key, title: t.title, entries: [] };
    groupsMap[key].entries.push(t);
  });
  let groups = Object.values(groupsMap).map(g => {
    // one contributor entry per (user) — latest completion of this training by that user
    const byUser = {};
    g.entries.forEach(t => {
      const prev = byUser[t.userId];
      if (!prev || (t.completedDate || "") > (prev.completedDate || "")) byUser[t.userId] = t;
    });
    const contributors = Object.values(byUser).sort((a, b) => (b.completedDate || "").localeCompare(a.completedDate || ""));
    const latest = contributors[0]?.completedDate || "";
    return { ...g, contributors, latest };
  });

  // Search across training name + any contributor's notes (incl. part notes)
  const q = search.trim().toLowerCase();
  if (q) {
    groups = groups.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.contributors.some(t =>
        (t.notes || "").toLowerCase().includes(q) ||
        (hasParts(t) && t.parts.some(p => (p.notes || "").toLowerCase().includes(q)))
      )
    );
  }
  groups.sort((a, b) => (b.latest || "").localeCompare(a.latest || ""));

  const notePreview = t => {
    if (hasParts(t)) { const fp = t.parts.find(p => p.notes); return fp ? fp.notes : ""; }
    return t.notes || "";
  };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Hub</h1>
        <p className="text-sm text-muted-foreground mt-0.5">A shared library of completed trainings — browse what your teammates learned and where they learned it.</p>
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
        <Card className="border-dashed"><CardContent className="p-14 text-center text-sm text-muted-foreground">{completed.length === 0 ? "No completed trainings yet — once someone finishes a training, it'll appear here for everyone to learn from. 🚀" : "No results found."}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(g => {
            const preview = notePreview(g.contributors[0]);
            const shown = g.contributors.slice(0, 4);
            const extra = g.contributors.length - shown.length;
            return (
              <Card key={g.key} className="hover:shadow-md transition-shadow cursor-pointer flex flex-col" onClick={() => setOpenGroup(g)}>
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
                        {shown.map(t => { const u = getUser(t.userId); return (
                          <div key={t.id} className="ring-2 ring-white rounded-full"><UAvatar name={u.name} color={u.color} className="h-7 w-7" /></div>
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

      <KnowledgeDetailModal group={openGroup} users={users} onClose={() => setOpenGroup(null)} />
    </div>
  );
}

// Repository detail — one training, every contributor's notes & references side by side.
function KnowledgeDetailModal({ group, users, onClose }) {
  if (!group) return null;
  const getUser = id => users.find(u => u.id === id) || { name: "Unknown", color: "#94a3b8" };

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
            const u = getUser(t.userId);
            const isM = hasParts(t);
            const trainingRes = cleanLinks(t.resources);
            return (
              <div key={t.id} className="border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 border-b">
                  <UAvatar name={u.name} color={u.color} className="h-8 w-8" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold">{u.name}</div>
                    <div className="text-[11px] text-muted-foreground">Completed {fmtDate(t.completedDate)} · FY {t.fy}</div>
                  </div>
                  {isM && <Badge variant="outline" className="text-indigo-700 bg-indigo-50 border-indigo-200 font-medium shrink-0">{t.parts.length} parts</Badge>}
                </div>

                <div className="p-4 space-y-3">
                  {isM ? (
                    t.parts.map((p, pi) => {
                      const oc = cleanLinks(p.outcomes);
                      return (
                        <div key={p.id} className="pl-3 border-l-2 border-indigo-200">
                          <div className="text-[12px] font-semibold text-indigo-700 mb-1">Part {pi + 1}: {p.title}</div>
                          {p.notes ? <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap mb-2">{p.notes}</p> : <p className="text-[12.5px] text-muted-foreground italic mb-2">No notes.</p>}
                          {oc.length > 0 && <div className="mb-1"><LinkChips links={oc} /></div>}
                        </div>
                      );
                    })
                  ) : (
                    <>
                      {t.notes ? <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{t.notes}</p> : <p className="text-[12.5px] text-muted-foreground italic">No notes added.</p>}
                      {cleanLinks(t.outcomes).length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">📎 Outcome references</div>
                          {cleanLinks(t.outcomes).map((l, i) => <LinkRow key={i} link={l} theme="indigo" />)}
                        </div>
                      )}
                    </>
                  )}

                  {trainingRes.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">📌 Reference material used</div>
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
function DetailModal({ training, users, onClose }) {
  const u = users.find(x => x.id === training.userId) || { name: "Unknown", color: "#94a3b8" };
  const isM = hasParts(training); const status = getEffStatus(training);
  const resources = cleanLinks(training.resources);

  const PartSec = ({ part, n }) => {
    const oc = cleanLinks(part.outcomes);
    const ref = cleanLinks(part.resources);
    return (
      <div className="bg-muted/50 border rounded-xl p-4 mb-2.5">
        <div className="flex items-center gap-2.5 mb-2.5">
          <PartDot n={n} status={part.status} />
          <div className="flex-1 font-semibold text-sm">{part.title}</div>
          <StatusBadge status={part.status} />
        </div>
        {ref.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">📌 Reference material for this part:</div>
            {ref.map((l, i) => <LinkRow key={i} link={l} theme="amber" />)}
          </div>
        )}
        {part.status === "completed" ? (
          <>
            <div className="text-xs text-muted-foreground mb-2">✓ Completed {fmtDate(part.completedDate)}</div>
            {part.notes && <div className="text-[13px] leading-relaxed mb-2.5 whitespace-pre-wrap bg-card rounded-lg p-3 border">{part.notes}</div>}
            {oc.length > 0 && <><div className="text-[11px] font-semibold text-muted-foreground mb-1.5">📎 Outcome references:</div>{oc.map((l, i) => <LinkRow key={i} link={l} theme="indigo" />)}</>}
          </>
        ) : (
          <div className="text-[13px] text-muted-foreground italic">Not completed yet.</div>
        )}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1">
            Training Detail <FYBadge fy={training.fy} />
            {isM && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full normal-case tracking-normal">{training.parts.length} Parts</span>}
          </div>
          <DialogTitle className="text-lg leading-snug">{training.title}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 p-3.5 bg-muted/50 rounded-xl border">
          <UAvatar name={u.name} color={u.color} className="h-10 w-10" />
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold">{u.name}</div>
            <div className="text-xs text-muted-foreground">{status === "completed" ? `Completed ${fmtDate(training.completedDate)}` : training.dueDate ? `Due ${fmtDate(training.dueDate)}` : "No due date"}</div>
            {isM && <Progress value={Math.round(getUnits(training).done / getUnits(training).total * 100)} className="h-1.5 mt-2" />}
          </div>
          <StatusBadge status={status} dueDate={training.dueDate} />
        </div>

        {resources.length > 0 && (
          <div>
            <div className="text-[13px] font-bold mb-2.5">📌 Reference Material (whole training)</div>
            {resources.map((l, i) => <LinkRow key={i} link={l} theme="amber" />)}
          </div>
        )}

        {isM ? (
          <div>
            <div className="text-[13px] font-bold mb-3">📋 Parts & Learnings</div>
            {training.parts.map((part, pi) => <PartSec key={part.id} part={part} n={pi + 1} />)}
          </div>
        ) : (
          <>
            <div>
              <div className="text-[13px] font-bold mb-2.5">📝 Key Learnings & Outcome Notes</div>
              <div className="bg-muted/50 rounded-xl p-4 text-sm leading-relaxed border whitespace-pre-wrap min-h-[60px]">
                {training.notes || <span className="text-muted-foreground italic">{status === "completed" ? "No notes added." : "Not completed yet."}</span>}
              </div>
            </div>
            <div>
              <div className="text-[13px] font-bold mb-2.5">📎 Outcome Reference Material</div>
              {cleanLinks(training.outcomes).length > 0
                ? cleanLinks(training.outcomes).map((l, i) => <LinkRow key={i} link={l} theme="indigo" />)
                : <div className="p-3.5 bg-muted/50 rounded-xl border border-dashed text-[13px] text-muted-foreground italic">{status === "completed" ? "No reference material added." : "Not completed yet."}</div>}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── COMPLETE MODAL ────────────────────────────────────────────────────────────
function CompleteModal({ training, part, onSubmit, onClose }) {
  const [notes, setNotes] = useState(""); const [outcomes, setOutcomes] = useState([{ url: "", title: "" }]);
  const resources = part ? cleanLinks(part.resources) : cleanLinks(training.resources);
  const ok = notes.trim().length > 0 && cleanLinks(outcomes).length > 0;
  const partIdx = part ? training.parts.findIndex(p => p.id === part.id) : -1;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="lg">
        <DialogHeader>
          <DialogTitle>{part ? `Complete Part ${partIdx + 1}` : "Mark as Completed"} ✅</DialogTitle>
          <DialogDescription className="text-indigo-700 font-semibold">{training.title}</DialogDescription>
        </DialogHeader>

        {part && <div className="text-[13px] text-muted-foreground px-3.5 py-2 bg-indigo-50 rounded-lg border border-indigo-200">📋 Part {partIdx + 1}: {part.title}</div>}

        {resources.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-amber-700 mb-1.5">📌 Study {part ? "material for this part" : "resources"}:</div>
            {resources.map((l, i) => (
              <a key={i} href={safeUrl(l.url)} target="_blank" rel="noreferrer" className="block text-[12.5px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-1.5 no-underline hover:brightness-95">
                <Link2 className="h-3 w-3 inline mr-1" />{l.title || "Open material"} <ExternalLink className="h-3 w-3 inline" />
              </a>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 text-[12.5px] text-indigo-700">
          ℹ️ <strong>Both fields are mandatory</strong> — your notes and outcome links help the whole team learn from your experience.
        </div>

        <div className="space-y-1.5">
          <Label>{part ? `Key Learnings — Part ${partIdx + 1}` : "Key Learnings / Outcome Notes"} <span className="text-rose-500">*</span></Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="What did you learn? What were the key takeaways? Be specific so teammates benefit." />
        </div>
        <div className="space-y-1.5">
          <Label>Outcome Reference Material <span className="text-rose-500">*</span></Label>
          <LinkListEditor links={outcomes} setLinks={setOutcomes} titleP="e.g. 'My notes doc', 'Certificate'" addLabel="Add another reference" />
          <p className="text-xs text-muted-foreground">Add your notes doc, certificate, recording, or any useful link. Add as many as needed.</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok} onClick={() => onSubmit(training.id, part?.id || null, { notes, outcomes: cleanLinks(outcomes) })}>{part ? `Submit Part ${partIdx + 1}` : "Submit Completion"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── ASSIGN MODAL (pure picker) ────────────────────────────────────────────────
function AssignModal({ users, catalog, currentFY, onSubmit, onClose, onGoToCatalog }) {
  const [memberIds, setMemberIds] = useState([]);
  const [catIds, setCatIds] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const members = users.filter(u => u.role === "member");
  const selectedCats = catalog.filter(c => catIds.includes(c.id));
  const ok = memberIds.length > 0 && catIds.length > 0;
  const totalAssignments = memberIds.length * catIds.length;

  const toggleMember = id => setMemberIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleCat = id => setCatIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const submit = () => {
    if (!ok) return;
    const batch = [];
    memberIds.forEach(userId => {
      selectedCats.forEach(sel => {
        batch.push({
          userId, catId: sel.id, title: sel.name, dueDate: dueDate || null,
          resources: cleanLinks(sel.resources),
          parts: (sel.parts || []).map(p => ({ id: uid("p"), title: p.title, resources: cleanLinks(p.resources), status: "pending", completedDate: null, notes: null, outcomes: [] })),
        });
      });
    });
    onSubmit(batch);
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="lg">
        <DialogHeader>
          <DialogTitle>Assign Training</DialogTitle>
          <DialogDescription className="flex items-center gap-2">Select members and trainings — you can pick several of each. <FYBadge fy={currentFY} /></DialogDescription>
        </DialogHeader>

        {/* Members multi-select */}
        <div className="space-y-1.5">
          <Label>Team Members <span className="text-rose-500">*</span> {memberIds.length > 0 && <span className="text-muted-foreground font-normal">· {memberIds.length} selected</span>}</Label>
          {members.length === 0 ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] text-amber-800">No members yet. Add them in Settings first.</div>
          ) : (
            <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
              {members.map(u => (
                <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted transition">
                  <Checkbox checked={memberIds.includes(u.id)} onCheckedChange={() => toggleMember(u.id)} />
                  <UAvatar name={u.name} color={u.color} className="h-7 w-7" />
                  <div className="min-w-0"><div className="text-[13px] font-medium truncate">{u.name}</div><div className="text-[11px] text-muted-foreground truncate">{u.email || "no email"}</div></div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Trainings multi-select */}
        <div className="space-y-1.5">
          <Label>Trainings <span className="text-rose-500">*</span> {catIds.length > 0 && <span className="text-muted-foreground font-normal">· {catIds.length} selected</span>}</Label>
          {catalog.length === 0 ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] text-amber-800">
              Your catalog is empty. <button onClick={onGoToCatalog} className="underline font-semibold">Add a training in the Catalog</button> first.
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {catalog.map(c => {
                const parts = c.parts || []; const res = cleanLinks(c.resources); const on = catIds.includes(c.id);
                return (
                  <label key={c.id} className={cn("flex items-start gap-3 px-3 py-2.5 cursor-pointer transition", on ? "bg-indigo-50/60" : "hover:bg-muted")}>
                    <Checkbox className="mt-0.5" checked={on} onCheckedChange={() => toggleCat(c.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium">{c.name}</span>
                        {parts.length > 0
                          ? <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{parts.length} parts</span>
                          : <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">single</span>}
                        {res.length > 0 && <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" />{res.length}</span>}
                      </div>
                      {on && parts.length > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-1">{parts.map(p => p.title).join(" · ")}</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Parts and reference links come from the Training Catalog automatically.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Due Date (optional)</Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} min={today()} />
          <p className="text-xs text-muted-foreground">Applied to every training in this batch. Overdue items are flagged automatically.</p>
        </div>

        {ok && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3.5 py-2.5 text-[13px] text-indigo-800">
            This will create <strong>{totalAssignments}</strong> assignment{totalAssignments > 1 ? "s" : ""} ({catIds.length} training{catIds.length > 1 ? "s" : ""} × {memberIds.length} member{memberIds.length > 1 ? "s" : ""}).
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-[2]" disabled={!ok} onClick={submit}>{ok && totalAssignments > 1 ? `Assign ${totalAssignments} Trainings` : "Assign Training"}</Button>
        </DialogFooter>
      </ModalContent>
    </Dialog>
  );
}

// ── CATALOG MANAGER (training builder) ────────────────────────────────────────
function CatalogManager({ catalog, trainings, onSave, openNew }) {
  const [local, setLocal] = useState(() => catalog);
  const [saved, setSaved] = useState(false);
  const [editId, setEditId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(null);
  const [delTarget, setDelTarget] = useState(null);

  useEffect(() => { setLocal(catalog); }, [catalog]);
  useEffect(() => { if (openNew) startCreate(); /* eslint-disable-next-line */ }, [openNew]);

  const usage = item => trainings.filter(t => ((t.catId && t.catId === item.id) || t.title === item.name) && getEffStatus(t) !== "discarded").length;

  const blankDraft = () => ({ id: uid("c"), name: "", resources: [{ url: "", title: "" }], parts: [] });
  const startCreate = () => { setDraft(blankDraft()); setCreating(true); setEditId(null); };
  const startEdit = item => { setDraft({ ...item, resources: (item.resources && item.resources.length ? item.resources : [{ url: "", title: "" }]), parts: (item.parts || []).map(p => ({ ...p, resources: [...(p.resources || [])] })) }); setEditId(item.id); setCreating(false); };
  const cancelEdit = () => { setDraft(null); setEditId(null); setCreating(false); };

  const commitDraft = async () => {
    if (!draft.name.trim()) return;
    const clean = { id: draft.id, name: draft.name.trim(), resources: cleanLinks(draft.resources), parts: (draft.parts || []).filter(p => p.title.trim()).map(p => ({ id: p.id || uid("cp"), title: p.title.trim(), resources: cleanLinks(p.resources) })) };
    const next = creating ? [...local, clean] : local.map(c => c.id === clean.id ? clean : c);
    setLocal(next); await onSave(next);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
    cancelEdit();
  };
  const requestRemove = item => { if (usage(item) > 0) return; setDelTarget(item); };
  const confirmRemove = async () => {
    const item = delTarget; setDelTarget(null);
    if (!item) return;
    const next = local.filter(c => c.id !== item.id);
    setLocal(next); await onSave(next);
  };
  const dUpd = (f, v) => setDraft(d => ({ ...d, [f]: v }));

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Training Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">Define each training once — its parts, whole-training reference links, and per-part links. When you assign it from the Dashboard, everything is pulled in automatically.</p>
        </div>
        {!creating && !editId && <Button onClick={startCreate}><Plus className="h-4 w-4 mr-1.5" />New Training</Button>}
      </div>

      {draft && (
        <Card className="mb-5 border-indigo-200 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-[15px] font-bold mb-5">
              {creating ? <><Sparkles className="h-4 w-4 text-indigo-600" />New Training</> : <><Pencil className="h-4 w-4 text-indigo-600" />Edit Training</>}
            </div>

            <div className="space-y-1.5 mb-4">
              <Label>Training Name <span className="text-rose-500">*</span></Label>
              <Input value={draft.name} onChange={e => dUpd("name", e.target.value)} placeholder='e.g. "Advanced SQL for Analysts"' autoFocus />
            </div>

            <div className="space-y-1.5 mb-1">
              <Label>Reference Material — whole training</Label>
              <LinkListEditor links={draft.resources} setLinks={fn => dUpd("resources", typeof fn === "function" ? fn(draft.resources) : fn)} addLabel="Add training link" />
              <p className="text-xs text-muted-foreground">Course links, internal docs, videos that apply to the entire training. Shown to the member for every part.</p>
            </div>

            <div className="bg-muted/50 border rounded-xl p-4 mt-4">
              <div className="text-[13px] font-semibold mb-1">Parts / Modules <span className="text-muted-foreground font-normal">(optional)</span></div>
              <p className="text-xs text-muted-foreground mb-3.5">For big trainings, break it into parts. Each part can have its own reference links. Leave empty for a single-step training.</p>
              <CatalogPartEditor parts={draft.parts} setParts={fn => dUpd("parts", typeof fn === "function" ? fn(draft.parts) : fn)} />
            </div>

            <div className="flex gap-2.5 mt-5">
              <Button variant="outline" className="flex-1" onClick={cancelEdit}>Cancel</Button>
              <Button className="flex-[2]" disabled={!draft.name.trim()} onClick={commitDraft}>{creating ? "Add to Catalog" : "Save Changes"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {saved && !draft && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-[13px] text-emerald-700 font-semibold mb-4">✅ Catalog saved.</div>}

      {local.length === 0 && !draft ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <Library className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm mb-4">Your catalog is empty.</p>
            <Button onClick={startCreate}><Plus className="h-4 w-4 mr-1.5" />Create your first training</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {local.map(item => {
            if (editId === item.id) return null;
            const parts = item.parts || []; const res = cleanLinks(item.resources);
            const used = usage(item); const locked = used > 0;
            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><GraduationCap className="h-[18px] w-[18px] text-indigo-600" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[14.5px] font-semibold">{item.name}</span>
                        {parts.length > 0
                          ? <span className="bg-indigo-100 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">{parts.length} Parts</span>
                          : <Badge variant="outline" className="text-muted-foreground font-medium">Single step</Badge>}
                        <span className={cn("text-[11.5px]", locked ? "text-indigo-700 font-semibold" : "text-muted-foreground")}>· {used} assigned</span>
                      </div>
                      {res.length > 0 && <div className="mb-2.5"><div className="text-[11px] text-muted-foreground mb-1.5">Training links</div><LinkChips links={res} /></div>}
                      {parts.length > 0 && (
                        <div className="space-y-1.5">
                          {parts.map((p, i) => { const pl = cleanLinks(p.resources); return (
                            <div key={p.id || i} className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                              <span className="h-[18px] w-[18px] rounded bg-muted border flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                              <span className="text-foreground">{p.title}</span>
                              {pl.length > 0 && <span className="text-[10.5px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-px font-semibold inline-flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" />{pl.length}</span>}
                            </div>
                          ); })}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => startEdit(item)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                      <Button variant="outline" size="icon" disabled={locked} title={locked ? "Cannot delete — currently assigned" : "Delete"} className={cn(!locked && "text-rose-600 border-rose-200 hover:bg-rose-50")} onClick={() => requestRemove(item)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <p className="text-xs text-muted-foreground pt-1">🔒 Trainings currently assigned to members cannot be deleted.</p>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="Delete training?"
        body={delTarget ? `"${delTarget.name}" will be removed from the catalog. This can't be undone.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setDelTarget(null)}
      />
    </div>
  );
}

// ── REMINDERS ─────────────────────────────────────────────────────────────────
function Reminders({ users, trainings, settings, onSaveSettings, onMarkReminded }) {
  const [pd, setPd] = useState(settings.pendingReminderDays); const [od, setOd] = useState(settings.overdueReminderDays);
  const [savedS, setSavedS] = useState(false); const [copied, setCopied] = useState(false);
  const allPending = trainings.filter(t => { const s = getEffStatus(t); return s === "pending" || s === "in-progress"; });
  const dueFor = allPending.filter(t => { const ov = isOverdue(t.dueDate), thr = ov ? Number(settings.overdueReminderDays) || 3 : Number(settings.pendingReminderDays) || 7, sb = t.lastReminderSent || (ov ? t.dueDate : t.assignedDate); return daysSince(sb) >= thr; });
  const buildBody = list => {
    const g = list.reduce((acc, t) => { const u = users.find(x => x.id === t.userId); if (!u) return acc; acc[u.id] = acc[u.id] || { user: u, items: [] }; acc[u.id].items.push(t); return acc; }, {});
    return "Hi team,\n\nThis is a reminder about your pending training(s):\n\n" +
      Object.values(g).map(({ user, items }) => `${user.name}:\n${items.map(t => { const { done, total } = getUnits(t); return `  • ${t.title}${hasParts(t) ? ` [${done}/${total} parts done]` : ""}${t.dueDate ? ` — Due: ${fmtDate(t.dueDate)}${isOverdue(t.dueDate) ? " (OVERDUE)" : ""}` : ""}`; }).join("\n")}`).join("\n\n") +
      "\n\nPlease complete your pending trainings at the earliest and log your learnings on the Knowledge Hub.\n\nThanks,\nYour Supervisor";
  };
  const send = list => { const emails = [...new Set(list.map(t => users.find(u => u.id === t.userId)?.email).filter(Boolean))].join(","); window.open(`mailto:${emails}?subject=${encodeURIComponent("Training Reminder — Action Required")}&body=${encodeURIComponent(buildBody(list))}`, "_self"); onMarkReminded(list.map(t => t.id)); };
  const copy = list => { navigator.clipboard.writeText(buildBody(list)); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const saveS = async () => { await onSaveSettings({ ...settings, pendingReminderDays: Number(pd) || 1, overdueReminderDays: Number(od) || 1 }); setSavedS(true); setTimeout(() => setSavedS(false), 2500); };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure reminder frequency & send nudges</p>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-5 text-[13px] text-amber-800 leading-relaxed">
        ⚠️ <strong>How this works:</strong> This app can't send fully-automatic background emails. Each time you open this page, it shows who is due for a reminder. One click opens a pre-filled email for all of them.
      </div>

      <Card className="mb-5">
        <CardContent className="p-5">
          <SectionLabel>Reminder Frequency</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="space-y-1.5"><Label>Pending — remind every (days)</Label><Input type="number" min={1} value={pd} onChange={e => setPd(e.target.value)} /><p className="text-xs text-muted-foreground">While training is not yet overdue.</p></div>
            <div className="space-y-1.5"><Label>Overdue — remind every (days)</Label><Input type="number" min={1} value={od} onChange={e => setOd(e.target.value)} /><p className="text-xs text-muted-foreground">More frequent once due date is crossed.</p></div>
          </div>
          <Button onClick={saveS} className={cn(savedS && "bg-emerald-600 hover:bg-emerald-600")}>{savedS ? "✅ Saved!" : "Save Settings"}</Button>
        </CardContent>
      </Card>

      <Card className={cn("mb-4", dueFor.length ? "border-rose-200 bg-rose-50/50" : "border-emerald-200 bg-emerald-50/50")}>
        <CardContent className="p-5">
          <div className={cn("flex items-center justify-between gap-2.5 flex-wrap", dueFor.length && "mb-3.5")}>
            <div className={cn("text-sm font-bold", dueFor.length ? "text-rose-700" : "text-emerald-700")}>{dueFor.length ? `🔔 ${dueFor.length} reminder(s) due now` : "🎉 No reminders due right now"}</div>
            {dueFor.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copy(dueFor)}><Copy className="h-3.5 w-3.5 mr-1.5" />{copied ? "Copied!" : "Copy"}</Button>
                <Button size="sm" onClick={() => send(dueFor)}><Mail className="h-3.5 w-3.5 mr-1.5" />Send & Mark Reminded</Button>
              </div>
            )}
          </div>
          {dueFor.map(t => { const u = users.find(x => x.id === t.userId); return (
            <div key={t.id} className={cn("flex items-center gap-2.5 text-[13px] py-2 border-t", dueFor.length ? "border-rose-200" : "border-emerald-200")}>
              <UAvatar name={u?.name || "?"} color={u?.color} className="h-6 w-6" />
              <span className="font-medium">{u?.name}</span><span className="text-muted-foreground">— {t.title}</span>
              {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-px rounded-full">{partsLabel(t)}</span>}
              <StatusBadge status={getEffStatus(t)} dueDate={t.dueDate} />
            </div>
          ); })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <SectionLabel>All Pending Trainings</SectionLabel>
          {allPending.length === 0 ? <p className="text-center py-6 text-muted-foreground text-[13px]">Nothing pending — great job team! 🎉</p>
            : allPending.map(t => { const u = users.find(x => x.id === t.userId), ov = isOverdue(t.dueDate), thr = ov ? settings.overdueReminderDays : settings.pendingReminderDays, ni = Math.max(0, thr - daysSince(t.lastReminderSent || (ov ? t.dueDate : t.assignedDate))); return (
              <div key={t.id} className="flex items-center gap-2.5 text-[13px] py-2.5 border-b last:border-0">
                <UAvatar name={u?.name || "?"} color={u?.color} className="h-6 w-6" />
                <span className="font-medium">{u?.name}</span><span className="text-muted-foreground flex-1">{t.title}</span>
                {partsLabel(t) && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-px rounded-full">{partsLabel(t)}</span>}
                <StatusBadge status={getEffStatus(t)} dueDate={t.dueDate} />
                <span className={cn("text-[11.5px] min-w-[92px] text-right", ni === 0 ? "text-rose-600" : "text-muted-foreground")}>{ni === 0 ? "Reminder due" : `Next in ${ni}d`}</span>
              </div>
            ); })}
        </CardContent>
      </Card>
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function Settings({ users, trainings, currentFY, onSaveUsers, onReset, onFinalizeYear }) {
  const [local, setLocal] = useState(users); const [saved, setSaved] = useState(false);
  const [addForm, setAddForm] = useState(false); const [newU, setNewU] = useState({ name: "", email: "", color: COLORS[0] });
  const [choices, setChoices] = useState({});
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { setLocal(users); }, [users]);
  const chg = (id, f, v) => setLocal(p => p.map(u => u.id === id ? { ...u, [f]: v } : u));
  const rm = id => setLocal(p => p.filter(u => u.id !== id));
  const rstPin = id => setLocal(p => p.map(u => u.id === id ? { ...u, pin: "", pinSet: false } : u));
  const save = async () => { await onSaveUsers(local); setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const addM = () => { if (!newU.name.trim() || !newU.email.trim()) return; setLocal(p => [...p, { id: uid("u"), name: newU.name.trim(), email: newU.email.trim(), pin: "", pinSet: false, role: "member", color: newU.color }]); setNewU({ name: "", email: "", color: COLORS[0] }); setAddForm(false); };
  const yfPending = trainings.filter(t => t.fy === currentFY && (getEffStatus(t) === "pending" || getEffStatus(t) === "in-progress"));
  const finalize = () => setConfirmFinalize(true);
  const doFinalize = () => { const d = yfPending.map(t => ({ id: t.id, action: choices[t.id] || "carry" })); setConfirmFinalize(false); onFinalizeYear(d); };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage team members, logins, financial year & sharing</p>
      </div>

      <Card className="mb-5 border-indigo-200 bg-indigo-50/50">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-indigo-800 mb-2"><ShieldCheck className="h-4 w-4" />How to Share with Your Team</div>
          <ol className="text-[13px] text-indigo-800 leading-loose list-decimal pl-5">
            <li>Click the <strong>Share button</strong> on this artifact (top-right on Claude.ai)</li>
            <li>Send the link to your team via email or chat</li>
            <li>Each member needs a <strong>free Claude account</strong> to open the link</li>
            <li>First login: member verifies their <strong>registered email</strong> and sets their own personal PIN</li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel className="mb-0">Team Members</SectionLabel>
            <Button size="sm" onClick={() => setAddForm(!addForm)}><Plus className="h-3.5 w-3.5 mr-1" />Add Member</Button>
          </div>
          {addForm && (
            <div className="bg-muted/50 border rounded-xl p-4 mb-4">
              <div className="text-[13px] font-semibold mb-3">New Team Member</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                <Input value={newU.name} onChange={e => setNewU(p => ({ ...p, name: e.target.value }))} placeholder="Full name *" />
                <Input value={newU.email} onChange={e => setNewU(p => ({ ...p, email: e.target.value }))} placeholder="Email address *" type="email" />
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Color:</span>
                <div className="flex gap-1.5 flex-wrap">{COLORS.map(c => <button key={c} onClick={() => setNewU(p => ({ ...p, color: c }))} className={cn("h-[22px] w-[22px] rounded-full transition", newU.color === c ? "ring-2 ring-offset-2 ring-foreground" : "")} style={{ background: c, width: 22, height: 22 }} />)}</div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Member will set their own PIN on first login by verifying this email.</p>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setAddForm(false)}>Cancel</Button><Button size="sm" disabled={!newU.name.trim() || !newU.email.trim()} onClick={addM}>Add Member</Button></div>
            </div>
          )}
          <div className="space-y-3">
            {local.map(u => (
              <div key={u.id} className="flex items-center gap-3">
                <button onClick={() => chg(u.id, "color", COLORS[(COLORS.indexOf(u.color) + 1) % COLORS.length])} title="Click to change colour"><UAvatar name={u.name} color={u.color} className="h-8 w-8" /></button>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2"><Input value={u.name} onChange={e => chg(u.id, "name", e.target.value)} placeholder="Name" /><Input value={u.email} onChange={e => chg(u.id, "email", e.target.value)} placeholder="Email" type="email" /></div>
                <span className={cn("text-[11px] font-semibold px-2.5 py-1 rounded-md min-w-[86px] text-center", u.pinSet ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{u.pinSet ? "🔒 PIN set" : "⏳ Not set"}</span>
                {u.pinSet && u.role === "member" && <Button variant="outline" size="sm" onClick={() => rstPin(u.id)}>Reset PIN</Button>}
                <Badge variant="outline" className={cn("capitalize font-semibold shrink-0", u.role === "supervisor" ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-emerald-100 text-emerald-700 border-emerald-200")}>{u.role}</Badge>
                {u.role === "member" && <Button variant="ghost" size="icon" className="text-rose-400 shrink-0" onClick={() => rm(u.id)}><X className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
          <Button onClick={save} className={cn("mt-4", saved && "bg-emerald-600 hover:bg-emerald-600")}>{saved ? "✅ Saved!" : "Save Changes"}</Button>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="p-6">
          <SectionLabel>Year-End Tools</SectionLabel>
          <div className="text-[13px] text-muted-foreground mb-4 flex items-center gap-2 flex-wrap">Current FY: <FYBadge fy={currentFY} /> — decide what to do with pending trainings before closing the year.</div>
          {yfPending.length === 0 ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-[13px] text-emerald-700 mb-3.5">🎉 No pending trainings in FY {currentFY}.</div>
          ) : (
            <div className="mb-3.5">{yfPending.map(t => { const u = users.find(x => x.id === t.userId), { done, total } = getUnits(t); return (
              <div key={t.id} className="flex items-center gap-2.5 py-2.5 border-b last:border-0 text-[13px]">
                <UAvatar name={u?.name || "?"} color={u?.color} className="h-6 w-6" />
                <span className="flex-1">{u?.name} — {t.title}{hasParts(t) ? <span className="text-indigo-600 ml-1.5">({done}/{total} parts done)</span> : ""}</span>
                <Select value={choices[t.id] || "carry"} onValueChange={v => setChoices(p => ({ ...p, [t.id]: v }))}>
                  <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carry">↪ Carry to FY {nextFY(currentFY)}</SelectItem>
                    <SelectItem value="discard">🗑 Discard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ); })}</div>
          )}
          <Button onClick={finalize} className="bg-emerald-600 hover:bg-emerald-700">Finalize FY {currentFY} → Start FY {nextFY(currentFY)}</Button>
        </CardContent>
      </Card>

      <Card className="border-rose-200 bg-rose-50/50">
        <CardContent className="p-5">
          <div className="text-sm font-bold text-rose-800 mb-1.5">⚠ Danger Zone</div>
          <p className="text-[13px] text-rose-700 mb-3.5">Permanently deletes all data and resets to a completely fresh, empty state. Cannot be undone.</p>
          <Button variant="outline" className="text-rose-600 border-rose-300 hover:bg-rose-100" onClick={() => setConfirmReset(true)}><Trash2 className="h-4 w-4 mr-1.5" />Reset All Data (Fresh Start)</Button>
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
      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        body="This deletes every member, training and catalog entry, and returns the app to a fresh empty state. This cannot be undone."
        confirmLabel="Reset everything"
        danger
        onConfirm={() => { setConfirmReset(false); onReset(); }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

// ── EXPORT MODAL ──────────────────────────────────────────────────────────────
function ExportModal({ users, trainings, fyList, currentFY, onClose }) {
  const [selFYs, setSelFYs] = useState([currentFY]); const [exporting, setExporting] = useState(false);
  const tog = fy => setSelFYs(p => p.includes(fy) ? p.filter(f => f !== fy) : [...p, fy]);

  const doExport = () => {
    setExporting(true);
    try {
      const XLSX = window.XLSX || (() => { throw new Error("XLSX not loaded"); })();
      const wb = XLSX.utils.book_new();
      const members = users.filter(u => u.role === "member");

      const s1 = [
        ["TrainTrack — Team Performance Report"],
        [`Generated: ${new Date().toLocaleDateString("en-IN")}`], [""],
        ["Member", ...selFYs.map(fy => `FY ${fy} Done/Total`), ...selFYs.map(fy => `FY ${fy} %`), "Overall Status"],
      ];
      members.forEach(u => {
        const row = [u.name];
        selFYs.forEach(fy => { const ut = trainings.filter(t => t.userId === u.id && t.fy === fy); const tU = ut.reduce((s, t) => s + getUnits(t).total, 0); const dU = ut.reduce((s, t) => s + getUnits(t).done, 0); row.push(`${dU}/${tU}`); });
        selFYs.forEach(fy => { const ut = trainings.filter(t => t.userId === u.id && t.fy === fy); const tU = ut.reduce((s, t) => s + getUnits(t).total, 0); const dU = ut.reduce((s, t) => s + getUnits(t).done, 0); row.push(tU ? `${Math.round(dU / tU * 100)}%` : "N/A"); });
        const fyT = trainings.filter(t => selFYs.includes(t.fy) && t.userId === u.id && getEffStatus(t) !== "discarded");
        const ach = getAchievement(u, fyT);
        row.push(ach ? (ACHIEVEMENT[ach]?.emoji + " " + ACHIEVEMENT[ach]?.label) : "—");
        s1.push(row);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1), "Team Summary");

      const s2 = [["Member", "Training", "FY", "Type", "Part", "Status", "Due Date", "Completed Date", "Notes Preview"]];
      trainings.filter(t => selFYs.includes(t.fy)).forEach(t => {
        const u = users.find(x => x.id === t.userId);
        if (hasParts(t)) t.parts.forEach((p, pi) => s2.push([u?.name || "", t.title, t.fy, "Multi-Part", `Part ${pi + 1}: ${p.title}`, p.status === "completed" ? "Completed" : "Pending", t.dueDate || "", p.completedDate || "", (p.notes || "").substring(0, 100)]));
        else { const s = getEffStatus(t); s2.push([u?.name || "", t.title, t.fy, "Single", "—", s === "completed" ? "Completed" : s === "discarded" ? "Discarded" : isOverdue(t.dueDate) ? "Overdue" : "Pending", t.dueDate || "", t.completedDate || "", (t.notes || "").substring(0, 100)]); }
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s2), "Training Details");

      const s3 = [["Member", "Training", "FY", "Part", "Completed Date", "Key Learnings", "Outcome Links"]];
      trainings.filter(t => selFYs.includes(t.fy)).forEach(t => {
        const u = users.find(x => x.id === t.userId);
        if (hasParts(t)) t.parts.filter(p => p.status === "completed").forEach((p, pi) => s3.push([u?.name || "", t.title, t.fy, `Part ${pi + 1}: ${p.title}`, p.completedDate || "", p.notes || "", cleanLinks(p.outcomes).map(l => l.url).join(" | ")]));
        else if (t.status === "completed") s3.push([u?.name || "", t.title, t.fy, "", t.completedDate || "", t.notes || "", cleanLinks(t.outcomes).map(l => l.url).join(" | ")]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s3), "Learnings & Notes");

      XLSX.writeFile(wb, `TrainTrack_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) { console.error("Export error:", e); }
    setExporting(false); onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <ModalContent size="md">
        <DialogHeader>
          <DialogTitle>📊 Export Management Report</DialogTitle>
          <DialogDescription>Download a multi-sheet Excel report for management review.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Select Financial Years to include <span className="text-rose-500">*</span></Label>
          <div className="space-y-2">
            {fyList.map(fy => (
              <label key={fy} className={cn("flex items-center gap-2.5 cursor-pointer px-3.5 py-2.5 rounded-lg border transition", selFYs.includes(fy) ? "bg-indigo-50 border-indigo-200" : "bg-muted/50 border-border")}>
                <Checkbox checked={selFYs.includes(fy)} onCheckedChange={() => tog(fy)} />
                <span className={cn("text-[13px] font-semibold", selFYs.includes(fy) ? "text-indigo-700" : "")}>FY {fy}</span>
                <span className="text-xs text-muted-foreground ml-auto">{trainings.filter(t => t.fy === fy).length} trainings</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-[13px] text-emerald-700">
          📄 The Excel file will have 3 sheets:
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
  const [users, setUsers] = useState([]); const [trainings, setTrainings] = useState([]); const [catalog, setCatalog] = useState([]);
  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS); const [currentFY, setCurrentFY] = useState(getFY());
  const [currentUser, setCurrent] = useState(null); const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [completeTarget, setCompleteT] = useState(null); const [addModal, setAdd] = useState(false);
  const [detailTarget, setDetailT] = useState(null); const [exportOpen, setExportOpen] = useState(false);
  const [fyFilterD, setFyFilterD] = useState(getFY()); const [fyFilterM, setFyFilterM] = useState(getFY());
  const [catalogNewSignal, setCatalogNewSignal] = useState(0);

  useEffect(() => {
    if (!window.XLSX) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      document.head.appendChild(s);
    }
    if (!document.getElementById("tt-compat-css")) {
      const st = document.createElement("style");
      st.id = "tt-compat-css";
      st.textContent = `/* Font sizes */
.text-\[8px\]{font-size:8px;line-height:1}
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
/* Widths / heights */
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
/* Flex ratios */
.flex-\[2\]{flex:2 2 0%}
.flex-\[1\.4\]{flex:1.4 1.4 0%}
/* Misc */
.tracking-\[0\.3em\]{letter-spacing:0.3em}
.brightness-\[0\.98\]:hover{filter:brightness(0.98)}
/* Prevent icon clipping/misalignment: lucide SVGs stay block-level and never shrink */
svg.lucide{display:block;flex-shrink:0}
/* line-clamp fallback (in case the utility isn't compiled) */
.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
`;
      document.head.appendChild(st);
    }
  }, []);

  useEffect(() => {
    (async () => {
      let u = await S.get("tms:users"); let t = await S.get("tms:trainings"); let c = await S.get("tms:catalog"); let st = await S.get("tms:settings");
      // Seed ONLY what's missing — never wipe existing data on load.
      if (!u) { u = [DEFAULT_SUPERVISOR]; await S.set("tms:users", u); }
      if (!t) { t = []; await S.set("tms:trainings", t); }
      if (!c) { c = mkDefaultCatalog(); await S.set("tms:catalog", c); }
      else {
        // Migrate old catalog shape forward (string[] / defaultParts) without losing anything.
        const migrated = normCatalog(c);
        if (JSON.stringify(migrated) !== JSON.stringify(c)) { c = migrated; await S.set("tms:catalog", c); }
        else c = migrated;
      }
      if (!st) { st = { ...DEFAULT_SETTINGS, currentFY: getFY() }; await S.set("tms:settings", st); }
      setUsers(u); setTrainings(t); setCatalog(normCatalog(c));
      setAppSettings({ pendingReminderDays: st.pendingReminderDays ?? 7, overdueReminderDays: st.overdueReminderDays ?? 3 });
      const fy = st.currentFY || getFY(); setCurrentFY(fy); setFyFilterD(fy); setFyFilterM(fy);
      setLoading(false);
    })();
  }, []);

  const saveT = async t => { setTrainings(t); await S.set("tms:trainings", t); };
  const saveU = async u => { setUsers(u); await S.set("tms:users", u); };
  const saveC = async c => { setCatalog(c); await S.set("tms:catalog", c); };
  const saveSt = async s => { setAppSettings({ pendingReminderDays: s.pendingReminderDays, overdueReminderDays: s.overdueReminderDays }); await S.set("tms:settings", { ...s, currentFY }); };

  const refresh = async () => { setRefreshing(true); const u = await S.get("tms:users"); const t = await S.get("tms:trainings"); const c = await S.get("tms:catalog"); if (u) setUsers(u); if (t) setTrainings(t); if (c) setCatalog(normCatalog(c)); setTimeout(() => setRefreshing(false), 400); };
  const login = u => { setCurrent(u); setTab(u.role === "supervisor" ? "dashboard" : "my-trainings"); };
  const logout = () => setCurrent(null);
  const updateUser = async upd => { const u = users.map(x => x.id === upd.id ? upd : x); await saveU(u); };

  const markComplete = async (trainingId, partId, data) => {
    const updated = trainings.map(t => {
      if (t.id !== trainingId) return t;
      if (!partId) return { ...t, status: "completed", completedDate: today(), notes: data.notes, outcomes: data.outcomes };
      const updParts = t.parts.map(p => p.id === partId ? { ...p, status: "completed", completedDate: today(), notes: data.notes, outcomes: data.outcomes } : p);
      const allDone = updParts.every(p => p.status === "completed");
      return { ...t, parts: updParts, status: allDone ? "completed" : "in-progress", completedDate: allDone ? today() : null };
    });
    await saveT(updated); setCompleteT(null);
  };

  const addTraining = async (batch) => {
    const list = Array.isArray(batch) ? batch : [batch];
    const newOnes = list.map((a, i) => ({
      id: uid("t") + i, userId: a.userId, catId: a.catId || null, title: a.title,
      fy: currentFY, assignedDate: today(), dueDate: a.dueDate || null,
      status: "pending", completedDate: null, notes: null, outcomes: [],
      resources: a.resources || [], parts: a.parts || [], lastReminderSent: null,
    }));
    await saveT([...trainings, ...newOnes]); setAdd(false);
  };

  const markReminded = async ids => { await saveT(trainings.map(t => ids.includes(t.id) ? { ...t, lastReminderSent: today() } : t)); };

  const finalizeYear = async decisions => {
    const nfy = nextFY(currentFY); let upd = [...trainings];
    decisions.forEach(({ id, action }) => {
      const idx = upd.findIndex(t => t.id === id); if (idx === -1) return;
      const orig = upd[idx]; upd[idx] = { ...orig, status: "discarded" };
      if (action === "carry") upd.push({ ...orig, id: uid("t"), fy: nfy, status: "pending", dueDate: null, assignedDate: today(), lastReminderSent: null, carriedFromFy: currentFY, notes: null, outcomes: [], completedDate: null, parts: (orig.parts || []).map(p => ({ ...p, status: "pending", completedDate: null, notes: null, outcomes: [] })) });
    });
    await saveT(upd); setCurrentFY(nfy); setFyFilterD(nfy); setFyFilterM(nfy); await S.set("tms:settings", { ...appSettings, currentFY: nfy });
  };

  const resetData = async () => {
    const fu = [DEFAULT_SUPERVISOR], ft = [], fc = mkDefaultCatalog(), fs = { ...DEFAULT_SETTINGS, currentFY: getFY() };
    await S.set("tms:users", fu); await S.set("tms:trainings", ft); await S.set("tms:catalog", fc); await S.set("tms:settings", fs);
    setUsers(fu); setTrainings(ft); setCatalog(fc); setAppSettings(DEFAULT_SETTINGS); setCurrentFY(fs.currentFY); setFyFilterD(fs.currentFY); setFyFilterM(fs.currentFY); setCurrent(null);
  };

  const goToCatalogNew = () => { setAdd(false); setTab("catalog"); setCatalogNewSignal(x => x + 1); };

  if (loading) return <div className="flex items-center justify-center h-screen bg-background text-muted-foreground text-sm">Loading…</div>;
  if (!currentUser) return <LoginScreen users={users} onLogin={login} onUpdateUser={updateUser} />;

  const myT = trainings.filter(t => t.userId === currentUser.id);
  const myAFY = myT.filter(t => t.fy === currentFY && getEffStatus(t) !== "discarded");
  const myDone = myAFY.reduce((s, t) => s + getUnits(t).done, 0);
  const myTotal = myAFY.reduce((s, t) => s + getUnits(t).total, 0);
  const allFYs = [...new Set([currentFY, ...trainings.map(t => t.fy)])].filter(Boolean).sort().reverse();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar user={currentUser} tab={tab} setTab={setTab} onLogout={logout} myDone={myDone} myTotal={myTotal} trainings={trainings} currentFY={currentFY} />
      <main className="flex-1 overflow-auto p-8">
        {tab === "dashboard" && currentUser.role === "supervisor" && <Dashboard users={users} trainings={trainings} onAdd={() => setAdd(true)} onRefresh={refresh} refreshing={refreshing} fyList={allFYs} fyFilter={fyFilterD} setFyFilter={setFyFilterD} onExport={() => setExportOpen(true)} onDetail={(t, p) => setDetailT({ training: t, part: p })} />}
        {tab === "my-trainings" && <MyTrainings trainings={myT} onComplete={(t, p) => setCompleteT({ training: t, part: p })} onDetail={(t, p) => setDetailT({ training: t, part: p })} fyList={allFYs} fyFilter={fyFilterM} setFyFilter={setFyFilterM} />}
        {tab === "knowledge-hub" && <KnowledgeHub trainings={trainings} users={users} onDetail={(t, p) => setDetailT({ training: t, part: p })} />}
        {tab === "catalog" && currentUser.role === "supervisor" && <CatalogManager catalog={catalog} trainings={trainings} onSave={saveC} openNew={catalogNewSignal} />}
        {tab === "reminders" && currentUser.role === "supervisor" && <Reminders users={users} trainings={trainings} settings={appSettings} onSaveSettings={saveSt} onMarkReminded={markReminded} />}
        {tab === "settings" && currentUser.role === "supervisor" && <Settings users={users} trainings={trainings} currentFY={currentFY} onSaveUsers={saveU} onReset={resetData} onFinalizeYear={finalizeYear} />}
      </main>
      {detailTarget && <DetailModal training={detailTarget.training} users={users} onClose={() => setDetailT(null)} />}
      {completeTarget && <CompleteModal training={completeTarget.training} part={completeTarget.part} onSubmit={markComplete} onClose={() => setCompleteT(null)} />}
      {addModal && <AssignModal users={users} catalog={catalog} currentFY={currentFY} onSubmit={addTraining} onClose={() => setAdd(false)} onGoToCatalog={goToCatalogNew} />}
      {exportOpen && <ExportModal users={users} trainings={trainings} fyList={allFYs} currentFY={currentFY} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
