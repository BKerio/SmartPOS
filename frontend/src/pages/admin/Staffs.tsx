import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Edit, Trash2, Fingerprint, Search, UserCog, UserPlus, Contact, Mail, Phone, ShieldCheck, LockKeyhole, UtensilsCrossed } from "lucide-react";
import FormModal, { ChoiceCards, ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import {
  captureFingerprint,
  checkScannerHealth,
  prepareScanner,
  checkStaffFingerprintDuplicate,
} from "@/services/fingerprintScanner";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { PersonCell } from "@/components/page/DataTable";
import { displayName } from "@/lib/text";
import { ROLE_LABELS } from "@/components/layout/navigation";

type StaffRole = "admin" | "finance" | "restaurant";
type StaffStatus = "approved" | "pending" | "rejected";

type StaffRow = {
  id: string;
  _id?: string;
  name: string;
  email: string;
  phone?: string | null;
  role: StaffRole;
  status: StaffStatus;
  hasFingerprint?: boolean;
};

const emptyStaff = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "restaurant" as StaffRole,
  status: "approved" as StaffStatus,
  fingerprintTemplate: "",
  hasFingerprint: false,
};


const roleLabel = (role: string) =>
  role === "restaurant" ? "Restaurant" : role === "finance" ? "Finance" : role === "admin" ? "Admin" : role;

const Staffs = () => {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  const [capturingFingerprint, setCapturingFingerprint] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | StaffRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StaffStatus>("all");
  const [fingerprintFilter, setFingerprintFilter] = useState<"all" | "enrolled" | "none">("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await API.get<StaffRow[]>("/users");
      setStaff(data);
    } catch (e: any) {
      toast.error("Failed to load staff", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!showForm) return;
    checkScannerHealth()
      .then((h) => setScannerReady(Boolean(h.ok && h.deviceConnected)))
      .catch(() => setScannerReady(false));
    prepareScanner().catch(() => {});
  }, [showForm]);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return staff.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (fingerprintFilter === "enrolled" && !u.hasFingerprint) return false;
      if (fingerprintFilter === "none" && u.hasFingerprint) return false;
      if (!q) return true;
      return [u.name, u.email, u.phone, u.role, roleLabel(u.role), u.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [staff, searchQuery, roleFilter, statusFilter, fingerprintFilter]);

  const hasActiveFilters =
    searchQuery !== "" ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    fingerprintFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
    setFingerprintFilter("all");
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setStaffForm(emptyStaff);
  };

  const saveFingerprint = async (userId: string, template: string) => {
    await API.put(`/users/${userId}/fingerprint`, { fingerprintTemplate: template });
  };

  const saveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let userId = editId;
      const body = {
        name: staffForm.name,
        email: staffForm.email,
        phone: staffForm.phone,
        role: staffForm.role,
        status: staffForm.status,
        ...(staffForm.password ? { password: staffForm.password } : {}),
      };

      if (editId) {
        await API.put(`/users/${editId}`, body);
      } else {
        if (!staffForm.password) {
          toast.error("Password required", "Enter a password for the new staff account");
          return;
        }
        const { data } = await API.post("/users", { ...body, password: staffForm.password });
        userId = data._id || data.id;
      }

      if (staffForm.fingerprintTemplate && userId) {
        await saveFingerprint(userId, staffForm.fingerprintTemplate);
      }

      toast.success(editId ? "Staff updated" : "Staff added");
      closeForm();
      fetchData();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const handleCaptureFingerprint = async () => {
    setCapturingFingerprint(true);
    try {
      await prepareScanner();
      const template = await captureFingerprint();
      const check = await checkStaffFingerprintDuplicate(template, editId || undefined, {
        biometric: false,
      });
      if (!check.unique) {
        toast.error("Fingerprint already enrolled", check.message);
        return;
      }
      setStaffForm((f) => ({ ...f, fingerprintTemplate: template, hasFingerprint: true }));
      toast.success("Fingerprint captured", "Save the staff record to store it");
      checkStaffFingerprintDuplicate(template, editId || undefined, { biometric: true }).then((full) => {
        if (!full.unique) {
          setStaffForm((f) => ({ ...f, fingerprintTemplate: "", hasFingerprint: false }));
          toast.error("Fingerprint already enrolled", full.message);
        }
      });
    } catch (err: any) {
      toast.error("Capture failed", err.message);
    } finally {
      setCapturingFingerprint(false);
    }
  };

  const removeStoredFingerprint = async () => {
    if (!editId) return;
    const r = await toast.confirm("Remove the stored fingerprint?", {
      description: "They won't be able to clock in with their finger until it is enrolled again.",
      confirmLabel: "Remove fingerprint",
      tone: "warning",
    });
    if (!r) return;
    try {
      await API.delete(`/users/${editId}/fingerprint`);
      setStaffForm((f) => ({ ...f, fingerprintTemplate: "", hasFingerprint: false }));
      toast.success("Fingerprint removed");
      fetchData();
    } catch (e: any) {
      toast.error("Failed to remove fingerprint", e.response?.data?.message);
    }
  };

  const openAdd = () => {
    closeForm();
    setShowForm(true);
  };

  const editStaffMember = (u: StaffRow) => {
    setEditId(u._id || u.id);
    setStaffForm({
      name: u.name,
      email: u.email,
      phone: u.phone || "",
      password: "",
      role: u.role,
      status: u.status,
      fingerprintTemplate: "",
      hasFingerprint: Boolean(u.hasFingerprint),
    });
    setShowForm(true);
  };

  const deleteStaff = async (id: string) => {
    const person = staff.find((u) => (u._id || u.id) === id);
    const r = await toast.confirm("Delete this staff member?", {
      description: "Their account is removed from SmartPOS. Sales and invoices they recorded stay in the reports.",
      subject: person ? { name: displayName(person.name), detail: [ROLE_LABELS[person.role as keyof typeof ROLE_LABELS] ?? person.role, person.email].filter(Boolean).join(" · ") } : undefined,
      points: ["They can no longer sign in or clock in", "Their attendance history is deleted too"],
      confirmLabel: "Delete staff",
    });
    if (!r) return;
    try {
      await API.delete(`/users/${id}`);
      toast.success("Staff deleted");
      fetchData();
    } catch (e: any) {
      toast.error("Delete failed", e.response?.data?.message);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={Users}
        eyebrow="Management"
        title="Staff"
        subtitle="Restaurant and finance staff, their roles, and fingerprint attendance enrolment"
        actions={<button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add staff</button>}
      />

      <StatTiles cols={4}>
        <StatTile label="Staff" value={staff.length} hint={`${staff.filter((u) => u.status === "approved").length} active`} icon={Users} tone="navy" />
        <StatTile label="Restaurant" value={staff.filter((u) => u.role === "restaurant").length} hint="POS, menu and kitchen" icon={UtensilsCrossed} tone="gold" />
        <StatTile label="Finance & admin" value={staff.filter((u) => u.role === "finance" || u.role === "admin").length} hint="Collections, reports, settings" icon={ShieldCheck} tone="teal" />
        <StatTile label="Fingerprint enrolled" value={`${staff.filter((u) => u.hasFingerprint).length} / ${staff.length}`} hint="Can clock in on the terminal" icon={Fingerprint} tone="green" />
      </StatTiles>

      <section className="dt">
        <div className="dt-toolbar">
          <label className="dt-search">
            <Search size={16} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, email or phone" aria-label="Search staff" />
          </label>
          <Segmented
            label="Role"
            value={roleFilter}
            options={[
              { value: "all", label: "All roles" },
              { value: "restaurant", label: "Restaurant" },
              { value: "finance", label: "Finance" },
              { value: "admin", label: "Admin" },
            ]}
            onChange={setRoleFilter}
          />
          <select className="input" style={{ width: 150, height: 40 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Status">
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
          <select className="input" style={{ width: 170, height: 40 }} value={fingerprintFilter} onChange={(e) => setFingerprintFilter(e.target.value as typeof fingerprintFilter)} aria-label="Fingerprint">
            <option value="all">All fingerprints</option>
            <option value="enrolled">Enrolled</option>
            <option value="none">Not enrolled</option>
          </select>
          {hasActiveFilters && <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>}
          <span className="dt-count">{filteredStaff.length === staff.length ? `${staff.length} staff` : `${filteredStaff.length} of ${staff.length}`}</span>
        </div>

        {loading ? (
          <Loader size="sm" title="Loading staff..." subtitle="Fetching staff accounts" className="py-10" />
        ) : filteredStaff.length === 0 ? (
          <div className="dt-empty">
            <b>{staff.length === 0 ? "No staff yet" : "No staff match"}</b>
            {staff.length === 0 ? "Add a staff member to give them access." : "Try another search or filter."}
          </div>
        ) : (
          <div className="dt-scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role</th>
                  <th className="hide-sm">Phone</th>
                  <th>Fingerprint</th>
                  <th>Status</th>
                  <th className="act">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((u) => (
                  <tr key={u._id || u.id} className="click" onClick={() => editStaffMember(u)}>
                    <td><PersonCell name={u.name} sub={u.email} /></td>
                    <td>
                      <span className={`pill ${u.role === "admin" ? "pill-blue" : u.role === "finance" ? "pill-green" : "pill-gold"}`}>{roleLabel(u.role)}</span>
                    </td>
                    <td className="hide-sm">{u.phone ? <span className="dt-mono">{u.phone}</span> : <span className="dt-muted">—</span>}</td>
                    <td>
                      {u.hasFingerprint ? <span className="pill pill-green"><Fingerprint size={12} /> Enrolled</span> : <span className="pill pill-gray">Not enrolled</span>}
                    </td>
                    <td>
                      <span className={`pill ${u.status === "approved" ? "pill-green" : u.status === "pending" ? "pill-amber" : "pill-red"}`}>
                        <span className="dot" />
                        {u.status === "approved" ? "Active" : u.status === "pending" ? "Pending" : "Rejected"}
                      </span>
                    </td>
                    <td className="act" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="dt-icon" title="Edit" aria-label={`Edit ${u.name}`} onClick={() => editStaffMember(u)}><Edit size={16} /></button>
                      <button type="button" className="dt-icon danger" title="Delete" aria-label={`Delete ${u.name}`} onClick={() => deleteStaff(u._id || u.id)}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <FormModal
          icon={editId ? UserCog : UserPlus}
          title={editId ? "Edit staff member" : "Add a staff member"}
          subtitle={editId ? "Update their details, role and fingerprint." : "Give a restaurant, finance or admin user access to SmartPOS."}
          steps={[
            { id: "details", label: "Details", done: !!staffForm.name.trim() && !!staffForm.email.trim() },
            { id: "role", label: "Role", done: !!staffForm.role },
            { id: "login", label: "Login", done: !!editId || staffForm.password.length >= 7 },
            { id: "fingerprint", label: "Fingerprint", done: !!staffForm.fingerprintTemplate || !!staffForm.hasFingerprint },
          ]}
          statusLabel={editId ? "Editing staff" : "New staff"}
          statusDetail={staffForm.name}
          submitLabel={editId ? "Save changes" : "Add staff"}
          onClose={closeForm}
          onSubmit={saveStaff}
        >
          <FormSection id="details" icon={Contact} title="Details">
            <div className="field">
              <FieldLabel htmlFor="sf-name" required>Full name</FieldLabel>
              <input id="sf-name" className="input" placeholder="e.g. Jane Wanjiku" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required />
            </div>
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="sf-email" required>Email</FieldLabel>
                <div className="input-icon">
                  <input id="sf-email" type="email" className="input" placeholder="e.g. jane@example.com" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} required />
                  <Mail />
                </div>
              </div>
              <div className="field">
                <FieldLabel htmlFor="sf-phone" hint="Optional">Phone number</FieldLabel>
                <div className="input-icon">
                  <input id="sf-phone" className="input" placeholder="0712 345 678" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
                  <Phone />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection id="role" icon={ShieldCheck} title="Role & status">
            <div className="field">
              <FieldLabel required>Role</FieldLabel>
              <ChoiceCards
                label="Role"
                columns={3}
                options={[
                  { value: "restaurant", label: "Restaurant", sub: "POS, menu, kitchen", tile: "RS" },
                  { value: "finance", label: "Finance", sub: "Collections, expenses", tile: "FN" },
                  { value: "admin", label: "Administrator", sub: "Full access", tile: "AD" },
                ]}
                selected={[staffForm.role]}
                onToggle={(v) => setStaffForm({ ...staffForm, role: v as StaffRole })}
              />
              {staffForm.role === "admin" && (
                <p className="fm-note" style={{ color: "var(--amber)" }}>Admins can manage staff, students, finances, settings and approvals.</p>
              )}
            </div>
            <div className="field">
              <FieldLabel>Status</FieldLabel>
              <ChoicePills
                label="Status"
                value={staffForm.status}
                options={[
                  { value: "approved" as StaffStatus, label: "Approved" },
                  { value: "pending" as StaffStatus, label: "Pending" },
                  { value: "rejected" as StaffStatus, label: "Rejected" },
                ]}
                onChange={(v) => setStaffForm({ ...staffForm, status: v })}
              />
            </div>
          </FormSection>

          <FormSection id="login" icon={LockKeyhole} title="Login">
            <div className="field">
              <FieldLabel htmlFor="sf-pass" required={!editId} hint={editId ? "Leave blank to keep" : "At least 7 characters"}>
                {editId ? "New password" : "Password"}
              </FieldLabel>
              <input id="sf-pass" type="password" className="input" autoComplete="new-password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required={!editId} minLength={7} />
            </div>
          </FormSection>

          <FormSection id="fingerprint" icon={Fingerprint} title="Fingerprint (attendance)">
            <div className="fm-label-row">
              <span className="fm-label">Scanner</span>
              {scannerReady === true && <span className="pill pill-green"><span className="dot" />Connected</span>}
              {scannerReady === false && <span className="pill pill-amber"><span className="dot" />Offline</span>}
              {scannerReady === null && <span className="pill pill-gray">Checking…</span>}
            </div>
            <button
              type="button"
              className={`fm-drop${staffForm.fingerprintTemplate || staffForm.hasFingerprint ? " has-file" : ""}`}
              onClick={handleCaptureFingerprint}
              disabled={capturingFingerprint || scannerReady === false}
              style={{ width: "100%", font: "inherit" }}
            >
              {capturingFingerprint ? <Loader size="sm" showText={false} /> : <Fingerprint size={28} />}
              <b>
                {capturingFingerprint
                  ? "Place a finger on the scanner…"
                  : staffForm.fingerprintTemplate
                    ? "New fingerprint ready to save"
                    : staffForm.hasFingerprint
                      ? "Fingerprint on file. Capture again to replace it"
                      : "Capture fingerprint"}
              </b>
              <span>Used to clock in on the attendance terminal. The scanner service must be running on this PC.</span>
            </button>
            {(staffForm.fingerprintTemplate || (editId && staffForm.hasFingerprint)) && (
              <div className="wrap-gap">
                {staffForm.fingerprintTemplate && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStaffForm((f) => ({ ...f, fingerprintTemplate: "" }))}>Clear new capture</button>
                )}
                {editId && staffForm.hasFingerprint && !staffForm.fingerprintTemplate && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={removeStoredFingerprint}>Remove stored fingerprint</button>
                )}
              </div>
            )}
          </FormSection>
        </FormModal>
      )}
    </div>
  );
};

export default Staffs;
