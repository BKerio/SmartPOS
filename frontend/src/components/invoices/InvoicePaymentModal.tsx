import { useState } from "react";
import { Banknote, Hash, KeyRound, Phone, Receipt, Smartphone } from "lucide-react";
import FormModal, { ChoiceCards, ChoicePills, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { initiateStkPushAndWait } from "@/services/kopokopoPayment";

type Method = "cash" | "mpesa" | "bank" | "card";
type MpesaMode = "stk" | "code";

const isKenyanPhone = (v: string) => /^(?:\+?254|0)?[17]\d{8}$/.test(v.replace(/[\s-]/g, ""));

/**
 * Records a full or part payment against a sales invoice. M-Pesa can be taken two ways:
 * send a prompt to the customer's phone (STK push; posted to the invoice automatically once they
 * enter their PIN), or type the code from an M-Pesa message they already paid with.
 */
function InvoicePaymentModal({
  invoice,
  onClose,
  onPaid,
}: {
  invoice: { id: string; invoiceNo: string; customerName: string; customerPhone?: string | null; balance: number; totalAmount: number };
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(String(invoice.balance));
  const [method, setMethod] = useState<Method>("mpesa");
  const [mpesaMode, setMpesaMode] = useState<MpesaMode>("stk");
  const [phone, setPhone] = useState(invoice.customerPhone ?? "");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const value = Number(amount);
  const stk = method === "mpesa" && mpesaMode === "stk";

  const sendStk = async () => {
    setSubmitting(true);
    try {
      const result = await initiateStkPushAndWait(
        { phone, amount: value, purpose: "invoice_payment", invoiceId: invoice.id, description: `Invoice ${invoice.invoiceNo}` },
        () => setAwaiting(true),
      );
      const status = (result.status || "").toLowerCase();
      if (status === "success") {
        toast.success(
          "M-Pesa payment received",
          `${result.transactionReference ?? ""} · KES ${Number(result.amount ?? value).toLocaleString()} posted to ${invoice.invoiceNo}`.replace(/^ · /, ""),
        );
        onPaid();
      } else {
        toast.error("M-Pesa payment not completed", status === "cancelled" ? "The customer cancelled the prompt" : "The prompt failed or expired. Try again.");
      }
    } catch (err: any) {
      toast.error("Could not take M-Pesa payment", err?.message);
    } finally {
      setAwaiting(false);
      setSubmitting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stk) return sendStk();
    setSubmitting(true);
    try {
      const { data } = await API.post(`/invoices/${invoice.id}/payments`, { amount: value, method, reference: reference || undefined });
      toast.success("Payment recorded", data.balance > 0 ? `Balance KES ${Number(data.balance).toLocaleString()}` : `${invoice.invoiceNo} is fully paid`);
      onPaid();
    } catch (err: any) {
      toast.error("Could not record payment", err.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const amountOk = value > 0 && value <= invoice.balance + 0.005;
  const shown = (Number.isFinite(value) ? value : 0).toLocaleString();

  return (
    <FormModal
      icon={Banknote}
      title="Record a payment"
      subtitle={`${invoice.invoiceNo} · ${invoice.customerName}`}
      statusLabel="Balance"
      statusDetail={`KES ${invoice.balance.toLocaleString()} of ${invoice.totalAmount.toLocaleString()}`}
      submitLabel={stk ? `Send prompt · KES ${shown}` : `Record KES ${shown}`}
      submittingLabel={awaiting ? "Waiting for PIN…" : stk ? "Sending prompt…" : "Saving…"}
      submitting={submitting}
      submitDisabled={
        !amountOk ||
        (stk && !isKenyanPhone(phone)) ||
        (method === "mpesa" && mpesaMode === "code" && !reference.trim())
      }
      onClose={() => {
        // The prompt is already on the customer's phone; closing only stops watching it here.
        // If they pay, the server still posts it to the invoice.
        if (awaiting) toast.info("Still listening for the payment", "If the customer pays, it is posted to the invoice automatically.");
        onClose();
      }}
      onSubmit={submit}
    >
      <FormSection id="amount" icon={Receipt} title="Amount">
        <div className="fm-summary">
          <span>Outstanding</span>
          <b style={{ marginLeft: "auto" }}>KES {invoice.balance.toLocaleString()}</b>
        </div>
        <div className="field">
          <FieldLabel htmlFor="pay-amount" required hint="Part payments are fine">Amount</FieldLabel>
          <input id="pay-amount" type="number" min="1" step="0.01" max={invoice.balance} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={awaiting} required autoFocus />
          {value > invoice.balance + 0.005 && <span className="field-error">That's more than the balance.</span>}
        </div>
      </FormSection>
      <FormSection id="method" icon={Hash} title="How it's paid">
        <ChoiceCards
          label="Payment method"
          columns={4}
          options={[
            { value: "mpesa", label: "M-Pesa", tile: "MP" },
            { value: "cash", label: "Cash", tile: "KES" },
            { value: "bank", label: "Bank", tile: "BK" },
            { value: "card", label: "Card", tile: "CD" },
          ]}
          selected={[method]}
          onToggle={(v) => !awaiting && setMethod(v as Method)}
        />

        {method === "mpesa" && (
          <ChoicePills<MpesaMode>
            label="M-Pesa option"
            value={mpesaMode}
            onChange={(v) => !awaiting && setMpesaMode(v)}
            options={[
              { value: "stk", label: "Send prompt to phone", icon: Smartphone },
              { value: "code", label: "Already paid · enter code", icon: KeyRound },
            ]}
          />
        )}

        {stk ? (
          awaiting ? (
            <div className="iv-stk-wait" role="status" aria-live="polite">
              <span className="spin" aria-hidden="true" />
              <div>
                <b>Prompt sent to {phone}</b>
                <span>Ask the customer to enter their M-Pesa PIN. This updates on its own when they pay.</span>
              </div>
            </div>
          ) : (
            <div className="field">
              <FieldLabel htmlFor="pay-phone" required hint="Safaricom number">Customer's phone</FieldLabel>
              <div className="input-icon">
                <input id="pay-phone" className="input" inputMode="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Phone />
              </div>
              {phone.trim() !== "" && !isKenyanPhone(phone) && <span className="field-error">Enter a valid Safaricom number, e.g. 0712 345 678.</span>}
            </div>
          )
        ) : (
          <div className="field">
            <FieldLabel htmlFor="pay-ref" required={method === "mpesa"} hint={method === "mpesa" ? "From the M-Pesa SMS" : "Optional"}>
              {method === "mpesa" ? "M-Pesa code" : "Reference"}
            </FieldLabel>
            <input id="pay-ref" className="input mono" style={{ textTransform: "uppercase" }} placeholder={method === "mpesa" ? "e.g. UG7QOA5LRC" : "Receipt or slip no."} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        )}
      </FormSection>
    </FormModal>
  );
}

export default InvoicePaymentModal;
