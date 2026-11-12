import { useState } from "react";
import { Banknote, Hash, Receipt } from "lucide-react";
import FormModal, { ChoiceCards, FieldLabel, FormSection } from "@/components/shared/FormModal";

/** Same rule as the backend (normalizePaymentReference in pos.routes.ts). */
export const MPESA_CODE = /^[A-Z0-9]{8,12}$/;
const clean = (v: string) => v.replace(/\s+/g, "").toUpperCase();

type Method = "cash" | "mpesa_till";

/**
 * Confirms a counter ("cash") sale. The cashier can record the M-Pesa code when the customer paid the
 * till by M-Pesa instead of notes and coins; the code is stored on the sale and shown in Collections
 * so payments can be reconciled against the till statement.
 */
function CounterPaymentModal({
  total,
  itemCount,
  submitting,
  onClose,
  onConfirm,
  title = "Confirm counter payment",
}: {
  total: number;
  itemCount: number;
  submitting?: boolean;
  onClose: () => void;
  /** Called with the cleaned M-Pesa code, or "" when none was given. */
  onConfirm: (paymentReference: string) => void;
  title?: string;
}) {
  const [method, setMethod] = useState<Method>("cash");
  const [code, setCode] = useState("");
  const ref = clean(code);
  const codeValid = ref === "" || MPESA_CODE.test(ref);
  const needsCode = method === "mpesa_till";
  const canSubmit = codeValid && (!needsCode || ref !== "");

  return (
    <FormModal
      icon={Banknote}
      title={title}
      subtitle={`Collect KES ${total.toLocaleString()} at the counter, then complete the sale.`}
      steps={[
        { id: "amount", label: "Amount", done: true },
        { id: "payment", label: "Payment", done: canSubmit && (method === "cash" || ref !== "") },
      ]}
      statusLabel={method === "cash" ? "Cash" : "M-Pesa to till"}
      statusDetail={`KES ${total.toLocaleString()}${ref ? ` · ${ref}` : ""}`}
      submitLabel="Payment received"
      submittingLabel="Completing sale…"
      submitting={submitting}
      submitDisabled={!canSubmit}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onConfirm(ref);
      }}
    >
      <FormSection id="amount" icon={Receipt} title="Amount">
        <div className="fm-summary">
          <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
          <b style={{ marginLeft: "auto" }}>KES {total.toLocaleString()}</b>
        </div>
      </FormSection>

      <FormSection id="payment" icon={Hash} title="Payment">
        <div className="field">
          <FieldLabel required>How did they pay?</FieldLabel>
          <ChoiceCards
            label="Payment method"
            columns={2}
            options={[
              { value: "cash", label: "Cash", sub: "Notes and coins", tile: "KES" },
              { value: "mpesa_till", label: "M-Pesa to till", sub: "Paid the till, showed the SMS", tile: "MP" },
            ]}
            selected={[method]}
            onToggle={(v) => setMethod(v as Method)}
          />
        </div>
        <div className="field">
          <FieldLabel htmlFor="counter-mpesa-ref" required={needsCode} hint={needsCode ? "From the customer's SMS" : "Optional"}>
            M-Pesa reference code
          </FieldLabel>
          <input
            id="counter-mpesa-ref"
            className="input mono"
            style={{ textTransform: "uppercase", letterSpacing: ".08em" }}
            placeholder="e.g. UG7QOA5LRC"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={14}
            autoComplete="off"
            autoFocus={needsCode}
            aria-invalid={!codeValid || undefined}
          />
          {!codeValid ? (
            <span className="field-error">Codes are 8–12 letters and numbers, e.g. UG7QOA5LRC.</span>
          ) : needsCode && !ref ? (
            <p className="fm-note">Enter the code so this payment can be matched to the till statement.</p>
          ) : (
            <p className="fm-note">Saved with the sale and shown in Collections for reconciliation. A code can only be used once.</p>
          )}
        </div>
      </FormSection>
    </FormModal>
  );
}

export default CounterPaymentModal;
