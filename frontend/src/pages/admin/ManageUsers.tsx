import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GraduationCap, Users, PieChart, UtensilsCrossed, Plus, Edit, Trash2, X, Eye,
} from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";

type Tab = "students" | "parents" | "finance" | "restaurant";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "students", label: "Students", icon: <GraduationCap size={18} /> },
  { id: "parents", label: "Parents", icon: <Users size={18} /> },
  { id: "finance", label: "Finance Officers", icon: <PieChart size={18} /> },
  { id: "restaurant", label: "Restaurant Staff", icon: <UtensilsCrossed size={18} /> },
];

const emptyStudent = { name: "", regNo: "", course: "", email: "", phone: "", gender: "male", year: "", password: "", parentId: "" };
const emptyParent = { name: "", email: "", phone: "", password: "", studentIds: [] as string[] };
const emptyStaff = { name: "", email: "", phone: "", password: "", role: "finance" as "finance" | "restaurant", status: "approved" };

const ManageUsers: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "students";

  const [students, setStudents] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [parentForm, setParentForm] = useState(emptyParent);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [viewItem, setViewItem] = useState<any>(null);

  const setTab = (t: Tab) => setSearchParams({ tab: t });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [s, p, u] = await Promise.all([API.get("/students"), API.get("/parents"), API.get("/users")]);
      setStudents(s.data);
      setParents(p.data);
      setStaff(u.data);
    } catch (e: any) {
      toast.error("Failed to load data", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const closeForm = () => { setShowForm(false); setEditId(null); setStudentForm(emptyStudent); setParentForm(emptyParent); setStaffForm(emptyStaff); };

  const openAdd = () => {
    closeForm();
    if (tab === "finance") setStaffForm({ ...emptyStaff, role: "finance" });
    else if (tab === "restaurant") setStaffForm({ ...emptyStaff, role: "restaurant" });
    setShowForm(true);
  };

  // ─── Student handlers ───────────────────────────────────────────────────────
  const saveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...studentForm, year: Number(studentForm.year), parentId: studentForm.parentId || null };
      if (editId) {
        const { password, regNo, ...rest } = payload;
        const body: any = { ...rest };
        if (password) body.password = password;
        await API.put(`/students/${editId}`, body);
      } else {
        await API.post("/students", payload);
      }
      toast.success(editId ? "Updated" : "Added");
      closeForm(); fetchAll();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const editStudent = (s: any) => {
    setEditId(s._id || s.id);
    setStudentForm({
      name: s.name, regNo: s.regNo, course: s.course, email: s.email, phone: s.phone,
      gender: s.gender, year: String(s.year), password: "", parentId: s.parentId || "",
    });
    setShowForm(true);
  };

  const deleteStudent = async (id: string) => {
    const r = await toast.confirm("Delete student?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/students/${id}`);
    fetchAll();
  };

  // ─── Parent handlers ────────────────────────────────────────────────────────
  const saveParent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...parentForm, studentIds: parentForm.studentIds };
      if (editId) {
        const body: any = { name: payload.name, email: payload.email, phone: payload.phone, studentIds: payload.studentIds };
        if (payload.password) body.password = payload.password;
        await API.put(`/parents/${editId}`, body);
      } else {
        await API.post("/parents", payload);
      }
      toast.success(editId ? "Updated" : "Added");
      closeForm(); fetchAll();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const editParent = (p: any) => {
    setEditId(p._id || p.id);
    setParentForm({
      name: p.name, email: p.email, phone: p.phone || "", password: "",
      studentIds: (p.students || []).map((s: any) => s.id),
    });
    setShowForm(true);
  };

  const deleteParent = async (id: string) => {
    const r = await toast.confirm("Delete parent?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/parents/${id}`);
    fetchAll();
  };

  const toggleParentStudent = (studentId: string) => {
    setParentForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(studentId)
        ? f.studentIds.filter((id) => id !== studentId)
        : [...f.studentIds, studentId],
    }));
  };

  // ─── Staff handlers ─────────────────────────────────────────────────────────
  const saveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const role = tab === "finance" ? "finance" : "restaurant";
      if (editId) {
        const body: any = { name: staffForm.name, email: staffForm.email, phone: staffForm.phone, role, status: staffForm.status };
        if (staffForm.password) body.password = staffForm.password;
        await API.put(`/users/${editId}`, body);
      } else {
        await API.post("/users", { ...staffForm, role });
      }
      toast.success(editId ? "Updated" : "Added");
      closeForm(); fetchAll();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const editStaffMember = (u: any) => {
    setEditId(u._id || u.id);
    setStaffForm({ name: u.name, email: u.email, phone: u.phone || "", password: "", role: u.role, status: u.status });
    setShowForm(true);
  };

  const deleteStaff = async (id: string) => {
    const r = await toast.confirm("Delete staff member?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/users/${id}`);
    fetchAll();
  };

  const filteredStaff = staff.filter((u) => u.role === tab);

  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none";

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-blue-200 text-sm mt-1">Add and manage students, parents, finance officers, and restaurant staff</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); closeForm(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === t.id ? "bg-[#0A1F44] text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-bold text-[#0A1F44]">{TABS.find((t) => t.id === tab)?.label}</h2>
            <button onClick={openAdd} className="flex items-center gap-2 bg-[#0A1F44] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0A1F44]/90">
              <Plus size={16} /> Add {tab === "finance" ? "Finance Officer" : tab === "restaurant" ? "Staff Member" : tab.slice(0, -1)}
            </button>
          </div>

          {loading ? (
            <p className="p-8 text-center text-gray-500 animate-pulse">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              {/* Students table */}
              {tab === "students" && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Student</th>
                      <th className="px-4 py-3 text-left">Reg No / Course</th>
                      <th className="px-4 py-3 text-left">Parent</th>
                      <th className="px-4 py-3 text-right">Wallet</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No students yet</td></tr>
                    ) : students.map((s) => (
                      <tr key={s._id || s.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{s.regNo}</p>
                          <p className="text-gray-500">{s.course} · Yr {s.year}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{s.parent?.name || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">KES {(s.walletBalance || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => setViewItem(s)} className="p-2 text-gray-400 hover:text-blue-600"><Eye size={16} /></button>
                            <button onClick={() => editStudent(s)} className="p-2 text-gray-400 hover:text-amber-600"><Edit size={16} /></button>
                            <button onClick={() => deleteStudent(s._id || s.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Parents table */}
              {tab === "parents" && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Parent</th>
                      <th className="px-4 py-3 text-left">Contact</th>
                      <th className="px-4 py-3 text-left">Linked Students</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parents.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-gray-400">No parents yet</td></tr>
                    ) : parents.map((p) => (
                      <tr key={p._id || p.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-semibold">{p.name}</td>
                        <td className="px-4 py-3">
                          <p>{p.email}</p>
                          <p className="text-gray-400">{p.phone || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          {(p.students || []).length === 0 ? "—" : (
                            <div className="flex flex-wrap gap-1">
                              {p.students.map((s: any) => (
                                <span key={s.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{s.regNo}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => editParent(p)} className="p-2 text-gray-400 hover:text-amber-600"><Edit size={16} /></button>
                            <button onClick={() => deleteParent(p._id || p.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Staff tables */}
              {(tab === "finance" || tab === "restaurant") && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-left">Email</th>
                      <th className="px-4 py-3 text-left">Phone</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No {tab} staff yet</td></tr>
                    ) : filteredStaff.map((u) => (
                      <tr key={u._id || u.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-semibold">{u.name}</td>
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3 text-gray-500">{u.phone || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.status === "approved" ? "bg-green-100 text-green-700" : u.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button onClick={() => editStaffMember(u)} className="p-2 text-gray-400 hover:text-amber-600"><Edit size={16} /></button>
                            <button onClick={() => deleteStaff(u._id || u.id)} className="p-2 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#0A1F44]">{editId ? "Edit" : "Add"} {TABS.find((t) => t.id === tab)?.label}</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {tab === "students" && (
              <form onSubmit={saveStudent} className="space-y-3">
                <input className={inputCls} placeholder="Full name" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} required />
                <input className={inputCls} placeholder="Registration / Admission No" value={studentForm.regNo} onChange={(e) => setStudentForm({ ...studentForm, regNo: e.target.value })} required disabled={!!editId} />
                <input className={inputCls} placeholder="Course" value={studentForm.course} onChange={(e) => setStudentForm({ ...studentForm, course: e.target.value })} required />
                <div className="grid grid-cols-2 gap-3">
                  <input type="email" className={inputCls} placeholder="Email" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} required />
                  <input className={inputCls} placeholder="Phone" value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select className={inputCls} value={studentForm.gender} onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}>
                    <option value="male">Male</option><option value="female">Female</option>
                  </select>
                  <input type="number" className={inputCls} placeholder="Year" min={1} max={10} value={studentForm.year} onChange={(e) => setStudentForm({ ...studentForm, year: e.target.value })} required />
                </div>
                <select className={inputCls} value={studentForm.parentId} onChange={(e) => setStudentForm({ ...studentForm, parentId: e.target.value })}>
                  <option value="">No parent linked</option>
                  {parents.map((p) => <option key={p.id || p._id} value={p.id || p._id}>{p.name} ({p.email})</option>)}
                </select>
                <input type="password" className={inputCls} placeholder={editId ? "New password (leave blank to keep)" : "Password"} value={studentForm.password} onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })} required={!editId} minLength={7} />
                <button type="submit" className="w-full py-2.5 bg-[#0A1F44] text-white rounded-xl font-semibold">{editId ? "Save Changes" : "Add Student"}</button>
              </form>
            )}

            {tab === "parents" && (
              <form onSubmit={saveParent} className="space-y-3">
                <input className={inputCls} placeholder="Full name" value={parentForm.name} onChange={(e) => setParentForm({ ...parentForm, name: e.target.value })} required />
                <input type="email" className={inputCls} placeholder="Email" value={parentForm.email} onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })} required />
                <input className={inputCls} placeholder="Phone" value={parentForm.phone} onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })} />
                <input type="password" className={inputCls} placeholder={editId ? "New password (leave blank to keep)" : "Password"} value={parentForm.password} onChange={(e) => setParentForm({ ...parentForm, password: e.target.value })} required={!editId} minLength={7} />
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Link Students</p>
                  <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {students.length === 0 ? <p className="text-xs text-gray-400 p-2">Add students first</p> : students.map((s) => (
                      <label key={s._id || s.id} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm">
                        <input type="checkbox" checked={parentForm.studentIds.includes(s._id || s.id)} onChange={() => toggleParentStudent(s._id || s.id)} />
                        {s.name} ({s.regNo})
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" className="w-full py-2.5 bg-[#0A1F44] text-white rounded-xl font-semibold">{editId ? "Save Changes" : "Add Parent"}</button>
              </form>
            )}

            {(tab === "finance" || tab === "restaurant") && (
              <form onSubmit={saveStaff} className="space-y-3">
                <input className={inputCls} placeholder="Full name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required />
                <input type="email" className={inputCls} placeholder="Email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} required />
                <input className={inputCls} placeholder="Phone" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
                <input type="password" className={inputCls} placeholder={editId ? "New password (leave blank to keep)" : "Password"} value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required={!editId} minLength={7} />
                <select className={inputCls} value={staffForm.status} onChange={(e) => setStaffForm({ ...staffForm, status: e.target.value })}>
                  <option value="approved">Approved (active)</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button type="submit" className="w-full py-2.5 bg-[#0A1F44] text-white rounded-xl font-semibold">{editId ? "Save Changes" : "Add Staff Member"}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* View student modal */}
      {viewItem && tab === "students" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewItem(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-[#0A1F44] mb-4">{viewItem.name}</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Reg No:</span> {viewItem.regNo}</p>
              <p><span className="text-gray-500">Course:</span> {viewItem.course}</p>
              <p><span className="text-gray-500">Email:</span> {viewItem.email}</p>
              <p><span className="text-gray-500">Phone:</span> {viewItem.phone}</p>
              <p><span className="text-gray-500">Wallet:</span> KES {(viewItem.walletBalance || 0).toLocaleString()}</p>
              <p><span className="text-gray-500">Parent:</span> {viewItem.parent?.name || "None"}</p>
            </div>
            <button onClick={() => setViewItem(null)} className="w-full mt-4 py-2 bg-gray-100 rounded-xl text-sm font-medium">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
