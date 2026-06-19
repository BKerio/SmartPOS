import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ClipboardList } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";

interface MenuItem {
  id: string; name: string; description?: string; price: number;
  category: string; isAvailable: boolean;
}

const CATEGORIES = ["Breakfast", "Lunch", "Snack", "Drink"];

const MenuManagement = () => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "Lunch" });
  const [editing, setEditing] = useState<string | null>(null);

  const fetchItems = async () => {
    try {
      const { data } = await API.get("/menu/all");
      setItems(data);
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) return;
    try {
      if (editing) {
        await API.put(`/menu/${editing}`, { ...form, price: Number(form.price) });
      } else {
        await API.post("/menu", { ...form, price: Number(form.price) });
      }
      setForm({ name: "", description: "", price: "", category: "Lunch" });
      setEditing(null);
      fetchItems();
      toast.success(editing ? "Updated" : "Added");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const startEdit = (item: MenuItem) => {
    setEditing(item.id);
    setForm({ name: item.name, description: item.description || "", price: String(item.price), category: item.category });
  };

  const toggleAvailability = async (item: MenuItem) => {
    await API.put(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    const r = await toast.confirm("Delete item?", { confirmLabel: "Delete" });
    if (!r) return;
    await API.delete(`/menu/${id}`);
    fetchItems();
  };

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans space-y-6">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
        <h2 className="text-2xl font-bold flex items-center gap-2"><ClipboardList /> Menu Management</h2>
        <p className="text-blue-200 text-sm mt-1">Add, edit, and manage cafeteria menu items</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <input placeholder="Item name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
        <input type="number" placeholder="Price (KES)" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" className="flex items-center justify-center gap-2 bg-[#0A1F44] text-white rounded-lg py-2 font-semibold text-sm hover:bg-[#0A1F44]/90">
          <Plus size={16} /> {editing ? "Update" : "Add Item"}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-[#0A1F44]">{item.name}</p>
                  {item.description && <p className="text-xs text-gray-400">{item.description}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600">{item.category}</td>
                <td className="px-4 py-3 text-right font-semibold">KES {item.price}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleAvailability(item)} className={`px-2 py-1 rounded-full text-xs font-medium ${item.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {item.isAvailable ? "Available" : "Unavailable"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => startEdit(item)} className="p-1.5 text-gray-400 hover:text-indigo-600"><Pencil size={16} /></button>
                  <button onClick={() => deleteItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MenuManagement;
