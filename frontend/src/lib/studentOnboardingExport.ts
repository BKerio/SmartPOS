import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type StudentExportRow = {
  name: string;
  regNo: string;
  course?: string | null;
  gender?: string | null;
  createdAt?: string | Date | null;
  walletBalance?: number | null;
  parent?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  parentRelationship?: string | null;
};

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Students created on the given local calendar day (default: today). */
export function filterOnboardedOnDay(students: StudentExportRow[], day = new Date()) {
  return students.filter((s) => {
    if (!s.createdAt) return false;
    return sameLocalDay(new Date(s.createdAt), day);
  });
}

function formatMoney(amount: number) {
  return Number(amount || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function buildTableRows(students: StudentExportRow[]) {
  return students.map((s, i) => ({
    no: i + 1,
    studentName: s.name || "-",
    admissionNo: s.regNo || "-",
    course: s.course || "-",
    gender: s.gender || "-",
    onboardedAt: formatDateTime(s.createdAt),
    parentName: s.parent?.name || "-",
    parentPhone: s.parent?.phone || "-",
    parentEmail: s.parent?.email || "-",
    relationship: s.parentRelationship || "-",
    walletBalance: formatMoney(s.walletBalance || 0),
  }));
}

const EXCEL_HEADERS = [
  "No",
  "Student Name",
  "Admission No",
  "Course",
  "Gender",
  "Onboarded At",
  "Parent Name",
  "Parent Phone",
  "Parent Email",
  "Relationship",
  "Wallet Balance (KES)",
];

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function downloadStudentsExcel(
  students: StudentExportRow[],
  opts?: { title?: string; filenamePrefix?: string },
) {
  const title = opts?.title || "Students onboarded today";
  const rows = buildTableRows(students);
  const sheetData = [
    [title],
    [`Generated: ${new Date().toLocaleString()}`],
    [`Total students: ${rows.length}`],
    [],
    EXCEL_HEADERS,
    ...rows.map((r) => [
      r.no,
      r.studentName,
      r.admissionNo,
      r.course,
      r.gender,
      r.onboardedAt,
      r.parentName,
      r.parentPhone,
      r.parentEmail,
      r.relationship,
      r.walletBalance,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws["!cols"] = [
    { wch: 5 },
    { wch: 24 },
    { wch: 14 },
    { wch: 28 },
    { wch: 10 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
    { wch: 26 },
    { wch: 12 },
    { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  const prefix = opts?.filenamePrefix || "students-onboarded-today";
  XLSX.writeFile(wb, `${prefix}-${stamp()}.xlsx`);
}

export function downloadStudentsPdf(
  students: StudentExportRow[],
  opts?: { title?: string; filenamePrefix?: string },
) {
  const title = opts?.title || "Students onboarded today";
  const rows = buildTableRows(students);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.setTextColor(10, 31, 68);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}  ·  Total: ${rows.length}`, 14, 22);

  autoTable(doc, {
    startY: 26,
    head: [[
      "No",
      "Student",
      "Admission",
      "Course",
      "Parent",
      "Parent Phone",
      "Wallet (KES)",
      "Onboarded",
    ]],
    body: rows.map((r) => [
      r.no,
      r.studentName,
      r.admissionNo,
      r.course,
      r.parentName,
      r.parentPhone,
      r.walletBalance,
      r.onboardedAt,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [10, 31, 68], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  const prefix = opts?.filenamePrefix || "students-onboarded-today";
  doc.save(`${prefix}-${stamp()}.pdf`);
}
