import React, { useEffect, useState } from "react";
import { GraduationCap, Plus, Edit, Trash2, X, Eye, Fingerprint } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { captureFingerprint, checkScannerHealth } from "@/services/fingerprintScanner";

const emptyStudent = {
  name: "", regNo: "", phone: "", gender: "male",
  password: "", parentId: "", fingerprintTemplate: "", hasFingerprint: false,
};

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none";

const ManageStudents: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [viewItem, setViewItem] = useState<any>(null);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  const [capturing, setCapturing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([API.get("/students"), API.get("/parents")]);
      setStudents(s.data);
      setParents(p.data);
    } catch (e: any) {
      toast.error("Failed to load students", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!showForm) return;
    checkScannerHealth()
      .then((h) => setScannerReady(h.deviceConnected))
      .catch(() => setScannerReady(false));
  }, [showForm]);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setStudentForm(emptyStudent);
  };

  const saveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...studentForm, parentId: studentForm.parentId || null };
      if (!payload.fingerprintTemplate) delete payload.fingerprintTemplate;
      delete payload.hasFingerprint;

      if (editId) {
        const { password, regNo, ...rest } = payload;
        const body: any = { ...rest };
        if (password) body.password = password;
        await API.put(`/students/${editId}`, body);
      } else {
        await API.post("/students", payload);
      }
      toast.success(editId ? "Updated" : "Added");
      closeForm();
      fetchData();
    } catch (e: any) {
      toast.error("Operation failed", e.response?.data?.message);
    }
  };

  const handleCaptureFingerprint = async () => {
    setCapturing(true);
    try {
      const template = await captureFingerprint();
      const { data } = await API.post("/students/check-fingerprint", {
        fingerprintTemplate: template,
        excludeStudentId: editId || undefined,
      });
      if (data.unique === false) {
        toast.error("Fingerprint already enrolled", data.message);
        return;
      }
      setStudentForm((f) => ({ ...f, fingerprintTemplate: template, hasFingerprint: true }));
      toast.success("Fingerprint captured", "Save the student to store the template");
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message;
      toast.error("Capture failed", msg);
      setScannerReady(false);
    } finally {
      setCapturing(false);
    }
  };

  const clearFingerprint = () => setStudentForm((f) => ({ ...f, fingerprintTemplate: "" }));

  const removeStoredFingerprint = async () => {
    if (!editId) return;
    const r = await toast.confirm("Remove stored fingerprint?", { confirmLabel: "Remove" });
    if (!r) return;
    try {
      await API.delete(`/students/${editId}/fingerprint`);
      setStudentForm((f) => ({ ...f, fingerprintTemplate: "", hasFingerprint: false }));
      toast.success("Fingerprint removed");
      fetchData();
    } catch (e: any) {
      toast.error("Failed to remove fingerprint", e.response?.data?.message);
    }
  };

  const editStudent = (s: any) => {
    setEditId(s._id || s.id);
    setStudentForm({
      name: s.name, regNo: s.regNo, phone: s.phone,
      gender: s.gender, password: "", parentId: s.parentId || "",
      fingerprintTemplate: "", hasFingerprint: Boolean(s.hasFingerprint),
    });
    setShowForm(true);
  };

  const deleteStudent = async (id: string) => {
    const r = await toast.confirm("Delete student?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/students/${id}`);
    fetchData();
  };

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap size={28} /> Students
          </h1>
          <p className="text-blue-200 text-sm mt-1">Add and manage student accounts, wallets, and fingerprints</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="font-bold text-[#0A1F44]">All Students</h2>
            <button onClick={() => { closeForm(); setShowForm(true); }} className="flex items-center gap-2 bg-[#0A1F44] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0A1F44]/90">
              <Plus size={16} /> Add Student
            </button>
          </div>

          {loading ? (
            <Loader size="sm" title="Loading students..." subtitle="Fetching student records" className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Student</th>
                    <th className="px-4 py-3 text-left">Reg No / Phone</th>
                    <th className="px-4 py-3 text-center">Fingerprint</th>
                    <th className="px-4 py-3 text-left">Parent</th>
                    <th className="px-4 py-3 text-right">Wallet</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">No students yet</td></tr>
                  ) : students.map((s) => (
                    <tr key={s._id || s.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-400 capitalize">{s.gender}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{s.regNo}</p>
                        <p className="text-gray-500">{s.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.hasFingerprint ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <Fingerprint size={12} /> Enrolled
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
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
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-[#0A1F44]">{editId ? "Edit" : "Add"} Student</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={saveStudent} className="space-y-3">
              <input className={inputCls} placeholder="Full name" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} required />
              <input className={inputCls} placeholder="Registration / Admission No" value={studentForm.regNo} onChange={(e) => setStudentForm({ ...studentForm, regNo: e.target.value })} required disabled={!!editId} />
              <input className={inputCls} placeholder="Phone" value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} required />
              <select className={inputCls} value={studentForm.gender} onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}>
                <option value="male">Male</option><option value="female">Female</option>
              </select>
              <select className={inputCls} value={studentForm.parentId} onChange={(e) => setStudentForm({ ...studentForm, parentId: e.target.value })}>
                <option value="">No parent linked</option>
                {parents.map((p) => <option key={p.id || p._id} value={p.id || p._id}>{p.name} ({p.email})</option>)}
              </select>
              <input type="password" className={inputCls} placeholder={editId ? "New password (leave blank to keep)" : "Password"} value={studentForm.password} onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })} required={!editId} minLength={7} />

              <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#0A1F44] flex items-center gap-2">
                    <Fingerprint size={16} /> Fingerprint Enrollment
                  </p>
                  {scannerReady === true && <span className="text-xs text-green-600 font-medium">Scanner connected</span>}
                  {scannerReady === false && <span className="text-xs text-amber-600 font-medium">Scanner offline</span>}
                </div>
                <p className="text-xs text-gray-500">
                  Run <code className="bg-white px-1 rounded">dotnet run</code> in FingerprintScanner on this PC, then capture during enrollment.
                </p>
                {(studentForm.fingerprintTemplate || studentForm.hasFingerprint) ? (
                  <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-green-700 font-medium">
                      {studentForm.fingerprintTemplate ? "New fingerprint ready to save" : "Fingerprint on file"}
                    </span>
                    <div className="flex gap-2">
                      {editId && studentForm.hasFingerprint && !studentForm.fingerprintTemplate && (
                        <button type="button" onClick={removeStoredFingerprint} className="text-xs text-red-600 hover:underline">Remove</button>
                      )}
                      <button type="button" onClick={clearFingerprint} className="text-xs text-gray-600 hover:underline">Clear</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No fingerprint captured yet (optional)</p>
                )}
                <button
                  type="button"
                  onClick={handleCaptureFingerprint}
                  disabled={capturing || scannerReady === false}
                  className="w-full py-2.5 border-2 border-dashed border-[#0A1F44]/30 text-[#0A1F44] rounded-xl text-sm font-semibold hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {capturing ? <><Loader size="xs" showText={false} className="mr-2" /> Place finger on scanner...</> : <><Fingerprint size={16} /> Capture Fingerprint</>}
                </button>
              </div>

              <button type="submit" className="w-full py-2.5 bg-[#0A1F44] text-white rounded-xl font-semibold">{editId ? "Save Changes" : "Add Student"}</button>
            </form>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewItem(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-[#0A1F44] mb-4">{viewItem.name}</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Reg No:</span> {viewItem.regNo}</p>
              <p><span className="text-gray-500">Phone:</span> {viewItem.phone}</p>
              <p><span className="text-gray-500">Gender:</span> {viewItem.gender}</p>
              <p><span className="text-gray-500">Wallet:</span> KES {(viewItem.walletBalance || 0).toLocaleString()}</p>
              <p><span className="text-gray-500">Fingerprint:</span> {viewItem.hasFingerprint ? "Enrolled" : "Not enrolled"}</p>
              <p><span className="text-gray-500">Parent:</span> {viewItem.parent?.name || "None"}</p>
            </div>
            <button onClick={() => setViewItem(null)} className="w-full mt-4 py-2 bg-gray-100 rounded-xl text-sm font-medium">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStudents;
