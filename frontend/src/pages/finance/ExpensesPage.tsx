import { useEffect, useState } from "react";
import { Banknote, ClipboardList, Plus, ReceiptText } from "lucide-react";
import { ChoicePills, FieldLabel, FormCard, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { PageHeader } from "@/components/page/Page";

interface Expense {
  id: string; category: string; amount: number; description: string; date: string;
}

const CATEGORIES = ["Salaries", "Utilities", "Maintenance", "Ingredients", "Equipment", "Other"];

const ExpensesPage = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [form, setForm] = useState({ category: "Ingredients", amount: "", description: "", date: "" });

  const fetchExpenses = async () => {
    try {
      const { data } = await API.get("/finance/expenses");
      setExpenses(data);
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  useEffect(() => { fetchExpenses(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post("/finance/expenses", {
        ...form,
        amount: Number(form.amount),
        date: form.date || undefined,
      });
      setForm({ category: "Ingredients", amount: "", description: "", date: "" });
      fetchExpenses();
      toast.success("Expense recorded");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-4 md:p-8 bg-page min-h-screen font-sans space-y-6">
      <PageHeader icon={ClipboardList} eyebrow="Finance" title="Expenses" subtitle="Record and track operating expenses" metric={{ label: "Total recorded", value: `KES ${total.toLocaleString()}` }} />

      <FormCard
        icon={ReceiptText}
        title="Record an expense"
        subtitle="Log money spent on running the cafeteria."
        statusLabel={form.category}
        statusDetail={form.amount ? `KES ${Number(form.amount).toLocaleString()}` : ""}
        submitLabel="Record expense"
        submitIcon={Plus}
        onSubmit={handleSubmit}
      >
        <FormSection id="expense" icon={ClipboardList} title="Expense">
          <div className="field">
            <FieldLabel required>Category</FieldLabel>
            <ChoicePills label="Category" value={form.category} options={CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(v) => setForm({ ...form, category: v })} />
          </div>
          <div className="fm-grid-2">
            <div className="field">
              <FieldLabel htmlFor="ex-amount" required hint="KES">Amount</FieldLabel>
              <div className="input-icon">
                <input id="ex-amount" type="number" min="0" step="0.01" className="input" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                <Banknote />
              </div>
            </div>
            <div className="field">
              <FieldLabel htmlFor="ex-date" hint="Defaults to today">Date</FieldLabel>
              <input id="ex-date" type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <FieldLabel htmlFor="ex-desc" required>Description</FieldLabel>
            <input id="ex-desc" className="input" placeholder="e.g. Cooking gas refill (2 x 13 kg)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
        </FormSection>
      </FormCard>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((exp) => (
              <tr key={exp.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 text-gray-600">{new Date(exp.date).toLocaleDateString()}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium">{exp.category}</span></td>
                <td className="px-4 py-3 text-gray-700">{exp.description}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">KES {exp.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ExpensesPage;
