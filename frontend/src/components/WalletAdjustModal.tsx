import { useState } from "react";
import { Banknote, GraduationCap, Minus, Plus, Wallet } from "lucide-react";
import FormModal, { ChoiceCards, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import StudentPicker, { type StudentOption } from "@/components/StudentPicker";

type WalletDirection = "credit" | "debit";

const formatKes = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

const WalletAdjustModal = ({
  onClose,
  onSuccess,
  initialStudent,
  title = "Update student wallet",
  subtitle = "Credit or debit a student wallet",
}: {
  onClose: () => void;
  onSuccess?: () => void;
  initialStudent?: StudentOption | null;
  title?: string;
  subtitle?: string;
}) => {
  const [student, setStudent] = useState<StudentOption | null>(initialStudent ?? null);
  const [direction, setDirection] = useState<WalletDirection>("credit");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const adjustAmount = Number(amount);
    if (!student) {
      toast.warning("Select a student", "Search and pick the student first");
      return;
    }
    if (!Number.isFinite(adjustAmount) || adjustAmount <= 0) {
      toast.warning("Invalid amount", "Enter a positive amount");
      return;
    }

    const confirmLabel = direction === "credit" ? "Credit wallet" : "Debit wallet";
    const confirmed = await toast.confirm(
      `${direction === "credit" ? "Credit" : "Debit"} ${formatKes(adjustAmount)} ${direction === "credit" ? "to" : "from"} ${student.name}?`,
      { confirmLabel },
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const { data } = await API.post("/wallet/adjust", {
        studentId: student.id,
        amount: adjustAmount,
        direction,
        reference: reference.trim() || undefined,
        description:
          description.trim() ||
          (direction === "credit" ? "Manual wallet credit" : "Manual wallet debit"),
      });

      toast.success(
        direction === "credit" ? "Wallet credited" : "Wallet debited",
        `New balance: ${formatKes(data.newBalance)}`,
      );
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Wallet update failed";
      toast.error("Could not update wallet", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      icon={Wallet}
      title={title}
      subtitle={subtitle + "."}
      steps={[
        { id: "student", label: "Student", done: !!student },
        { id: "amount", label: "Amount", done: Number(amount) > 0 },
      ]}
      statusLabel={direction === "credit" ? "Credit" : "Debit"}
      statusDetail={student ? `${student.name}${Number(amount) > 0 ? ` · ${formatKes(Number(amount))}` : ""}` : ""}
      submitLabel={direction === "credit" ? "Credit wallet" : "Debit wallet"}
      submittingLabel="Updating…"
      submitIcon={direction === "credit" ? Plus : Minus}
      submitting={submitting}
      submitDisabled={!student}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
    >
      <FormSection id="student" icon={GraduationCap} title="Student">
        {!initialStudent && (
          <StudentPicker selected={student} onSelect={setStudent} onClear={() => setStudent(null)} />
        )}
        {initialStudent && student && (
          <div className="fm-summary">
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <span style={{ fontWeight: 650 }}>{student.name}</span>
              <span className="fm-hint">{student.regNo}</span>
            </div>
            {student.walletBalance != null && (
              <div className="col" style={{ gap: 2, marginLeft: "auto", textAlign: "right" }}>
                <span className="fm-hint">Current balance</span>
                <b>{formatKes(student.walletBalance)}</b>
              </div>
            )}
          </div>
        )}
      </FormSection>

      <FormSection id="amount" icon={Banknote} title="Adjustment">
        <div className="field">
          <FieldLabel required>Action</FieldLabel>
          <ChoiceCards
            label="Action"
            columns={2}
            options={[
              { value: "credit", label: "Credit", sub: "Add money to the wallet", tile: "+" },
              { value: "debit", label: "Debit", sub: "Take money from the wallet", tile: "−" },
            ]}
            selected={[direction]}
            onToggle={(v) => setDirection(v as WalletDirection)}
          />
        </div>
        <div className="fm-grid-2">
          <div className="field">
            <FieldLabel htmlFor="wa-amount" required hint="KES">Amount</FieldLabel>
            <input id="wa-amount" type="number" min={1} step="0.01" className="input" placeholder="e.g. 1000" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <FieldLabel htmlFor="wa-ref" hint="Optional">Reference</FieldLabel>
            <input id="wa-ref" className="input" placeholder="Receipt no. or note" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <FieldLabel htmlFor="wa-desc" hint="Optional">Description</FieldLabel>
          <input id="wa-desc" className="input" placeholder={direction === "credit" ? "Cash top-up at till" : "Balance correction"} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {student?.walletBalance != null && Number(amount) > 0 && (
          <p className="fm-note">
            New balance will be{" "}
            <b>{formatKes(student.walletBalance + (direction === "credit" ? 1 : -1) * Number(amount))}</b>.
          </p>
        )}
      </FormSection>
    </FormModal>
  );
};

export default WalletAdjustModal;