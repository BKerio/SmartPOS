import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, DollarSign, GraduationCap, Smartphone, Wallet } from "lucide-react";
import { ChoiceCards, FieldLabel, FormCard, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";

type StudentLite = {
  id: string;
  name: string;
  regNo: string;
  walletBalance: number;
};

const ParentTopUpWallet = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>((location.state as any)?.studentId || "");

  const selected = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data } = await API.get("/parents/students");
      const list = (data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        regNo: s.regNo,
        walletBalance: s.walletBalance || 0,
      }));
      setStudents(list);
      if (!studentId && list.length > 0) setStudentId(list[0].id);
    } catch (e: any) {
      toast.error("Failed to load students", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStudents(); }, []);

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <Loader size="sm" title="Loading..." subtitle="Fetching linked students" className="py-10" />
        ) : students.length === 0 ? (
          <div className="card card-pad" style={{ textAlign: "center" }}>
            <GraduationCap className="mx-auto mb-3" style={{ color: "var(--muted-2)" }} />
            <p className="section-title">No students linked</p>
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>Ask the school admin to link your account to your child.</p>
          </div>
        ) : (
          <FormCard
            icon={DollarSign}
            title="Top up a wallet"
            subtitle="Add money to your child's school meals wallet with M-Pesa."
            statusLabel="Top up"
            statusDetail={selected ? `${selected.name} · KES ${Number(selected.walletBalance || 0).toLocaleString()}` : ""}
            submitLabel="Continue to payment"
            submitIcon={ArrowRight}
            submitDisabled={!selected}
            onSubmit={(e) => {
              e.preventDefault();
              if (!selected) return toast.error("Select student", "Choose the student to top up");
              navigate("/pay-kopokopo", {
                state: { studentId: selected.id, studentName: selected.name, regNo: selected.regNo, currentBalance: selected.walletBalance },
              });
            }}
          >
            <FormSection id="student" icon={GraduationCap} title="Student">
              <div className="field">
                <FieldLabel required>Which child?</FieldLabel>
                <ChoiceCards
                  label="Student"
                  columns={2}
                  options={students.map((s) => ({
                    value: s.id,
                    label: s.name,
                    sub: `${s.regNo} · Balance KES ${Number(s.walletBalance || 0).toLocaleString()}`,
                  }))}
                  selected={studentId ? [studentId] : []}
                  onToggle={setStudentId}
                />
              </div>
            </FormSection>
            <FormSection id="method" icon={Smartphone} title="Payment method">
              <div className="fm-preview">
                <span className="fm-card-tile" aria-hidden="true"><Wallet size={16} /></span>
                <div className="col" style={{ gap: 2 }}>
                  <b>M-Pesa (STK push via KopoKopo)</b>
                  <span>On the next screen you enter the amount and phone number, then approve the prompt on your phone.</span>
                </div>
              </div>
            </FormSection>
          </FormCard>
        )}
        <p className="fm-note" style={{ textAlign: "center", marginTop: 14 }}>
          <Link to="/parent-dashboard" className="lp-link" style={{ color: "var(--green)" }}>Back to dashboard</Link>
        </p>
      </div>
    </div>
  );
};

export default ParentTopUpWallet;