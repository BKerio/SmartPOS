import React, { useEffect, useState } from "react";
import API from "@/services/api";
import Swal from "sweetalert2";
import { Download } from "lucide-react";

interface Course { _id: string; name: string; code: string; fee?: number; }
interface Enrollment { _id: string; semester: string; totalFee: number; paidAmount?: number; courseIds: Course[] }

const StudentFees: React.FC = () => {
  const [latest, setLatest] = useState<Enrollment | null>(null);
  const [downloading, setDownloading] = useState(false);
  const authHeader = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const fetchLatest = async () => {
    try {
      const { data } = await API.get("/enrollments/me/latest", { headers: authHeader });
      setLatest(data);
    } catch (e: any) {
      setLatest(null);
      if (e.response?.status !== 404)
        Swal.fire({ icon: "error", title: "Failed to load fees", text: e.response?.data?.message || e.message });
    }
  };

  const downloadFeeStatement = async () => {
    if (!latest) return;
    
    setDownloading(true);
    try {
      // Get student ID from localStorage (set during login) or from the enrollment
      const regNo = localStorage.getItem("regNo");
      if (!regNo) throw new Error("Student information not found");
      
      // Get student data to find student ID
      const { data: student } = await API.get("/students/me", { headers: authHeader });
      const studentId = student._id;
      
      const token = localStorage.getItem("token");
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/receipts/student/${studentId}/statement`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to generate statement');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fee-Statement-${regNo}-${new Date().getTime()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      Swal.fire({ icon: "success", title: "Statement downloaded!", timer: 1200, showConfirmButton: false });
    } catch (error: any) {
      Swal.fire({ icon: "error", title: "Download failed", text: error.message });
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => { fetchLatest(); }, []);

  return (
    <div className="max-w-xl mx-auto mt-14 bg-white p-8 rounded-xl shadow-md border border-gray-100">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-2xl font-semibold text-gray-800">My Fee Balance</h2>
        {latest && (
          <button
            onClick={downloadFeeStatement}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              </>
            ) : (
              <>
                <Download size={18} />
                Download Statement
              </>
            )}
          </button>
        )}
      </div>
      {!latest ? (
        <p className="text-center text-gray-500">You have not enrolled for any semester yet.</p>
      ) : (
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-gray-700">Semester:</span>
            <span className="font-medium">{latest.semester}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-gray-700">Total Fees:</span>
            <span className="font-bold text-xl text-indigo-700">Ksh {Number(latest.totalFee).toLocaleString()}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-gray-700">Amount Paid:</span>
            <span className="font-medium text-green-600">Ksh {Number(latest.paidAmount || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between mb-4 p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-800 font-semibold">Balance:</span>
            <span className={`font-bold text-xl ${(latest.totalFee - (latest.paidAmount || 0)) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              Ksh {(Number(latest.totalFee) - Number(latest.paidAmount || 0)).toLocaleString()}
            </span>
          </div>
          <div className="mt-4">
            <span className="text-sm text-gray-600 font-semibold">Courses:</span>
            <ul className="list-disc ml-5 mt-2 text-gray-700">
              {latest.courseIds.map(c => (
                <li key={c._id}>{c.name} ({c.code})</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentFees;
