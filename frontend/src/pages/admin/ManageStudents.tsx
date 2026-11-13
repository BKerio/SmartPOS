import React, { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Edit, Trash2, X, Eye, Fingerprint, Search, KeyRound, Wallet, FileSpreadsheet, FileText, UserCog, UserPlus, Contact, HeartHandshake, LockKeyhole, Phone, Mail, Receipt, TrendingUp } from "lucide-react";
import FormModal, { ChoiceCards, ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import WalletAdjustModal from "@/components/WalletAdjustModal";
import { captureFingerprint, checkScannerHealth, prepareScanner, checkFingerprintDuplicate } from "@/services/fingerprintScanner";
import {
  downloadStudentsExcel,
  downloadStudentsPdf,
  filterOnboardedOnDay,
  formatMoney,
  isRegistrationFeeEligible,
  parseLocalDateInput,
  REGISTRATION_FEE_KES,
  toLocalDateInput,
} from "@/lib/studentOnboardingExport";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { Avatar, PersonCell, SortHeader, TablePager, nextSort, type Sort } from "@/components/page/DataTable";
import { displayName } from "@/lib/text";

const PAGE_SIZE = 25;

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
  parentReceiveSms: true,
  parentReceiveEmail: true,
  fingerprintTemplate: "",
  hasFingerprint: false,
};


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
  const [searchQuery, setSearchQuery] = useState("");
  const [scannerReady, setScannerReady] = useState<boolean | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [validatingFingerprint, setValidatingFingerprint] = useState(false);
  const [pinStudent, setPinStudent] = useState<any>(null);
  const [pinSettings, setPinSettings] = useState<{ pinEnabled: boolean } | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [walletStudent, setWalletStudent] = useState<any>(null);
  /** Empty = all students; otherwise `YYYY-MM-DD` onboarded date filter. */
  const [onboardedDate, setOnboardedDate] = useState("");

  const selectedOnboardedDay = useMemo(
    () => (onboardedDate ? parseLocalDateInput(onboardedDate) : null),
    [onboardedDate],
  );
  const isDateFiltered = Boolean(selectedOnboardedDay);
  const isOnboardedToday =
    Boolean(selectedOnboardedDay) &&
    toLocalDateInput(selectedOnboardedDay!) === toLocalDateInput();

  const filteredStudents = useMemo(() => {
    let list = students;
    if (selectedOnboardedDay) {
      list = filterOnboardedOnDay(list, selectedOnboardedDay);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const haystack = [
        s.name,
        s.regNo,
        s.course,
        s.className,
        s.category,
        s.email,
        s.phone,
        s.gender,
        s.parent?.name,
        s.parent?.phone,
        s.parentRelationship,
        s.hasFingerprint ? "enrolled fingerprint" : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [students, searchQuery, selectedOnboardedDay]);

  const onboardedOnSelectedCount = useMemo(() => {
    if (!selectedOnboardedDay) return 0;
    return filterOnboardedOnDay(students, selectedOnboardedDay).length;
  }, [students, selectedOnboardedDay]);

  const collectionTotals = useMemo(() => {
    const walletTotal = filteredStudents.reduce(
      (sum, s) => sum + Number(s.walletBalance || 0),
      0,
    );
    const feeEligibleCount = filteredStudents.filter((s) =>
      isRegistrationFeeEligible(s.createdAt),
    ).length;
    const registrationFeesTotal = feeEligibleCount * REGISTRATION_FEE_KES;
    return {
      students: filteredStudents.length,
      feeEligibleCount,
      walletTotal,
      registrationFeesTotal,
      collectedTotal: walletTotal + registrationFeesTotal,
    };
  }, [filteredStudents]);

  const exportFiltered = (format: "excel" | "pdf") => {
    if (filteredStudents.length === 0) {
      toast.warning("Nothing to export", "No students match the current filter");
      return;
    }
    const dayLabel = selectedOnboardedDay
      ? selectedOnboardedDay.toLocaleDateString()
      : "";
    const title = isDateFiltered
      ? `Students onboarded on ${dayLabel}`
      : "Students list";
    const filenamePrefix = isDateFiltered
      ? `students-onboarded-${onboardedDate}`
      : "students-list";
    const exportOpts = {
      title,
      filenamePrefix,
      totals: {
        walletTotal: collectionTotals.walletTotal,
        registrationFeesTotal: collectionTotals.registrationFeesTotal,
        collectedTotal: collectionTotals.collectedTotal,
      },
    };
    try {
      if (format === "excel") {
        downloadStudentsExcel(filteredStudents, exportOpts);
      } else {
        downloadStudentsPdf(filteredStudents, exportOpts);
      }
      toast.success(
        format === "excel" ? "Excel downloaded" : "PDF downloaded",
        `${filteredStudents.length} student(s) exported`,
      );
    } catch (e: any) {
      toast.error("Export failed", e?.message || "Could not generate file");
    }
  };

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

  /** Applies any missing registration fees in the background; reloads the list only if something changed. */
  const ensureRegistrationFees = async () => {
    try {
      const ensure = await API.post("/students/registration-fees/ensure");
      if (ensure.data?.applied > 0) {
        toast.success(
          "Registration fees applied",
          `Deducted KES ${ensure.data.fee || 500} from ${ensure.data.applied} student wallet(s)`,
        );
        fetchData();
      }
    } catch {
      // Non-blocking: the list is already on screen
    }
  };

  // The list loads straight away; the fee check runs alongside it instead of in front of it.
  useEffect(() => {
    fetchData();
    ensureRegistrationFees();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const r = await toast.confirm("Remove the stored fingerprint?", {
      description: "The student will need to pay with their PIN until a fingerprint is enrolled again.",
      confirmLabel: "Remove fingerprint",
      tone: "warning",
    });
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
      parentReceiveSms: s.parent?.receiveSms !== false,
      parentReceiveEmail: s.parent?.receiveEmail !== false,
      fingerprintTemplate: "",
      hasFingerprint: Boolean(s.hasFingerprint),
    });
    setShowForm(true);
  };

  const deleteStudent = async (id: string) => {
    const st = students.find((s) => (s._id || s.id) === id);
    const balance = Number(st?.walletBalance || 0);
    const r = await toast.confirm("Delete this student?", {
      description: "The student, their wallet and their wallet history are removed for good.",
      subject: st ? { name: displayName(st.name), detail: [st.regNo, st.className, `Wallet KES ${balance.toLocaleString()}`].filter(Boolean).join(" · ") } : undefined,
      points: balance > 0 ? [`KES ${balance.toLocaleString()} is still in their wallet. Refund or move it first.`, "Their purchase history disappears from reports"] : ["Their purchase history disappears from reports"],
      typeToConfirm: balance > 0 ? "DELETE" : undefined,
      confirmLabel: "Delete student",
    });
    if (!r) return;
    await API.delete(`/students/${id}`);
    fetchData();
  };

  const openPinModal = async (student: any) => {
    setPinStudent(student);
    setPinSettings(null);
    setPinLoading(true);
    try {
      const { data } = await API.get(`/students/${student._id || student.id}/wallet-settings`);
      setPinSettings({ pinEnabled: Boolean(data.pinEnabled) });
    } catch (e: any) {
      toast.error("Failed to load wallet PIN", e.response?.data?.message);
      setPinStudent(null);
    } finally {
      setPinLoading(false);
    }
  };

  const closePinModal = () => {
    setPinStudent(null);
    setPinSettings(null);
  };

  const setStudentPin = async () => {
    if (!pinStudent) return;
    const pin = window.prompt("Enter new 4-digit wallet PIN");
    if (!pin) return;
    setPinSaving(true);
    try {
      const { data } = await API.put(`/students/${pinStudent._id || pinStudent.id}/wallet-settings`, { pin });
      setPinSettings({ pinEnabled: Boolean(data.pinEnabled) });
      toast.success("Wallet PIN updated");
    } catch (e: any) {
      toast.error("Update failed", e.response?.data?.message);
    } finally {
      setPinSaving(false);
    }
  };

  const resetStudentPin = async () => {
    if (!pinStudent) return;
    const ok = await toast.confirm("Reset wallet PIN to default (1234)?", { confirmLabel: "Reset" });
    if (!ok) return;
    setPinSaving(true);
    try {
      const { data } = await API.put(`/students/${pinStudent._id || pinStudent.id}/wallet-settings`, { resetPin: true });
      setPinSettings({ pinEnabled: Boolean(data.pinEnabled) });
      toast.success("Wallet PIN reset to 1234");
    } catch (e: any) {
      toast.error("Reset failed", e.response?.data?.message);
    } finally {
      setPinSaving(false);
    }
  };

  const backfillDefaultPins = async () => {
    const ok = await toast.confirm(
      "Set default PIN (1234) for all students without a wallet PIN?",
      { confirmLabel: "Apply to all" },
    );
    if (!ok) return;
    try {
      const { data } = await API.post("/students/wallet-pins/backfill-default");
      toast.success("Default PINs applied", data.message);
      fetchData();
    } catch (e: any) {
      toast.error("Backfill failed", e.response?.data?.message);
    }
  };

  // ── Table: sort + paging (filtering above stays as it was) ──
  const [sort, setSort] = useState<Sort<"name" | "wallet">>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const sortedStudents = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filteredStudents].sort((a, b) =>
      sort.key === "wallet"
        ? (Number(a.walletBalance || 0) - Number(b.walletBalance || 0)) * dir
        : String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }) * dir,
    );
  }, [filteredStudents, sort]);
  useEffect(() => setPage(1), [searchQuery, onboardedDate, sort]);
  const pageStudents = sortedStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const toggleSort = (key: "name" | "wallet") => setSort((s) => nextSort(s, key, ["name"]));
  const enrolledCount = useMemo(() => filteredStudents.filter((s) => s.hasFingerprint).length, [filteredStudents]);

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={GraduationCap}
        eyebrow="Management"
        title="Students"
        subtitle="Student accounts, wallets, fingerprints and the parents linked to them"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => exportFiltered("excel")} disabled={filteredStudents.length === 0} title="Export the list below to Excel">
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => exportFiltered("pdf")} disabled={filteredStudents.length === 0} title="Export the list below to PDF">
              <FileText size={16} /> PDF
            </button>
            <button type="button" className="btn btn-ghost" onClick={backfillDefaultPins} title="Give every student without a PIN the default wallet PIN">
              <KeyRound size={16} /> Default PINs
            </button>
            <button type="button" className="btn btn-primary" onClick={() => { closeForm(); setShowForm(true); }}>
              <Plus size={16} /> Add student
            </button>
          </>
        }
      />

      <StatTiles cols={4}>
        <StatTile label={isDateFiltered ? "Students that day" : "Students"} value={collectionTotals.students.toLocaleString()} hint={`${enrolledCount} with a fingerprint`} icon={GraduationCap} tone="navy" />
        <StatTile label="Registration fees" value={`KES ${formatMoney(collectionTotals.registrationFeesTotal)}`} hint={`${collectionTotals.feeEligibleCount} students charged`} icon={Receipt} tone="gold" />
        <StatTile label="Wallet balances" value={`KES ${formatMoney(collectionTotals.walletTotal)}`} hint="Money held in these wallets" icon={Wallet} tone="green" />
        <StatTile label="Total collected" value={`KES ${formatMoney(collectionTotals.collectedTotal)}`} hint="Wallets plus registration fees" icon={TrendingUp} tone="teal" />
      </StatTiles>

      <section className="dt">
        <div className="dt-toolbar">
          <label className="dt-search">
            <Search size={16} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, admission no., course or parent" aria-label="Search students" />
            {searchQuery && (
              <button type="button" className="dt-icon" style={{ width: 26, height: 26 }} onClick={() => setSearchQuery("")} aria-label="Clear search"><X size={14} /></button>
            )}
          </label>
          <Segmented
            label="Onboarded"
            value={isOnboardedToday ? "today" : isDateFiltered ? "day" : "all"}
            options={[
              { value: "all", label: "All" },
              { value: "today", label: "Onboarded today" },
              ...(isDateFiltered && !isOnboardedToday ? [{ value: "day" as const, label: selectedOnboardedDay!.toLocaleDateString("en-KE", { day: "numeric", month: "short" }) }] : []),
            ]}
            onChange={(v) => setOnboardedDate(v === "today" ? toLocalDateInput() : v === "all" ? "" : onboardedDate)}
          />
          <input type="date" className="input" style={{ width: 160, height: 40 }} value={onboardedDate} onChange={(e) => setOnboardedDate(e.target.value)} title="Onboarded on a specific day" aria-label="Onboarded on" />
          <span className="dt-count">
            {isDateFiltered
              ? `${filteredStudents.length} of ${onboardedOnSelectedCount} onboarded that day`
              : filteredStudents.length === students.length
                ? `${students.length.toLocaleString()} students`
                : `${filteredStudents.length.toLocaleString()} of ${students.length.toLocaleString()}`}
          </span>
        </div>

        {loading ? (
          <Loader size="sm" title="Loading students..." subtitle="Fetching student records" className="py-10" />
        ) : sortedStudents.length === 0 ? (
          <div className="dt-empty">
            <b>{students.length === 0 ? "No students yet" : "No students match"}</b>
            {students.length === 0
              ? "Add a student to get started."
              : isDateFiltered
                ? `No students were onboarded on ${selectedOnboardedDay?.toLocaleDateString()}.`
                : "Try another search."}
          </div>
        ) : (
          <>
            <div className="dt-scroll">
              <table>
                <thead>
                  <tr>
                    <th><SortHeader label="Student" k="name" sort={sort} onSort={toggleSort} /></th>
                    <th className="hide-sm">Course</th>
                    <th>Fingerprint</th>
                    <th className="hide-sm">Parent</th>
                    <th className="num hide-sm">Reg. fee</th>
                    <th className="num"><SortHeader label="Wallet" k="wallet" sort={sort} onSort={toggleSort} /></th>
                    <th className="act">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageStudents.map((s) => {
                    const feeEligible = isRegistrationFeeEligible(s.createdAt);
                    const balance = Number(s.walletBalance || 0);
                    return (
                      <tr key={s._id || s.id} className="click" onClick={() => setViewItem(s)}>
                        <td>
                          <PersonCell name={s.name} sub={<><span className="dt-mono" style={{ fontSize: 12 }}>{s.regNo}</span>{s.gender ? ` · ${s.gender[0].toUpperCase()}${s.gender.slice(1)}` : ""}</>} />
                        </td>
                        <td className="hide-sm">
                          {s.course ? <span style={{ color: "var(--ink-2)" }}>{s.course}</span> : <span className="dt-muted">-</span>}
                          {s.className && <div className="dt-muted" style={{ fontSize: 12 }}>{s.className}</div>}
                        </td>
                        <td>
                          {s.hasFingerprint ? (
                            <span className="pill pill-green"><Fingerprint size={12} /> Enrolled</span>
                          ) : (
                            <span className="pill pill-gray">Not enrolled</span>
                          )}
                        </td>
                        <td className="hide-sm">
                          {s.parent?.name ? (
                            <div className="dt-person">
                              <Avatar name={s.parent.name} size="sm" />
                              <div className="min-w-0">
                                <b style={{ fontSize: 13.5, fontWeight: 600 }}>{displayName(s.parent.name)}</b>
                                {s.parent.phone && <span className="dt-mono" style={{ fontSize: 12 }}>{s.parent.phone}</span>}
                              </div>
                            </div>
                          ) : (
                            <span className="pill pill-amber"><span className="dot" />No parent</span>
                          )}
                        </td>
                        <td className="num hide-sm">
                          {feeEligible ? <span className="dt-amount" style={{ color: "var(--amber)" }}>KES {formatMoney(REGISTRATION_FEE_KES)}</span> : <span className="dt-muted">N/A</span>}
                        </td>
                        <td className="num">
                          <span className="dt-amount" style={{ color: balance < 0 ? "var(--red)" : balance > 0 ? "var(--color-status-success, #169A5B)" : "var(--muted)" }}>
                            KES {formatMoney(balance)}
                          </span>
                        </td>
                        <td className="act" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="dt-icon" title="View details" aria-label={`View ${s.name}`} onClick={() => setViewItem(s)}><Eye size={16} /></button>
                          <button type="button" className="dt-icon" title="Update wallet" aria-label={`Update wallet for ${s.name}`} onClick={() => setWalletStudent(s)}><Wallet size={16} /></button>
                          <button type="button" className="dt-icon" title="Wallet PIN" aria-label={`Wallet PIN for ${s.name}`} onClick={() => openPinModal(s)}><KeyRound size={16} /></button>
                          <button type="button" className="dt-icon" title="Edit student" aria-label={`Edit ${s.name}`} onClick={() => editStudent(s)}><Edit size={16} /></button>
                          <button type="button" className="dt-icon danger" title="Delete student" aria-label={`Delete ${s.name}`} onClick={() => deleteStudent(s._id || s.id)}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePager page={page} pageSize={PAGE_SIZE} total={sortedStudents.length} onPage={setPage} label="students" />
          </>
        )}
      </section>

      {showForm && (
        <FormModal
          icon={editId ? UserCog : UserPlus}
          title={editId ? "Edit student" : "Add a student"}
          subtitle={editId ? "Update the student's details, parent and access." : "Register a student, link their parent and enrol a fingerprint."}
          steps={[
            { id: "student", label: "Student", done: !!studentForm.name.trim() && !!studentForm.gender },
            { id: "parent", label: "Parent", done: !!studentForm.parentName.trim() && !!studentForm.parentPhone.trim() },
            { id: "access", label: "Access", done: !!editId || !!studentForm.password },
            { id: "fingerprint", label: "Fingerprint", done: !!studentForm.fingerprintTemplate || studentForm.hasFingerprint },
          ]}
          statusLabel={editId ? "Editing student" : "New student"}
          statusDetail={studentForm.name}
          submitLabel={editId ? "Save changes" : "Add student"}
          onClose={closeForm}
          onSubmit={saveStudent}
        >
          <FormSection id="student" icon={Contact} title="Student">
            <div className="field">
              <FieldLabel htmlFor="st-name" required>Full name</FieldLabel>
              <input id="st-name" className="input" placeholder="e.g. Jane Wanjiku" value={studentForm.name} onChange={(e) => setField("name", e.target.value)} required />
            </div>
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="st-regno" hint={editId ? "Can't be changed" : "Optional"}>Admission no.</FieldLabel>
                <input id="st-regno" className="input" placeholder="Auto-generated if empty" value={studentForm.regNo} onChange={(e) => setField("regNo", e.target.value)} disabled={!!editId} />
              </div>
              <div className="field">
                <FieldLabel htmlFor="st-dob" hint="Optional">Date of birth</FieldLabel>
                <input id="st-dob" type="date" className="input" value={studentForm.dateOfBirth} onChange={(e) => setField("dateOfBirth", e.target.value)} />
              </div>
            </div>
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel required>Gender</FieldLabel>
                <ChoicePills
                  label="Gender"
                  value={studentForm.gender as "male" | "female" | ""}
                  options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]}
                  onChange={(v) => setField("gender", v)}
                />
              </div>
              <div className="field">
                <FieldLabel>Category</FieldLabel>
                <ChoicePills
                  label="Category"
                  value={studentForm.category as "regular" | "sponsored"}
                  options={[{ value: "regular", label: "Regular" }, { value: "sponsored", label: "Sponsored" }]}
                  onChange={(v) => setField("category", v)}
                />
              </div>
            </div>
            <div className="field">
              <FieldLabel hint="Optional">Course</FieldLabel>
              <ChoiceCards
                label="Course"
                columns={2}
                options={COURSE_OPTIONS.map((c) => ({ value: c, label: c }))}
                selected={studentForm.course ? [studentForm.course] : []}
                onToggle={(c) => setField("course", studentForm.course === c ? "" : c)}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="st-class" hint="Optional">Class</FieldLabel>
              <input id="st-class" className="input" placeholder="e.g. Year 1 / Form 2 / Grade 6" value={studentForm.className} onChange={(e) => setField("className", e.target.value)} />
            </div>
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="st-phone" hint="Optional">Student phone</FieldLabel>
                <div className="input-icon">
                  <input id="st-phone" className="input" placeholder="0712 345 678" value={studentForm.phone} onChange={(e) => setField("phone", e.target.value)} />
                  <Phone />
                </div>
              </div>
              <div className="field">
                <FieldLabel htmlFor="st-email" hint="Optional">Student email</FieldLabel>
                <div className="input-icon">
                  <input id="st-email" type="email" className="input" placeholder="e.g. student@email.com" value={studentForm.email} onChange={(e) => setField("email", e.target.value)} />
                  <Mail />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection id="parent" icon={HeartHandshake} title="Parent / guardian">
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="st-pname" required>Name</FieldLabel>
                <input id="st-pname" className="input" placeholder="Parent or guardian name" value={studentForm.parentName} onChange={(e) => setField("parentName", e.target.value)} required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="st-pphone" required>Phone number</FieldLabel>
                <div className="input-icon">
                  <input id="st-pphone" className="input" placeholder="0712 345 678" value={studentForm.parentPhone} onChange={(e) => setField("parentPhone", e.target.value)} required />
                  <Phone />
                </div>
              </div>
            </div>
            <div className="field">
              <FieldLabel>Relationship</FieldLabel>
              <ChoicePills
                label="Relationship"
                value={studentForm.parentRelationship}
                options={RELATIONSHIP_OPTIONS}
                onChange={(v) => setField("parentRelationship", v)}
              />
            </div>
            <div className="field">
              <FieldLabel hint="Parent's login password is their phone number">Notifications</FieldLabel>
              <ChoiceCards
                label="Notifications"
                multiple
                columns={2}
                options={[
                  { value: "sms", label: "SMS", sub: "Top-ups, purchases and low balance", tile: "SM" },
                  { value: "email", label: "Email", sub: "Receipts and statements", tile: "EM" },
                ]}
                selected={[studentForm.parentReceiveSms && "sms", studentForm.parentReceiveEmail && "email"].filter(Boolean) as string[]}
                onToggle={(v) =>
                  v === "sms"
                    ? setField("parentReceiveSms", !studentForm.parentReceiveSms)
                    : setField("parentReceiveEmail", !studentForm.parentReceiveEmail)
                }
              />
            </div>
          </FormSection>

          <FormSection id="access" icon={LockKeyhole} title="Account access">
            <div className="field">
              <FieldLabel htmlFor="st-pass" hint={editId ? "Leave blank to keep" : "Optional"}>
                {editId ? "New password" : "Password"}
              </FieldLabel>
              <input id="st-pass" type="password" className="input" placeholder="At least 7 characters" value={studentForm.password} onChange={(e) => setField("password", e.target.value)} minLength={7} autoComplete="new-password" />
              {!editId && <p className="fm-note">If left empty, the password is the last 6 digits of the admission number.</p>}
            </div>
          </FormSection>

          <FormSection id="fingerprint" icon={Fingerprint} title="Fingerprint">
            <div className="fm-label-row">
              <span className="fm-label">Scanner</span>
              {scannerReady === true && <span className="pill pill-green"><span className="dot" />Connected</span>}
              {scannerReady === false && <span className="pill pill-amber"><span className="dot" />Offline</span>}
              {scannerReady === null && <span className="pill pill-gray">Checking…</span>}
            </div>
            <button
              type="button"
              className={`fm-drop${studentForm.fingerprintTemplate || studentForm.hasFingerprint ? " has-file" : ""}`}
              onClick={handleCaptureFingerprint}
              disabled={capturing || validatingFingerprint || scannerReady === false}
              style={{ width: "100%", font: "inherit" }}
            >
              {capturing || validatingFingerprint ? <Loader size="sm" showText={false} /> : <Fingerprint size={28} />}
              <b>
                {capturing
                  ? "Place a finger on the scanner…"
                  : validatingFingerprint
                    ? "Checking for duplicates…"
                    : studentForm.fingerprintTemplate
                      ? "New fingerprint ready to save"
                      : studentForm.hasFingerprint
                        ? "Fingerprint on file. Capture again to replace it"
                        : "Capture fingerprint"}
              </b>
              <span>Optional. The scanner service must be running on this PC (dotnet run in FingerprintScanner).</span>
            </button>
            {(studentForm.fingerprintTemplate || (editId && studentForm.hasFingerprint)) && (
              <div className="wrap-gap">
                {studentForm.fingerprintTemplate && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearFingerprint}>Clear new capture</button>
                )}
                {editId && studentForm.hasFingerprint && !studentForm.fingerprintTemplate && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} onClick={removeStoredFingerprint}>
                    Remove stored fingerprint
                  </button>
                )}
              </div>
            )}
          </FormSection>
        </FormModal>
      )}

      {viewItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewItem(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-brand mb-4">{viewItem.name}</h3>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Admission No:</span> {viewItem.regNo}</p>
              <p><span className="text-gray-500">Course:</span> {viewItem.course || "-"}</p>
              <p><span className="text-gray-500">Phone:</span> {viewItem.phone || "-"}</p>
              <p><span className="text-gray-500">Email:</span> {viewItem.email || "-"}</p>
              <p><span className="text-gray-500">Gender:</span> {viewItem.gender}</p>
              <p><span className="text-gray-500">Date of Birth:</span> {viewItem.dateOfBirth ? formatDateInput(viewItem.dateOfBirth) : "-"}</p>
              <p><span className="text-gray-500">Wallet:</span> KES {(viewItem.walletBalance || 0).toLocaleString()}</p>
              <p><span className="text-gray-500">Wallet PIN:</span> {viewItem.walletPinSetAt ? "Set" : "Not set"}</p>
              <p><span className="text-gray-500">Fingerprint:</span> {viewItem.hasFingerprint ? "Enrolled" : "Not enrolled"}</p>
              <p><span className="text-gray-500">Parent:</span> {viewItem.parent?.name || "None"}</p>
              {viewItem.parentRelationship && (
                <p><span className="text-gray-500">Relationship:</span> <span className="capitalize">{viewItem.parentRelationship}</span></p>
              )}
            </div>
            <button onClick={() => setViewItem(null)} className="w-full mt-4 py-2 bg-gray-100 rounded-xl text-sm font-medium">Close</button>
            <button
              onClick={() => {
                setWalletStudent(viewItem);
                setViewItem(null);
              }}
              className="w-full mt-2 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700"
            >
              Update wallet
            </button>
          </div>
        </div>
      )}

      {pinStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closePinModal}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg text-brand flex items-center gap-2">
                  <KeyRound size={18} /> Wallet PIN
                </h3>
                <p className="text-sm text-gray-500 mt-1">{pinStudent.name} · {pinStudent.regNo}</p>
              </div>
              <button onClick={closePinModal} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {pinLoading ? (
              <Loader size="sm" title="Loading..." subtitle="Fetching wallet PIN status" className="py-6" />
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm">
                  <p className="text-gray-500">Status</p>
                  <p className="font-semibold text-brand mt-1">
                    {pinSettings?.pinEnabled ? "PIN is set" : "No PIN set"}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">Default PIN for new students is <strong>1234</strong>.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={setStudentPin}
                    disabled={pinSaving}
                    className="py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand/90 disabled:opacity-50"
                  >
                    Set New PIN
                  </button>
                  <button
                    type="button"
                    onClick={resetStudentPin}
                    disabled={pinSaving}
                    className="py-2.5 bg-gray-100 text-gray-800 rounded-xl text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
                  >
                    Reset to 1234
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {walletStudent && (
        <WalletAdjustModal
          initialStudent={{
            id: walletStudent._id || walletStudent.id,
            name: walletStudent.name,
            regNo: walletStudent.regNo,
            walletBalance: walletStudent.walletBalance,
          }}
          onClose={() => setWalletStudent(null)}
          onSuccess={fetchData}
          title="Update student wallet"
          subtitle={`Adjust wallet for ${walletStudent.name}`}
        />
      )}
    </div>
  );
};

export default ManageStudents;
