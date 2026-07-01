import React, { useEffect, useState } from "react";
import { GraduationCap, Plus, Edit, Trash2, X, Eye, Fingerprint } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { captureFingerprint, checkScannerHealth, prepareScanner, checkFingerprintDuplicate } from "@/services/fingerprintScanner";

const COURSE_OPTIONS = [
  "Diploma Water Engineering",
  "Water Resource and Technology",
];

const RELATIONSHIP_OPTIONS = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "guardian", label: "Guardian" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

const emptyStudent = {
  name: "",
  regNo: "",
  phone: "",
  email: "",
  gender: "",
  dateOfBirth: "",
  course: "",
  className: "",
  category: "regular",
  password: "",
  parentRelationship: "father",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  parentReceiveSms: true,
  parentReceiveEmail: true,
  fingerprintTemplate: "",
  hasFingerprint: false,
};

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A1F44] outline-none";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";
const sectionCls = "text-xs font-bold text-[#0A1F44] uppercase tracking-wide";

const formatDateInput = (value?: string | null) => {
  if (!value) return "";
  return value.slice(0, 10);
};

const ManageStudents: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [viewItem, setViewItem] = useState<any>(null);
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [validatingFingerprint, setValidatingFingerprint] = useState(false);

  const setField = <K extends keyof typeof emptyStudent>(key: K, value: (typeof emptyStudent)[K]) => {
    setStudentForm((f) => ({ ...f, [key]: value }));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/students");
      setStudents(data);
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
      .then((h) => {
        setScannerReady(h.deviceConnected);
        if (h.deviceConnected) return prepareScanner();
      })
      .catch(() => setScannerReady(false));
  }, [showForm]);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setStudentForm(emptyStudent);
  };

  const saveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.gender) {
      toast.error("Validation", "Please select a gender");
      return;
    }
    if (!studentForm.parentName.trim() || !studentForm.parentPhone.trim()) {
      toast.error("Validation", "Primary parent name and phone are required");
      return;
    }

    try {
      const payload: any = {
        name: studentForm.name.trim(),
        regNo: studentForm.regNo.trim() || undefined,
        phone: studentForm.phone.trim() || null,
        email: studentForm.email.trim() || null,
        gender: studentForm.gender,
        dateOfBirth: studentForm.dateOfBirth || null,
        course: studentForm.course || null,
        className: studentForm.className || null,
        category: studentForm.category || "regular",
        parentRelationship: studentForm.parentRelationship || null,
        parent: {
          name: studentForm.parentName.trim(),
          phone: studentForm.parentPhone.trim(),
          email: studentForm.parentEmail.trim() || undefined,
          receiveSms: studentForm.parentReceiveSms,
          receiveEmail: studentForm.parentReceiveEmail,
        },
      };

      if (studentForm.fingerprintTemplate) {
        payload.fingerprintTemplate = studentForm.fingerprintTemplate;
      }

      if (editId) {
        const body: any = { ...payload };
        if (studentForm.password) body.password = studentForm.password;
        await API.put(`/students/${editId}`, body);
      } else {
        if (studentForm.password) payload.password = studentForm.password;
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
      await prepareScanner();
      const template = await captureFingerprint();

      setStudentForm((f) => ({ ...f, fingerprintTemplate: template, hasFingerprint: true }));
      toast.success("Fingerprint captured", "Checking for duplicates…");

      setValidatingFingerprint(true);
      const fast = await checkFingerprintDuplicate(template, editId || undefined, {
        biometric: false,
      });
      if (fast.unique === false) {
        setStudentForm((f) => ({ ...f, fingerprintTemplate: "", hasFingerprint: false }));
        toast.error("Fingerprint already enrolled", fast.message);
        return;
      }

      toast.success("Fingerprint ready", "Save the student to store the template");

      checkFingerprintDuplicate(template, editId || undefined, { biometric: true })
        .then((full) => {
          if (full.unique === false) {
            setStudentForm((f) => ({ ...f, fingerprintTemplate: "", hasFingerprint: false }));
            toast.error("Fingerprint already enrolled", full.message);
          }
        })
        .catch(() => {});
    } catch (e: any) {
      const msg = e.response?.data?.message || e.message;
      toast.error("Capture failed", msg);
      setScannerReady(false);
    } finally {
      setCapturing(false);
      setValidatingFingerprint(false);
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
      name: s.name,
      regNo: s.regNo,
      phone: s.phone || "",
      email: s.email || "",
      gender: s.gender || "",
      dateOfBirth: formatDateInput(s.dateOfBirth),
      course: s.course || "",
      className: s.className || "",
      category: s.category || "regular",
      password: "",
      parentRelationship: s.parentRelationship || "father",
      parentName: s.parent?.name || "",
      parentPhone: s.parent?.phone || "",
      parentEmail: s.parent?.email?.endsWith("@school.local") ? "" : (s.parent?.email || ""),
      parentReceiveSms: s.parent?.receiveSms !== false,
      parentReceiveEmail: s.parent?.receiveEmail !== false,
      fingerprintTemplate: "",
      hasFingerprint: Boolean(s.hasFingerprint),
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
                    <th className="px-4 py-3 text-left">Admission / Course</th>
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
                        <p className="text-gray-500">{s.course || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.hasFingerprint ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            <Fingerprint size={12} /> Enrolled
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{s.parent?.name || "-"}</td>
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
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-[#0A1F44] text-lg">{editId ? "Edit Student" : "Add Student"}</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <form onSubmit={saveStudent} className="space-y-6">
              <section className="space-y-3">
                <p className={sectionCls}>Student Information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                    <input className={inputCls} placeholder="Student full name" value={studentForm.name} onChange={(e) => setField("name", e.target.value)} required />
                  </div>
                  <div>
                    <label className={labelCls}>Admission No</label>
                    <input className={inputCls} placeholder="Auto-generated if empty" value={studentForm.regNo} onChange={(e) => setField("regNo", e.target.value)} disabled={!!editId} />
                  </div>
                  <div>
                    <label className={labelCls}>Date of Birth</label>
                    <input type="date" className={inputCls} value={studentForm.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Gender <span className="text-red-500">*</span></label>
                    <select className={inputCls} value={studentForm.gender} onChange={(e) => setField("gender", e.target.value)} required>
                      <option value="">Select…</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Course</label>
                    <select className={inputCls} value={studentForm.course} onChange={(e) => setField("course", e.target.value)}>
                      <option value="">Select…</option>
                      {COURSE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Class</label>
                    <input
                      className={inputCls}
                      placeholder="e.g. Year 1 / Form 2 / Grade 6"
                      value={studentForm.className}
                      onChange={(e) => setField("className", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Category</label>
                    <select className={inputCls} value={studentForm.category} onChange={(e) => setField("category", e.target.value)}>
                      <option value="regular">Regular</option>
                      <option value="sponsored">Sponsored</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Student Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input className={inputCls} placeholder="e.g. 0712345678" value={studentForm.phone} onChange={(e) => setField("phone", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Student Email</label>
                    <input type="email" className={inputCls} placeholder="e.g. student@email.com" value={studentForm.email} onChange={(e) => setField("email", e.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className={sectionCls}>Parents / Guardians</p>
                <p className="text-sm font-semibold text-gray-700">Primary Parent/Guardian</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Name <span className="text-red-500">*</span></label>
                    <input className={inputCls} placeholder="Parent/Guardian name" value={studentForm.parentName} onChange={(e) => setField("parentName", e.target.value)} required />
                  </div>
                  <div>
                    <label className={labelCls}>Phone <span className="text-red-500">*</span></label>
                    <input className={inputCls} placeholder="0712345678" value={studentForm.parentPhone} onChange={(e) => setField("parentPhone", e.target.value)} required />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" className={inputCls} placeholder="parent@email.com" value={studentForm.parentEmail} onChange={(e) => setField("parentEmail", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Relationship</label>
                    <select className={inputCls} value={studentForm.parentRelationship} onChange={(e) => setField("parentRelationship", e.target.value)}>
                      {RELATIONSHIP_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <p className={labelCls}>Communication Preferences</p>
                    <div className="flex flex-wrap gap-4 mt-1">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={studentForm.parentReceiveSms} onChange={(e) => setField("parentReceiveSms", e.target.checked)} className="rounded border-gray-300" />
                        Receive SMS
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={studentForm.parentReceiveEmail} onChange={(e) => setField("parentReceiveEmail", e.target.checked)} className="rounded border-gray-300" />
                        Receive Email
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className={sectionCls}>Account Access</p>
                <div>
                  <label className={labelCls}>
                    {editId ? "New password (leave blank to keep)" : "Password (optional - defaults to last 6 digits of admission no)"}
                  </label>
                  <input type="password" className={inputCls} value={studentForm.password} onChange={(e) => setField("password", e.target.value)} minLength={7} />
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
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
                  disabled={capturing || validatingFingerprint || scannerReady === false}
                  className="w-full py-2.5 border-2 border-dashed border-[#0A1F44]/30 text-[#0A1F44] rounded-xl text-sm font-semibold hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {capturing ? (
                    <><Loader size="xs" showText={false} className="mr-2" /> Place finger on scanner...</>
                  ) : validatingFingerprint ? (
                    <><Loader size="xs" showText={false} className="mr-2" /> Checking...</>
                  ) : (
                    <><Fingerprint size={16} /> Capture Fingerprint</>
                  )}
                </button>
              </section>

              <button type="submit" className="w-full py-3 bg-[#0A1F44] text-white rounded-xl font-semibold text-sm">
                {editId ? "Save Changes" : "Save Student"}
              </button>
            </form>
          </div>
        </div>
      )}

      {viewItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewItem(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-[#0A1F44] mb-4">{viewItem.name}</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Admission No:</span> {viewItem.regNo}</p>
              <p><span className="text-gray-500">Course:</span> {viewItem.course || "-"}</p>
              <p><span className="text-gray-500">Phone:</span> {viewItem.phone || "-"}</p>
              <p><span className="text-gray-500">Email:</span> {viewItem.email || "-"}</p>
              <p><span className="text-gray-500">Gender:</span> {viewItem.gender}</p>
              <p><span className="text-gray-500">Date of Birth:</span> {viewItem.dateOfBirth ? formatDateInput(viewItem.dateOfBirth) : "-"}</p>
              <p><span className="text-gray-500">Wallet:</span> KES {(viewItem.walletBalance || 0).toLocaleString()}</p>
              <p><span className="text-gray-500">Fingerprint:</span> {viewItem.hasFingerprint ? "Enrolled" : "Not enrolled"}</p>
              <p><span className="text-gray-500">Parent:</span> {viewItem.parent?.name || "None"}</p>
              {viewItem.parentRelationship && (
                <p><span className="text-gray-500">Relationship:</span> <span className="capitalize">{viewItem.parentRelationship}</span></p>
              )}
            </div>
            <button onClick={() => setViewItem(null)} className="w-full mt-4 py-2 bg-gray-100 rounded-xl text-sm font-medium">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStudents;
