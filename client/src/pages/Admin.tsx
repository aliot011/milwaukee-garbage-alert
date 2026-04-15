import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Pencil, Trash2, X, Check } from "lucide-react";

interface Subscriber {
  userId: string;
  phone: string;
  email: string | null;
  emailVerified: boolean;
  subscriptionId: string;
  address: {
    laddr: string;
    sdir: string;
    sname: string;
    stype: string;
    faddr: string;
  };
  status: string;
  verified: boolean;
  consent: {
    consentChecked: boolean;
    sourceUrl: string;
    submittedAt: string;
    confirmedAt: string | null;
  };
  notifyHour: number;
  awaitingTimePref: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
  createdAt: string;
  updatedAt: string;
}

type EditForm = {
  phone: string;
  email: string;
  emailVerified: boolean;
  status: string;
  verified: boolean;
  notifyHour: number;
  awaitingTimePref: boolean;
  emailAlerts: boolean;
  smsAlerts: boolean;
};

function formatHour(h: number) {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
}

interface MissedPickupReport {
  id: string;
  subscriptionId: string;
  faddr: string;
  reportedAt: string;
}

type Tab = "subscribers" | "missed-pickups";

export default function Admin() {
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") || "";

  const [tab, setTab] = useState<Tab>("subscribers");

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Subscriber | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ subscriptionId: string; userId: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [reports, setReports] = useState<MissedPickupReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/subscribers", { headers: authHeaders });
      if (res.status === 401) { navigate("/admin/login"); return; }
      if (!res.ok) throw new Error("Failed to load");
      setSubscribers(await res.json());
    } catch {
      setError("Failed to load subscribers.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError("");
    try {
      const res = await fetch("/api/admin/missed-pickup-reports", { headers: authHeaders });
      if (res.status === 401) { navigate("/admin/login"); return; }
      if (!res.ok) throw new Error("Failed to load");
      setReports(await res.json());
    } catch {
      setReportsError("Failed to load missed pickup reports.");
    } finally {
      setReportsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) { navigate("/admin/login"); return; }
    load();
  }, [token, load, navigate]);

  useEffect(() => {
    if (tab === "missed-pickups") loadReports();
  }, [tab, loadReports]);

  function openEdit(sub: Subscriber) {
    setEditing(sub);
    setEditForm({
      phone: sub.phone,
      email: sub.email ?? "",
      emailVerified: sub.emailVerified,
      status: sub.status,
      verified: sub.verified,
      notifyHour: sub.notifyHour,
      awaitingTimePref: sub.awaitingTimePref,
      emailAlerts: sub.emailAlerts,
      smsAlerts: sub.smsAlerts,
    });
  }

  async function saveEdit() {
    if (!editing || !editForm) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/subscribers/${editing.subscriptionId}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          userId: editing.userId,
          phone: editForm.phone,
          email: editForm.email || null,
          emailVerified: editForm.emailVerified,
          status: editForm.status,
          verified: editForm.verified,
          notifyHour: editForm.notifyHour,
          awaitingTimePref: editForm.awaitingTimePref,
          emailAlerts: editForm.emailAlerts,
          smsAlerts: editForm.smsAlerts,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEditing(null);
      setEditForm(null);
      await load();
    } catch {
      alert("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/subscribers/${deleteTarget.subscriptionId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Delete failed");
      setDeleteTarget(null);
      await load();
    } catch {
      alert("Delete failed. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function logout() {
    localStorage.removeItem("admin_token");
    navigate("/admin/login");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">MKE Garbage Alert — Admin</h1>
          <p className="text-sm opacity-75">{subscribers.length} subscriber{subscribers.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <nav className="flex gap-1">
          {([ ["subscribers", "Subscribers"], ["missed-pickups", "Missed Pickups"] ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-amber-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main className="p-6">
        {/* Subscribers tab */}
        {tab === "subscribers" && (
          <>
            {loading && (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {error && <p className="text-red-600 font-medium">{error}</p>}
            {!loading && !error && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Phone","Email","Email Verified","Address","Status","Verified","Notify Hour","Email Alerts","SMS Alerts","Awaiting Time Pref","Consent Source","Subscribed","Updated","Actions"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub, i) => (
                      <tr key={sub.subscriptionId} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="px-3 py-2 whitespace-nowrap font-mono">{sub.phone}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{sub.email ?? <span className="text-muted-foreground italic">none</span>}</td>
                        <td className="px-3 py-2 text-center">{sub.emailVerified ? <Check className="w-4 h-4 text-green-600 inline" /> : <X className="w-4 h-4 text-muted-foreground inline" />}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{sub.address.faddr}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            sub.status === "active" ? "bg-green-100 text-green-800"
                            : sub.status === "pending_confirm" ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-600"
                          }`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">{sub.verified ? <Check className="w-4 h-4 text-green-600 inline" /> : <X className="w-4 h-4 text-muted-foreground inline" />}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatHour(sub.notifyHour)}</td>
                        <td className="px-3 py-2 text-center">{sub.emailAlerts ? <Check className="w-4 h-4 text-green-600 inline" /> : <X className="w-4 h-4 text-muted-foreground inline" />}</td>
                        <td className="px-3 py-2 text-center">{sub.smsAlerts ? <Check className="w-4 h-4 text-green-600 inline" /> : <X className="w-4 h-4 text-muted-foreground inline" />}</td>
                        <td className="px-3 py-2 text-center">{sub.awaitingTimePref ? <Check className="w-4 h-4 text-amber-500 inline" /> : <X className="w-4 h-4 text-muted-foreground inline" />}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate text-muted-foreground text-xs" title={sub.consent.sourceUrl}>{sub.consent.sourceUrl}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{new Date(sub.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">{new Date(sub.updatedAt).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(sub)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ subscriptionId: sub.subscriptionId, userId: sub.userId, label: sub.address.faddr })}
                              className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors"
                              title="Delete subscription"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {subscribers.length === 0 && (
                      <tr>
                        <td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">No subscribers yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Missed Pickups tab */}
        {tab === "missed-pickups" && (
          <>
            {reportsLoading && (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {reportsError && <p className="text-red-600 font-medium">{reportsError}</p>}
            {!reportsLoading && !reportsError && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Address", "Reported At", "Subscription ID"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r, i) => (
                      <tr key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{r.faddr}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(r.reportedAt).toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-muted-foreground">{r.subscriptionId}</td>
                      </tr>
                    ))}
                    {reports.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No missed pickup reports yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {/* Edit Modal */}
      {editing && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Edit Subscriber</h2>
              <button onClick={() => { setEditing(null); setEditForm(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground font-mono">{editing.address.faddr}</p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </Field>

              <Field label="Status">
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="active">active</option>
                  <option value="pending_confirm">pending_confirm</option>
                  <option value="unsubscribed">unsubscribed</option>
                </select>
              </Field>

              <Field label="Notify Hour">
                <select
                  value={editForm.notifyHour}
                  onChange={(e) => setEditForm({ ...editForm, notifyHour: Number(e.target.value) })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{formatHour(i)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Email Verified", "emailVerified"],
                  ["Subscription Verified", "verified"],
                  ["Email Alerts", "emailAlerts"],
                  ["SMS Alerts", "smsAlerts"],
                  ["Awaiting Time Pref", "awaitingTimePref"],
                ] as [string, keyof EditForm][]
              ).map(([label, key]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm[key] as boolean}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                    className="w-4 h-4 rounded accent-amber-500"
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setEditing(null); setEditForm(null); }}
                className="px-4 py-2 rounded-full text-sm font-medium border border-input hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 rounded-full text-sm font-semibold text-amber-900 bg-amber-400 hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Delete Subscription?</h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the subscription for <strong>{deleteTarget.label}</strong>. The user record will remain unless you delete it separately.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-full text-sm font-medium border border-input hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-full text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
