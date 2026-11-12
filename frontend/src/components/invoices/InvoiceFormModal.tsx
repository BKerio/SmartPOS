import { useEffect, useMemo, useState } from "react";
import { FileText, Minus, Phone, Plus, Trash2, User, UtensilsCrossed } from "lucide-react";
import FormModal, { ChoiceCards, FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { displayName } from "@/lib/text";

export type InvoiceLine = { menuItemId: string; name: string; price: number; quantity: number };
type MenuOption = { id: string; name: string; price: number; category: string };
type Waiter = { id: string; name: string };

/** An existing invoice, as returned by GET /invoices/:id, to edit. */
export type EditableInvoice = {
  id: string;
  invoiceNo: string;
  customerName: string;
  customerPhone: string | null;
  waiterId: string;
  dueDate: string | null;
  notes: string | null;
  status: string;
  paidAmount: number;
  items: { menuItemId: string | null; description: string; quantity: number; unitPrice: number }[];
};

/** yyyy-mm-dd of a timestamp in East Africa Time. */
const eatDay = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Raise a sales invoice (served now, paid later). Used from the POS (lines prefilled from the cart) and
 * from the Invoices page (pick items here). The waiter who served is required, for payment follow-up.
 */
function InvoiceFormModal({
  initialLines = [],
  editing,
  onClose,
  onCreated,
}: {
  initialLines?: InvoiceLine[];
  /** When set, the form edits this invoice instead of raising a new one. */
  editing?: EditableInvoice;
  onClose: () => void;
  onCreated: (invoice: { id: string; invoiceNo: string; totalAmount: number }) => void;
}) {
  const [lines, setLines] = useState<InvoiceLine[]>(() =>
    editing
      ? editing.items
          .filter((i) => i.menuItemId)
          .map((i) => ({ menuItemId: i.menuItemId!, name: i.description, price: i.unitPrice, quantity: i.quantity }))
      : initialLines,
  );
  const [menu, setMenu] = useState<MenuOption[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [customerName, setCustomerName] = useState(editing?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editing?.customerPhone ?? "");
  const [waiterId, setWaiterId] = useState(editing?.waiterId ?? "");
  const [dueDate, setDueDate] = useState(editing?.dueDate ? eatDay(editing.dueDate) : "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  // Items on a fully paid invoice are final; details can still be corrected.
  const itemsLocked = editing?.status === "paid";
  const paid = editing?.paidAmount ?? 0;
  const [pick, setPick] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    API.get<Waiter[]>("/invoices/waiters").then((r) => setWaiters(r.data)).catch(() => setWaiters([]));
    API.get<MenuOption[]>("/menu").then((r) => setMenu(r.data)).catch(() => setMenu([]));
  }, []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);
  const belowPaid = !!editing && total + 0.005 < paid;

  const addItem = (id: string) => {
    const m = menu.find((x) => x.id === id);
    if (!m) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.menuItemId === id);
      if (existing) return prev.map((l) => (l.menuItemId === id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { menuItemId: m.id, name: m.name, price: m.price, quantity: 1 }];
    });
    setPick("");
  };
  const setQty = (id: string, q: number) =>
    setLines((prev) => (q <= 0 ? prev.filter((l) => l.menuItemId !== id) : prev.map((l) => (l.menuItemId === id ? { ...l, quantity: q } : l))));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waiterId) return toast.warning("Choose the waiter", "Pick who served this order so the payment can be followed up");
    if (lines.length === 0) return toast.warning("Add items", "An invoice needs at least one item");
    setSubmitting(true);
    if (editing) {
      try {
        const { data } = await API.patch(`/invoices/${editing.id}`, {
          customerName,
          customerPhone: customerPhone || null,
          waiterId,
          dueDate: dueDate || null,
          notes: notes || null,
          ...(itemsLocked ? {} : { items: lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })) }),
        });
        toast.success(`${data.invoiceNo} updated`, `KES ${Number(data.totalAmount).toLocaleString()} · balance KES ${Number(data.balance).toLocaleString()}`);
        onCreated(data);
      } catch (err: any) {
        toast.error("Could not save changes", err.response?.data?.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const { data } = await API.post("/invoices", {
        customerName,
        customerPhone: customerPhone || undefined,
        waiterId,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
      });
      toast.success(`Invoice ${data.invoiceNo} raised`, `KES ${Number(data.totalAmount).toLocaleString()} for ${data.customerName}`);
      onCreated(data);
    } catch (err: any) {
      toast.error("Could not raise invoice", err.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal
      icon={FileText}
      title={editing ? `Edit ${editing.invoiceNo}` : "Raise a sales invoice"}
      subtitle={
        editing
          ? "Correct the customer, waiter, due date or items. Stock moves only by what you add or take off."
          : "For food served now and paid later. Name the waiter who served it so payment can be followed up."
      }
      steps={[
        { id: "customer", label: "Customer", done: !!customerName.trim() },
        { id: "waiter", label: "Waiter", done: !!waiterId },
        { id: "items", label: "Items", done: lines.length > 0 },
      ]}
      statusLabel={editing ? "Editing" : "New invoice"}
      statusDetail={`${customerName || "Untitled"} · KES ${total.toLocaleString()}`}
      submitLabel={editing ? `Save changes · KES ${total.toLocaleString()}` : `Raise invoice · KES ${total.toLocaleString()}`}
      submittingLabel={editing ? "Saving…" : "Raising…"}
      submitting={submitting}
      submitDisabled={!lines.length || !waiterId || belowPaid}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormSection id="customer" icon={User} title="Customer">
        <div className="fm-grid-2">
          <div className="field">
            <FieldLabel htmlFor="inv-customer" required>Customer name</FieldLabel>
            <input id="inv-customer" className="input" placeholder="e.g. Mr. Otieno (Science Dept)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <FieldLabel htmlFor="inv-phone" hint="For reminders">Phone number</FieldLabel>
            <div className="input-icon">
              <input id="inv-phone" className="input" placeholder="0712 345 678" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              <Phone />
            </div>
          </div>
        </div>
        <div className="fm-grid-2">
          <div className="field">
            <FieldLabel htmlFor="inv-due" hint="Optional">Pay by</FieldLabel>
            <input id="inv-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="field">
            <FieldLabel htmlFor="inv-notes" hint="Optional">Notes</FieldLabel>
            <input id="inv-notes" className="input" placeholder="e.g. Staff lunch, billed monthly" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </FormSection>

      <FormSection id="waiter" icon={UtensilsCrossed} title="Served by">
        {waiters.length === 0 ? (
          <p className="fm-note">No approved restaurant staff found. Approve a staff account first.</p>
        ) : (
          <ChoiceCards
            label="Waiter"
            columns={3}
            options={waiters.map((w) => ({ value: w.id, label: displayName(w.name) }))}
            selected={waiterId ? [waiterId] : []}
            onToggle={setWaiterId}
          />
        )}
      </FormSection>

      <FormSection id="items" icon={FileText} title="Items">
        {itemsLocked && <p className="fm-note">This invoice is fully paid, so its items can't change.</p>}
        {belowPaid && <p className="field-error">KES {paid.toLocaleString()} has already been paid. The total can't go below that.</p>}
        {!itemsLocked && (
        <div className="field">
          <FieldLabel htmlFor="inv-pick">Add a menu item</FieldLabel>
          <select id="inv-pick" className="input" value={pick} onChange={(e) => addItem(e.target.value)}>
            <option value="">Choose an item…</option>
            {menu.map((m) => (
              <option key={m.id} value={m.id}>{displayName(m.name)} · KES {m.price.toLocaleString()}</option>
            ))}
          </select>
        </div>
        )}
        {lines.length === 0 ? (
          <p className="fm-note">No items yet.</p>
        ) : (
          <div className="inv-lines">
            {lines.map((l) => (
              <div key={l.menuItemId} className="inv-line">
                <div className="min-w-0">
                  <b>{displayName(l.name)}</b>
                  <span>KES {l.price.toLocaleString()} each</span>
                </div>
                {!itemsLocked && <div className="inv-qty">
                  <button type="button" onClick={() => setQty(l.menuItemId, l.quantity - 1)} aria-label="One less">{l.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                  <span>{l.quantity}</span>
                  <button type="button" onClick={() => setQty(l.menuItemId, l.quantity + 1)} aria-label="One more"><Plus size={14} /></button>
                </div>}
                {itemsLocked && <span className="mono">× {l.quantity}</span>}
                <strong>KES {(l.price * l.quantity).toLocaleString()}</strong>
              </div>
            ))}
            <div className="inv-line inv-total">
              <b>Total</b>
              <span />
              <strong>KES {total.toLocaleString()}</strong>
            </div>
          </div>
        )}
      </FormSection>
    </FormModal>
  );
}

export default InvoiceFormModal;
