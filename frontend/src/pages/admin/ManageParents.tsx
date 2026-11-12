import React, { useEffect, useMemo, useState } from "react";
import { Users, Plus, Edit, Trash2, Search, UserCog, UserPlus, Contact, Phone, Mail, LockKeyhole, GraduationCap, Download, Link2Off, Wallet, X } from "lucide-react";
import FormModal, { ChoiceCards, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { displayName, kes } from "@/lib/text";
import { Avatar, PersonCell, SortHeader, TablePager, nextSort, type Sort } from "@/components/page/DataTable";

type ParentView = "all" | "linked" | "unlinked" | "noemail";
type SortKey = "name" | "children" | "wallets";
type SortState = Sort<SortKey>;
const PAGE_SIZE = 25;

const emptyParent = { name: "", phone: "", email: "", password: "", studentIds: [] as string[] };

const ManageParents: React.FC = () => {
  const [parents, setParents] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [parentForm, setParentForm] = useState(emptyParent);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkQuery, setLinkQuery] = useState("");


  const fetchData = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([API.get("/parents"), API.get("/students")]);
      setParents(p.data);
      setStudents(s.data);
    } catch (e: any) {
      toast.error("Failed to load parents", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setParentForm(emptyParent);
  };

  const saveParent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...parentForm, studentIds: parentForm.studentIds };
      if (editId) {
        const body: any = { name: payload.name, phone: payload.phone, email: payload.email, studentIds: payload.studentIds };
        if (payload.password) body.password = payload.password;
        await API.put(`/parents/${editId}`, body);
      } else {
        await API.post("/parents", payload);
      }
      toast.success(editId ? "Updated" : "Added");
      closeForm();
      fetchData();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const editParent = (p: any) => {
    setEditId(p._id || p.id);
    setParentForm({
      name: p.name, phone: p.phone || "", email: p.email || "", password: "",
      studentIds: (p.students || []).map((s: any) => s.id),
    });
    setShowForm(true);
  };

  const deleteParent = async (id: string) => {
    const r = await toast.confirm("Delete parent?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/parents/${id}`);
    fetchData();
  };

  const toggleParentStudent = (studentId: string) => {
    setParentForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(studentId)
        ? f.studentIds.filter((id) => id !== studentId)
        : [...f.studentIds, studentId],
    }));
  };

  // ── Table state: filter view, sort, page ──
  const [view, setView] = useState<ParentView>("all");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);

  /** Children's balances come from the students list the page already loads (for linking). */
  const balanceById = useMemo(() => new Map(students.map((s) => [s._id || s.id, Number(s.walletBalance || 0)])), [students]);
  const walletsOf = (p: any) => (p.students || []).reduce((sum: number, s: any) => sum + (balanceById.get(s.id) ?? 0), 0);

  const stats = useMemo(() => {
    const linked = parents.filter((p) => (p.students || []).length > 0);
    return {
      parents: parents.length,
      withEmail: parents.filter((p) => p.email).length,
      children: parents.reduce((n, p) => n + (p.students || []).length, 0),
      multi: parents.filter((p) => (p.students || []).length >= 2).length,
      unlinked: parents.length - linked.length,
      wallets: linked.reduce((sum, p) => sum + walletsOf(p), 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parents, balanceById]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = parents.filter((p) => {
      const kids = p.students || [];
      if (view === "linked" && kids.length === 0) return false;
      if (view === "unlinked" && kids.length > 0) return false;
      if (view === "noemail" && p.email) return false;
      if (!q) return true;
      const linked = kids.map((s: any) => `${s.name || ""} ${s.regNo || ""}`).join(" ");
      return [p.name, p.phone, p.email, linked].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sort.key === "children") return ((a.students || []).length - (b.students || []).length) * dir;
      if (sort.key === "wallets") return (walletsOf(a) - walletsOf(b)) * dir;
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }) * dir;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parents, searchQuery, view, sort, balanceById]);

  useEffect(() => setPage(1), [searchQuery, view, sort]);
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) =>
    setSort((s) => nextSort(s, key, ["name"]));

  /** Downloads the parents currently shown (after search and filter) as CSV. */
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Parent", "Phone", "Email", "Children", "Admission numbers", "Children's wallets (KES)"].map(esc).join(","),
      ...visible.map((p) =>
        [
          displayName(p.name),
          p.phone || "",
          p.email || "",
          (p.students || []).map((s: any) => displayName(s.name)).join("; "),
          (p.students || []).map((s: any) => s.regNo).join("; "),
          Math.round(walletsOf(p)),
        ].map(esc).join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `parents-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={Users}
        eyebrow="Management"
        title="Parents"
        subtitle="Parent accounts, their contact details and the children they can top up"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={visible.length === 0}>
              <Download size={16} /> Export
            </button>
            <button type="button" className="btn btn-primary" onClick={() => { closeForm(); setShowForm(true); }}>
              <Plus size={16} /> Add parent
            </button>
          </>
        }
      />

      <StatTiles cols={4}>
        <StatTile label="Parents" value={stats.parents.toLocaleString()} hint={`${stats.withEmail} with an email address`} icon={Users} tone="navy" />
        <StatTile label="Linked children" value={stats.children.toLocaleString()} hint={`${stats.multi} parents with 2 or more`} icon={GraduationCap} tone="teal" />
        <StatTile label="No child linked" value={stats.unlinked.toLocaleString()} hint={stats.unlinked ? "Can't top up anyone yet" : "Every parent is linked"} icon={Link2Off} tone={stats.unlinked ? "gold" : "green"} />
        <StatTile label="Children's wallets" value={kes(stats.wallets)} hint="Combined balance of linked children" icon={Wallet} tone="green" />
      </StatTiles>

      <section className="dt">
        <div className="dt-toolbar">
          <label className="dt-search">
            <Search size={16} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, phone, email, child or admission no." aria-label="Search parents" />
            {searchQuery && (
              <button type="button" className="dt-icon" style={{ width: 26, height: 26 }} onClick={() => setSearchQuery("")} aria-label="Clear search"><X size={14} /></button>
            )}
          </label>
          <Segmented
            label="Filter parents"
            value={view}
            options={[
              { value: "all", label: `All ${stats.parents}` },
              { value: "linked", label: "Linked" },
              { value: "unlinked", label: `Not linked ${stats.unlinked}` },
              { value: "noemail", label: "No email" },
            ]}
            onChange={setView}
          />
          <span className="dt-count">
            {visible.length === parents.length ? `${parents.length.toLocaleString()} parents` : `${visible.length.toLocaleString()} of ${parents.length.toLocaleString()}`}
          </span>
        </div>

        {loading ? (
          <Loader size="sm" title="Loading parents..." subtitle="Fetching parent accounts" className="py-10" />
        ) : visible.length === 0 ? (
          <div className="dt-empty">
            <b>{parents.length === 0 ? "No parents yet" : "No parents match"}</b>
            {parents.length === 0 ? "Add a parent to link them to their children." : "Try another search or filter."}
          </div>
        ) : (
          <>
            <div className="dt-scroll">
              <table>
                <thead>
                  <tr>
                    <th><SortHeader label="Parent" k="name" sort={sort} onSort={toggleSort} /></th>
                    <th>Phone</th>
                    <th className="hide-sm">Email</th>
                    <th><SortHeader label="Children" k="children" sort={sort} onSort={toggleSort} /></th>
                    <th className="num"><SortHeader label="Wallets" k="wallets" sort={sort} onSort={toggleSort} /></th>
                    <th className="act">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => {
                    const kids: any[] = p.students || [];
                    return (
                      <tr key={p._id || p.id} className="click" onClick={() => editParent(p)}>
                        <td>
                          <PersonCell
                            name={p.name}
                            sub={p.createdAt ? `Added ${new Date(p.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}` : "Parent account"}
                          />
                        </td>
                        <td>
                          {p.phone ? (
                            <a className="dt-mono" href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()}>{p.phone}</a>
                          ) : (
                            <span className="dt-muted">—</span>
                          )}
                        </td>
                        <td className="hide-sm">
                          {p.email ? <span className="dt-muted" style={{ color: "var(--ink-2)" }}>{p.email}</span> : <span className="pill pill-gray">No email</span>}
                        </td>
                        <td>
                          {kids.length === 0 ? (
                            <span className="pill pill-amber"><span className="dot" />Not linked</span>
                          ) : (
                            <div className="dt-chips">
                              {kids.slice(0, 2).map((s) => {
                                return (
                                  <span key={s.id} className="dt-chip" title={`${displayName(s.name)} · ${s.regNo}`}>
                                    <Avatar name={s.name} size="sm" />
                                    <b>{displayName(s.name)}</b>
                                    <small>{s.regNo}</small>
                                  </span>
                                );
                              })}
                              {kids.length > 2 && <span className="dt-chip" style={{ paddingLeft: 10 }}>+{kids.length - 2} more</span>}
                            </div>
                          )}
                        </td>
                        <td className="num">
                          {kids.length ? <span className="dt-amount">{kes(walletsOf(p))}</span> : <span className="dt-muted">—</span>}
                        </td>
                        <td className="act" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="dt-icon" title="Edit parent" aria-label={`Edit ${p.name}`} onClick={() => editParent(p)}><Edit size={16} /></button>
                          <button type="button" className="dt-icon danger" title="Delete parent" aria-label={`Delete ${p.name}`} onClick={() => deleteParent(p._id || p.id)}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePager page={page} pageSize={PAGE_SIZE} total={visible.length} onPage={setPage} label="parents" />
          </>
        )}
      </section>

      {showForm && (
        <FormModal
          icon={editId ? UserCog : UserPlus}
          title={editId ? "Edit parent" : "Add a parent"}
          subtitle={editId ? "Update the parent's details and linked students." : "Create a parent account and link their children."}
          steps={[
            { id: "details", label: "Details", done: !!parentForm.name.trim() && !!parentForm.phone.trim() },
            { id: "login", label: "Login", done: !!editId || parentForm.password.length >= 7 },
            { id: "students", label: "Students", done: parentForm.studentIds.length > 0 },
          ]}
          statusLabel={editId ? "Editing parent" : "New parent"}
          statusDetail={parentForm.name}
          submitLabel={editId ? "Save changes" : "Add parent"}
          onClose={closeForm}
          onSubmit={saveParent}
        >
          <FormSection id="details" icon={Contact} title="Details">
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="pa-name" required>Full name</FieldLabel>
                <input id="pa-name" className="input" placeholder="e.g. Jane Wanjiku" value={parentForm.name} onChange={(e) => setParentForm({ ...parentForm, name: e.target.value })} required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="pa-phone" required>Phone number</FieldLabel>
                <div className="input-icon">
                  <input id="pa-phone" className="input" placeholder="0712 345 678" value={parentForm.phone} onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })} required />
                  <Phone />
                </div>
              </div>
            </div>
            <div className="field">
              <FieldLabel htmlFor="pa-email" hint="Optional">Email</FieldLabel>
              <div className="input-icon">
                <input id="pa-email" type="email" className="input" placeholder="e.g. jane@example.com" value={parentForm.email} onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })} />
                <Mail />
              </div>
            </div>
          </FormSection>

          <FormSection id="login" icon={LockKeyhole} title="Login">
            <div className="field">
              <FieldLabel htmlFor="pa-pass" required={!editId} hint={editId ? "Leave blank to keep" : "At least 7 characters"}>
                {editId ? "New password" : "Password"}
              </FieldLabel>
              <input id="pa-pass" type="password" className="input" autoComplete="new-password" value={parentForm.password} onChange={(e) => setParentForm({ ...parentForm, password: e.target.value })} required={!editId} minLength={7} />
            </div>
          </FormSection>

          <FormSection id="students" icon={GraduationCap} title="Linked students">
            <div className="field">
              <FieldLabel hint={`${parentForm.studentIds.length} selected`}>Children</FieldLabel>
              <div className="input-icon">
                <input className="input" placeholder="Search by name or admission no." value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} />
                <Search />
              </div>
            </div>
            {students.length === 0 ? (
              <p className="fm-note">Add students first.</p>
            ) : (
              <div className="fm-cards-scroll">
                <ChoiceCards
                  label="Linked students"
                  multiple
                  columns={2}
                  options={students
                    .filter((s) => {
                      const id = s._id || s.id;
                      const q = linkQuery.trim().toLowerCase();
                      return parentForm.studentIds.includes(id) || !q || `${s.name} ${s.regNo}`.toLowerCase().includes(q);
                    })
                    .map((s) => ({ value: s._id || s.id, label: s.name, sub: s.regNo }))}
                  selected={parentForm.studentIds}
                  onToggle={toggleParentStudent}
                />
              </div>
            )}
          </FormSection>
        </FormModal>
      )}
    </div>
  );
};

export default ManageParents;
