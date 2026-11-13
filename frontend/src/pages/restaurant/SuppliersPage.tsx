import { useEffect, useMemo, useState } from "react";
import {
  Truck,
  Plus,
  Edit,
  Trash2,
  X,
  Search,
  Package,
  Phone,
  Mail,
  User,
  MapPin,
  ClipboardList,
  Building2,
} from "lucide-react";
import FormModal, { FieldLabel, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import Loader from "@/components/ui/loader";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, StatTile, StatTiles } from "@/components/page/Page";
import { Avatar, PersonCell } from "@/components/page/DataTable";
import { displayName } from "@/lib/text";

type SupplierRow = {
  id: string;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  _count?: { stockMovements: number };
};

type StockMovementRow = {
  id: string;
  type: string;
  quantity: number;
  reason: string;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
  inventoryItem: { id: string; name: string; unit: string };
  supplier?: { id: string; name: string } | null;
};

const emptySupplier = {
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
};


const SuppliersPage = () => {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "restaurant";
  const canDelete = user?.role === "admin";

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptySupplier);
  const [searchQuery, setSearchQuery] = useState("");
  const [historySupplierId, setHistorySupplierId] = useState<string | null>(null);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data } = await API.get<SupplierRow[]>("/inventory/suppliers");
      setSuppliers(data);
    } catch (e: any) {
      toast.error("Failed to load suppliers", e.response?.data?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchMovements = async (supplierId: string) => {
    setLoadingMovements(true);
    try {
      const { data } = await API.get<StockMovementRow[]>("/inventory/movements", {
        params: { supplierId, type: "IN", limit: 50 },
      });
      setMovements(data);
    } catch (e: any) {
      toast.error("Failed to load purchase history", e.response?.data?.message);
    } finally {
      setLoadingMovements(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.contactPerson, s.email, s.phone, s.address]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [suppliers, searchQuery]);

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptySupplier);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptySupplier);
    setShowForm(true);
  };

  const openEdit = (s: SupplierRow) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson || "",
      email: s.email || "",
      phone: s.phone || "",
      address: s.address || "",
    });
    setShowForm(true);
  };

  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      };
      if (editId) {
        await API.put(`/inventory/suppliers/${editId}`, payload);
        toast.success("Supplier updated");
      } else {
        await API.post("/inventory/suppliers", payload);
        toast.success("Supplier added");
      }
      closeForm();
      fetchSuppliers();
    } catch (e: any) {
      toast.error("Save failed", e.response?.data?.message);
    }
  };

  const deleteSupplier = async (s: SupplierRow) => {
    const confirmed = await toast.confirm(`Delete ${s.name}?`, {
      description: "Only suppliers with no purchase history can be removed.",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    try {
      await API.delete(`/inventory/suppliers/${s.id}`);
      toast.success("Supplier deleted");
      if (historySupplierId === s.id) setHistorySupplierId(null);
      fetchSuppliers();
    } catch (e: any) {
      toast.error("Delete failed", e.response?.data?.message);
    }
  };

  const toggleHistory = (supplierId: string) => {
    if (historySupplierId === supplierId) {
      setHistorySupplierId(null);
      setMovements([]);
      return;
    }
    setHistorySupplierId(supplierId);
    fetchMovements(supplierId);
  };

  const historySupplier = suppliers.find((s) => s.id === historySupplierId);
  const totalPurchases = suppliers.reduce((sum, s) => sum + (s._count?.stockMovements || 0), 0);

  if (loading) {
    return (
      <Loader
        size="sm"
        title="Loading suppliers..."
        subtitle="Fetching vendor directory"
        className="min-h-screen py-24"
      />
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-5">
      <PageHeader
        icon={Truck}
        eyebrow="Kitchen"
        title="Suppliers"
        subtitle="Vendors who deliver ingredients. Link them when recording stock purchases on Inventory."
        actions={canEdit ? <button type="button" onClick={openCreate} className="btn btn-primary"><Plus size={16} /> Add supplier</button> : undefined}
      />

      <StatTiles cols={3}>
        <StatTile label="Suppliers" value={suppliers.length} hint="Vendors that deliver ingredients" icon={Truck} tone="navy" />
        <StatTile label="Purchase records" value={totalPurchases} hint="Stock-in deliveries linked to a supplier" icon={Package} tone="green" />
        <StatTile label="How purchases are recorded" value={<span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: 0 }}>Inventory → Stock in → pick supplier & invoice</span>} icon={ClipboardList} tone="gold" />
      </StatTiles>

      <section className="dt">
        <div className="dt-toolbar">
          <label className="dt-search">
            <Search size={16} />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search name, contact, phone or email" aria-label="Search suppliers" />
            {searchQuery && (
              <button type="button" className="dt-icon" style={{ width: 26, height: 26 }} onClick={() => setSearchQuery("")} aria-label="Clear search"><X size={14} /></button>
            )}
          </label>
          <span className="dt-count">{filteredSuppliers.length === suppliers.length ? `${suppliers.length} suppliers` : `${filteredSuppliers.length} of ${suppliers.length}`}</span>
        </div>

        {filteredSuppliers.length === 0 ? (
          <div className="dt-empty">
            <b>{suppliers.length === 0 ? "No suppliers yet" : "No suppliers match"}</b>
            {suppliers.length === 0 ? "Add your first vendor to track purchases." : "Try another search."}
          </div>
        ) : (
          <div className="dt-scroll">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact person</th>
                  <th>Phone</th>
                  <th className="hide-sm">Email</th>
                  <th className="num">Purchases</th>
                  <th className="act">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s) => (
                  <tr key={s.id} className={historySupplierId === s.id ? "click is-open" : "click"} onClick={() => toggleHistory(s.id)}>
                    <td><PersonCell name={s.name} sub={s.address ? <><MapPin size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {s.address}</> : "Supplier"} /></td>
                    <td>
                      {s.contactPerson ? (
                        <div className="dt-person"><Avatar name={s.contactPerson} size="sm" /><span style={{ color: "var(--ink-2)" }}>{displayName(s.contactPerson)}</span></div>
                      ) : (
                        <span className="dt-muted">-</span>
                      )}
                    </td>
                    <td>{s.phone ? <a className="dt-mono" href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()}>{s.phone}</a> : <span className="dt-muted">-</span>}</td>
                    <td className="hide-sm">{s.email ? <span style={{ color: "var(--ink-2)" }}>{s.email}</span> : <span className="pill pill-gray">No email</span>}</td>
                    <td className="num"><span className="dt-amount">{s._count?.stockMovements ?? 0}</span></td>
                    <td className="act" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="dt-icon" title="Purchase history" aria-label={`Purchase history for ${s.name}`} onClick={() => toggleHistory(s.id)}><Package size={16} /></button>
                      {canEdit && <button type="button" className="dt-icon" title="Edit" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}><Edit size={16} /></button>}
                      {canDelete && <button type="button" className="dt-icon danger" title="Delete" aria-label={`Delete ${s.name}`} onClick={() => deleteSupplier(s)}><Trash2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {historySupplierId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-extrabold text-brand">
              Purchase history - {historySupplier?.name}
            </h3>
            <button
              onClick={() => {
                setHistorySupplierId(null);
                setMovements([]);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-gray-500"
            >
              <X size={18} />
            </button>
          </div>
          {loadingMovements ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading purchases...</p>
          ) : movements.length === 0 ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">
              No stock-in purchases recorded for this supplier yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-gray-500 uppercase text-[10px]">
                <tr>
                  <th className="px-5 py-3 text-left font-extrabold">Date</th>
                  <th className="px-5 py-3 text-left font-extrabold">Item</th>
                  <th className="px-5 py-3 text-right font-extrabold">Qty</th>
                  <th className="px-5 py-3 text-left font-extrabold">Invoice</th>
                  <th className="px-5 py-3 text-left font-extrabold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-semibold text-brand">{m.inventoryItem.name}</td>
                    <td className="px-5 py-3 text-right">
                      {m.quantity} {m.inventoryItem.unit}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{m.reference || "-"}</td>
                    <td className="px-5 py-3 text-gray-500">{m.notes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && canEdit && (
        <FormModal
          icon={Truck}
          title={editId ? "Edit supplier" : "Add a supplier"}
          subtitle={editId ? "Update the supplier's contact details." : "Add a business you buy stock from."}
          steps={[
            { id: "business", label: "Business", done: !!form.name.trim() },
            { id: "contact", label: "Contact", done: !!(form.phone.trim() || form.email.trim()) },
          ]}
          statusLabel={editId ? "Editing supplier" : "New supplier"}
          statusDetail={form.name}
          submitLabel={editId ? "Save changes" : "Add supplier"}
          onClose={closeForm}
          onSubmit={saveSupplier}
        >
          <FormSection id="business" icon={Building2} title="Business">
            <div className="field">
              <FieldLabel htmlFor="su-name" required>Business name</FieldLabel>
              <input id="su-name" className="input" placeholder="e.g. Fresh Farm Produce Ltd" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <FieldLabel htmlFor="su-person" hint="Optional">Contact person</FieldLabel>
              <div className="input-icon">
                <input id="su-person" className="input" placeholder="e.g. John Mwangi" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                <User />
              </div>
            </div>
          </FormSection>
          <FormSection id="contact" icon={Phone} title="Contact">
            <div className="fm-grid-2">
              <div className="field">
                <FieldLabel htmlFor="su-phone" hint="Optional">Phone number</FieldLabel>
                <div className="input-icon">
                  <input id="su-phone" className="input" placeholder="0712 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  <Phone />
                </div>
              </div>
              <div className="field">
                <FieldLabel htmlFor="su-email" hint="Optional">Email</FieldLabel>
                <div className="input-icon">
                  <input id="su-email" type="email" className="input" placeholder="e.g. orders@supplier.co.ke" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <Mail />
                </div>
              </div>
            </div>
            <div className="field">
              <FieldLabel htmlFor="su-addr" hint={`${form.address.length} characters`}>Address</FieldLabel>
              <textarea id="su-addr" className="eoc-textarea" placeholder="e.g. Industrial Area, Nairobi" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </FormSection>
        </FormModal>
      )}
    </div>
  );
};

export default SuppliersPage;
