import { useEffect, useState } from "react";
import { Package, AlertTriangle, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";

interface InventoryItem {
  id: string; name: string; category: string; unit: string;
  stockLevel: number; reorderLevel: number; unitCost: number;
}

const InventoryPage = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [newItem, setNewItem] = useState({ name: "", category: "Grains", unit: "kg", reorderLevel: "10", unitCost: "0" });
  const [movement, setMovement] = useState({ inventoryItemId: "", type: "IN", quantity: "", reason: "purchase", notes: "" });

  const fetchItems = async () => {
    try {
      const { data } = await API.get("/inventory/items");
      setItems(data);
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post("/inventory/items", {
        ...newItem,
        reorderLevel: Number(newItem.reorderLevel),
        unitCost: Number(newItem.unitCost),
      });
      setNewItem({ name: "", category: "Grains", unit: "kg", reorderLevel: "10", unitCost: "0" });
      fetchItems();
      toast.success("Item added");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const recordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.post("/inventory/movements", {
        ...movement,
        quantity: Number(movement.quantity),
      });
      setMovement({ inventoryItemId: "", type: "IN", quantity: "", reason: "purchase", notes: "" });
      fetchItems();
      toast.success("Movement recorded");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const lowStock = items.filter((i) => i.stockLevel <= i.reorderLevel);

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans space-y-6">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Package /> Inventory</h2>
        <p className="text-blue-200 text-sm mt-1">Track stock levels, movements, and low-stock alerts</p>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-amber-800">Low Stock Alert</p>
            <p className="text-sm text-amber-700 mt-1">{lowStock.map((i) => `${i.name} (${i.stockLevel} ${i.unit})`).join(", ")}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={addItem} className="bg-white rounded-2xl p-6 border border-gray-100 space-y-3">
          <h3 className="font-bold text-[#0A1F44]">Add Inventory Item</h3>
          <input placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required />
          <div className="grid grid-cols-2 gap-3">
            <select value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              {["Grains", "Vegetables", "Meat", "Dairy", "Spices", "Other"].map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              {["kg", "liters", "pieces", "bags"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Reorder level" value={newItem.reorderLevel} onChange={(e) => setNewItem({ ...newItem, reorderLevel: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="number" placeholder="Unit cost (KES)" value={newItem.unitCost} onChange={(e) => setNewItem({ ...newItem, unitCost: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <button type="submit" className="w-full py-2 bg-[#0A1F44] text-white rounded-lg font-semibold text-sm">Add Item</button>
        </form>

        <form onSubmit={recordMovement} className="bg-white rounded-2xl p-6 border border-gray-100 space-y-3">
          <h3 className="font-bold text-[#0A1F44]">Record Stock Movement</h3>
          <select value={movement.inventoryItemId} onChange={(e) => setMovement({ ...movement, inventoryItemId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required>
            <option value="">Select item</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.stockLevel} {i.unit})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
              <option value="IN">Stock IN</option>
              <option value="OUT">Stock OUT</option>
            </select>
            <input type="number" placeholder="Quantity" value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} className="px-3 py-2 border rounded-lg text-sm" required />
          </div>
          <select value={movement.reason} onChange={(e) => setMovement({ ...movement, reason: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
            {["purchase", "usage", "spoilage", "adjustment"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <input placeholder="Notes (optional)" value={movement.notes} onChange={(e) => setMovement({ ...movement, notes: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg font-semibold text-sm">Record Movement</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Item</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Reorder</th>
              <th className="px-4 py-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={`border-t border-gray-50 ${item.stockLevel <= item.reorderLevel ? "bg-amber-50/50" : ""}`}>
                <td className="px-4 py-3 font-medium text-[#0A1F44]">{item.name}</td>
                <td className="px-4 py-3 text-gray-600">{item.category}</td>
                <td className="px-4 py-3 text-right">
                  <span className="flex items-center justify-end gap-1">
                    {item.stockLevel <= item.reorderLevel ? <ArrowDownCircle size={14} className="text-amber-500" /> : <ArrowUpCircle size={14} className="text-green-500" />}
                    {item.stockLevel} {item.unit}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500">{item.reorderLevel}</td>
                <td className="px-4 py-3 text-right font-medium">KES {(item.stockLevel * item.unitCost).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InventoryPage;
