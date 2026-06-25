import React, { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

type StaffRole = "finance" | "restaurant";

type Props = {
  role: StaffRole;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  addLabel: string;
};

const emptyStaff = { name: "", email: "", phone: "", password: "", status: "approved" };
const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none";

const ManageStaff: React.FC<Props> = ({ role, title, subtitle, icon, addLabel }) => {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState(emptyStaff);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/users");
      setStaff(data.filter((u: any) => u.role === role));
    } catch (e: any) {
      toast.error(`Failed to load ${title.toLowerCase()}`, e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [role]);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setStaffForm(emptyStaff);
  };

  const saveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        const body: any = { name: staffForm.name, email: staffForm.email, phone: staffForm.phone, role, status: staffForm.status };
        if (staffForm.password) body.password = staffForm.password;
        await API.put(`/users/${editId}`, body);
      } else {
        await API.post("/users", { ...staffForm, role });
      }
      toast.success(editId ? "Updated" : "Added");
      closeForm();
      fetchData();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const editStaffMember = (u: any) => {
    setEditId(u._id || u.id);
    setStaffForm({ name: u.name, email: u.email, phone: u.phone || "", password: "", status: u.status });
    setShowForm(true);
  };

  const deleteStaff = async (id: string) => {
    const r = await toast.confirm("Delete staff member?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/users/${id}`);
    fetchData();
  };

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {icon} {title}
          </h1>
          <p className="text-blue-200 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-bold text-[#0A1F44]">All {title}</h2>
            <button onClick={() => { closeForm(); setShowForm(true); }} className="flex items-center gap-2 bg-[#0A1F44] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0A1F44]/90">
              <Plus size={16} /> {addLabel}
            </button>
          </div>

          {loading ? (
            <Loader size="sm" title={`Loading ${title.toLowerCase()}...`} subtitle="Fetching staff accounts" className="py-8" />
          ) : (
            <div className="overflow-x-auto">
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
                  {staff.length === 0 ? (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">No {title.toLowerCase()} yet</td></tr>
                  ) : staff.map((u) => (
                    <tr key={u._id || u.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-semibold">{u.name}</td>
                      <td className="px-4 py-3">{u.email}</td>
                      <td className="px-4 py-3 text-gray-500">{u.phone || "-"}</td>
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
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#0A1F44]">{editId ? "Edit" : "Add"} {title.replace(/s$/, "")}</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
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
              <button type="submit" className="w-full py-2.5 bg-[#0A1F44] text-white rounded-xl font-semibold">{editId ? "Save Changes" : addLabel}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStaff;
