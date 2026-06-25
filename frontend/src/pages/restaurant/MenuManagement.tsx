import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  AlertTriangle,
  Plus,
  Pencil,
  Save,
  Trash2,
  CheckCircle,
  XCircle,
  List,
  Link2,
} from "lucide-react";
import API from "@/services/api";
import { toast } from "@/services/toast";

export type Tab = "list" | "add" | "edit" | "update" | "delete" | "recipes";

interface InventoryOption {
  id: string;
  name: string;
  unit: string;
  stockLevel: number;
}

interface RecipeRow {
  inventoryItemId: string;
  quantity: string;
}

interface MenuIngredient {
  id: string;
  quantity: number;
  inventoryItem: InventoryOption;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  isAvailable: boolean;
  ingredients?: MenuIngredient[];
}

const CATEGORIES = ["Breakfast", "Lunch", "Snack", "Drink"];
const EMPTY_FORM = { name: "", description: "", price: "", category: "Lunch" };

const inputClass = "w-full px-3 py-2 border rounded-lg text-sm";
const selectClass = "w-full px-3 py-2 border rounded-lg text-sm";

const TABS: { id: Tab; label: string; icon: React.FC<{ size?: number }> }[] = [
  { id: "list", label: "All Items", icon: List },
  { id: "add", label: "Add", icon: Plus },
  { id: "edit", label: "Edit", icon: Pencil },
  { id: "update", label: "Update", icon: Save },
  { id: "delete", label: "Delete", icon: Trash2 },
  { id: "recipes", label: "Recipes", icon: Link2 },
];

type Props = {
  initialTab?: Tab;
  showTabs?: boolean;
};

const MenuManagement = ({ initialTab = "list", showTabs = true }: Props) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);

  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState("");

  const [recipeMenuId, setRecipeMenuId] = useState("");
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [savingRecipe, setSavingRecipe] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async () => {
    try {
      const { data } = await API.get("/menu/all");
      setItems(data);
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const fetchInventory = async () => {
    try {
      const { data } = await API.get("/inventory/items");
      setInventory(data);
    } catch {
      /* optional */
    }
  };

  useEffect(() => {
    fetchItems();
    fetchInventory();
  }, []);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const selectedItem = items.find((i) => i.id === selectedId);
  const deleteTarget = items.find((i) => i.id === deleteId);

  const loadIntoDraft = (item: MenuItem) => {
    setSelectedId(item.id);
    setDraft({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      category: item.category,
    });
  };

  const loadRecipe = async (menuItemId: string) => {
    setRecipeMenuId(menuItemId);
    if (!menuItemId) {
      setRecipeRows([]);
      return;
    }
    try {
      const { data } = await API.get(`/menu/${menuItemId}/ingredients`);
      setRecipeRows(
        data.length > 0
          ? data.map((r: MenuIngredient) => ({
              inventoryItemId: r.inventoryItem.id,
              quantity: String(r.quantity),
            }))
          : [{ inventoryItemId: "", quantity: "" }],
      );
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.price) return;
    setSubmitting(true);
    try {
      await API.post("/menu", { ...addForm, price: Number(addForm.price) });
      setAddForm(EMPTY_FORM);
      await fetchItems();
      toast.success("Menu item added");
      if (showTabs) setTab("list");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.name || !draft.price) {
      return toast.warning("Select an item in Edit first, or pick one below");
    }
    setSubmitting(true);
    try {
      await API.put(`/menu/${selectedId}`, {
        name: draft.name,
        description: draft.description,
        price: Number(draft.price),
        category: draft.category,
      });
      await fetchItems();
      toast.success("Menu item updated");
      if (showTabs) setTab("list");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return toast.warning("Select an item to delete");
    const confirmed = await toast.confirm(
      `Delete "${deleteTarget?.name}"? This cannot be undone.`,
      { confirmLabel: "Delete" },
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await API.delete(`/menu/${deleteId}`);
      if (selectedId === deleteId) {
        setSelectedId("");
        setDraft(EMPTY_FORM);
      }
      if (recipeMenuId === deleteId) {
        setRecipeMenuId("");
        setRecipeRows([]);
      }
      setDeleteId("");
      await fetchItems();
      toast.success("Menu item deleted");
      if (showTabs) setTab("list");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const saveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeMenuId) return;
    const ingredients = recipeRows
      .filter((r) => r.inventoryItemId && Number(r.quantity) > 0)
      .map((r) => ({
        inventoryItemId: r.inventoryItemId,
        quantity: Number(r.quantity),
      }));
    setSavingRecipe(true);
    try {
      await API.put(`/menu/${recipeMenuId}/ingredients`, { ingredients });
      toast.success("Recipe saved");
      fetchItems();
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSavingRecipe(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await API.put(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
      fetchItems();
      toast.success(item.isAvailable ? "Marked unavailable" : "Marked available");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

  const goToEdit = (item: MenuItem) => {
    loadIntoDraft(item);
    if (showTabs) setTab("edit");
  };

  const goToDelete = (item: MenuItem) => {
    setDeleteId(item.id);
    if (showTabs) setTab("delete");
  };

  const unavailable = items.filter((i) => !i.isAvailable);
  const recipeMenu = items.find((i) => i.id === recipeMenuId);

  const tabsToShow = useMemo(() => {
    if (showTabs) return TABS;
    return TABS.filter((t) => t.id === tab);
  }, [showTabs, tab]);

  return (
    <div className="p-4 md:p-8 bg-[#E8F4FD] min-h-screen font-sans space-y-6">
      <div className="bg-[#0A1F44] text-white rounded-2xl p-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList /> Menu Management
        </h2>
        <p className="text-blue-200 text-sm mt-1">
          Use separate tabs to add, edit, update, delete items, and manage recipes
        </p>
      </div>

      {unavailable.length > 0 && tab === "list" && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-amber-800">Unavailable Items</p>
            <p className="text-sm text-amber-700 mt-1">
              {unavailable.map((i) => `${i.name} (${i.category})`).join(", ")}
            </p>
          </div>
        </div>
      )}

      {showTabs && (
        <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-2 border border-gray-100">
          {tabsToShow.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                tab === id
                  ? "bg-[#0A1F44] text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "list" && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-gray-500 uppercase text-[10px] border-b border-slate-100">
              <tr>
                <th className="px-5 py-4 text-left font-extrabold tracking-wider">Item</th>
                <th className="px-5 py-4 text-left font-extrabold tracking-wider">Category</th>
                <th className="px-5 py-4 text-left font-extrabold tracking-wider">Recipe</th>
                <th className="px-5 py-4 text-right font-extrabold tracking-wider">Price</th>
                <th className="px-5 py-4 text-center font-extrabold tracking-wider">Status</th>
                <th className="px-5 py-4 text-right font-extrabold tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                    No menu items yet. Use the <strong>Add</strong> tab.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/40 transition duration-150 ${!item.isAvailable ? "bg-amber-50/20" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-extrabold text-[#0A1F44]">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">{item.category}</span>
                    </td>
                    <td className="px-5 py-4 text-xs text-gray-500">
                      {item.ingredients?.length ? (
                        <div className="flex flex-col gap-0.5">
                          {item.ingredients.map((ing) => (
                            <span key={ing.id} className="text-gray-650 font-medium">
                              • {ing.quantity} {ing.inventoryItem.unit} {ing.inventoryItem.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">No ingredients linked</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-black text-[#0A1F44]">
                      KES {item.price.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => toggleAvailability(item)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition ${
                          item.isAvailable
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100/50 hover:bg-emerald-100"
                            : "bg-amber-50 text-amber-700 border-amber-100/50 hover:bg-amber-100"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${item.isAvailable ? "bg-emerald-600" : "bg-amber-600"}`} />
                        {item.isAvailable ? "Available" : "Unavailable"}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => goToEdit(item)}
                          className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg transition duration-150"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            loadRecipe(item.id);
                            setTab("recipes");
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-[#0A1F44] hover:bg-[#0A1F44]/5 border border-slate-200 rounded-lg transition duration-150"
                        >
                          Recipe
                        </button>
                        <button
                          type="button"
                          onClick={() => goToDelete(item)}
                          className="px-2.5 py-1 text-xs font-bold text-red-650 hover:bg-red-50 border border-red-100 rounded-lg transition duration-150"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "add" && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4 max-w-lg shadow-sm"
        >
          <h3 className="font-extrabold text-[#0A1F44] text-lg">Add new menu item</h3>
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Item Name</label>
            <input
              placeholder="e.g. Grilled Chicken Salad"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Description (optional)</label>
            <input
              placeholder="e.g. Served with fresh vinaigrette dressing"
              value={addForm.description}
              onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Price (KES)</label>
              <input
                type="number"
                placeholder="0.00"
                value={addForm.price}
                onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
                required
                min="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Category</label>
              <select
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#0A1F44] hover:bg-[#0A1F44]/90 text-white rounded-xl font-extrabold text-sm disabled:opacity-50 transition duration-200 shadow-sm"
          >
            {submitting ? "Adding Item..." : "Add Menu Item"}
          </button>
        </form>
      )}

      {tab === "edit" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4 max-w-lg shadow-sm">
          <h3 className="font-extrabold text-[#0A1F44] text-lg">Edit Menu Item</h3>
          <p className="text-xs text-gray-400 leading-normal">
            Choose an item to load its details. You can make and save adjustments in the <strong>Update</strong> tab.
          </p>
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Menu Item</label>
            <select
              value={selectedId}
              onChange={(e) => {
                const item = items.find((i) => i.id === e.target.value);
                if (item) loadIntoDraft(item);
                else {
                  setSelectedId("");
                  setDraft(EMPTY_FORM);
                }
              }}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
            >
              <option value="">Select menu item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.category}) - KES {i.price}
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 space-y-3.5 text-xs text-slate-700 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex justify-between items-start border-b border-indigo-100/40 pb-2">
                <span className="font-bold text-indigo-900 text-sm">{selectedItem.name}</span>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md font-bold uppercase tracking-wider text-[9px]">{selectedItem.category}</span>
              </div>
              <div className="space-y-2">
                <p className="flex justify-between">
                  <span className="text-slate-400">Current Price:</span> 
                  <span className="font-bold text-[#0A1F44]">KES {selectedItem.price.toLocaleString()}</span>
                </p>
                {selectedItem.description && (
                  <p className="flex flex-col gap-1">
                    <span className="text-slate-400">Description:</span> 
                    <span className="font-semibold text-slate-650 bg-white rounded-lg p-2 border border-slate-100 leading-normal">{selectedItem.description}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setTab("update")}
                className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition duration-200 shadow-sm"
              >
                Proceed to Update Details →
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "update" && (
        <form
          onSubmit={handleUpdate}
          className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4 max-w-lg shadow-sm"
        >
          <h3 className="font-extrabold text-[#0A1F44] text-lg">Update Menu Item</h3>
          
          {!selectedId && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200/50 rounded-xl p-3 leading-normal font-semibold">
              ⚠️ No item selected. Please choose a menu item from the list below to begin editing.
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Target Menu Item</label>
            <select
              value={selectedId}
              onChange={(e) => {
                const item = items.find((i) => i.id === e.target.value);
                if (item) loadIntoDraft(item);
                else {
                  setSelectedId("");
                  setDraft(EMPTY_FORM);
                }
              }}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
            >
              <option value="">Select menu item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.category})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">New Item Name</label>
            <input
              placeholder="Item name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 disabled:opacity-50"
              disabled={!selectedId}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">New Description</label>
            <input
              placeholder="Description (optional)"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 disabled:opacity-50"
              disabled={!selectedId}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">New Price (KES)</label>
              <input
                type="number"
                placeholder="Price"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 disabled:opacity-50 font-semibold"
                disabled={!selectedId}
                required
                min="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">New Category</label>
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 disabled:opacity-50 font-semibold"
                disabled={!selectedId}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedId || submitting}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition duration-200 shadow-sm"
          >
            {submitting ? "Updating Item..." : "Save Changes"}
          </button>
        </form>
      )}

      {tab === "delete" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4 max-w-lg shadow-sm">
          <h3 className="font-extrabold text-red-750 text-lg">Delete Menu Item</h3>
          <p className="text-xs text-gray-400 leading-normal">
            Select a dish to remove from the system. Linked recipes will also be cleaned up.
          </p>
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Item to Remove</label>
            <select
              value={deleteId}
              onChange={(e) => setDeleteId(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
            >
              <option value="">Select menu item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.category}) - KES {i.price}
                </option>
              ))}
            </select>
          </div>

          {deleteTarget && (
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5 space-y-4 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex justify-between items-start border-b border-rose-100 pb-2">
                <span className="font-bold text-rose-900 text-sm">{deleteTarget.name}</span>
                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md font-bold uppercase tracking-wider text-[9px]">{deleteTarget.category}</span>
              </div>
              <div className="space-y-1 text-rose-800">
                <p>Price: KES {deleteTarget.price.toLocaleString()}</p>
                {deleteTarget.description && <p>Description: {deleteTarget.description}</p>}
                <p className="font-bold text-red-700 mt-2">⚠️ Warning: This action is permanent and cannot be undone.</p>
              </div>
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-extrabold text-xs transition duration-200 shadow-sm"
              >
                {submitting ? "Deleting permanently..." : "Delete Permanently"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "recipes" && (
        <form
          onSubmit={saveRecipe}
          className="bg-white rounded-2xl p-6 border border-slate-100 space-y-5 shadow-sm"
        >
          <div>
            <h3 className="font-extrabold text-[#0A1F44] text-lg">Recipe / Ingredients</h3>
            <p className="text-xs text-gray-400 mt-1 leading-normal">
              Map inventory items to a menu dish. SmartPOS automatically subtracts ingredients from inventory on POS checkouts.
            </p>
          </div>
          
          <div className="space-y-1 max-w-md">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Dish</label>
            <select
              value={recipeMenuId}
              onChange={(e) => loadRecipe(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44] focus:bg-white transition-all duration-200 font-semibold"
            >
              <option value="">Select menu item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} - {i.ingredients?.length ?? 0} ingredient(s) linked
                </option>
              ))}
            </select>
          </div>

          {recipeMenuId && (
            <div className="space-y-3.5 border-t border-slate-100 pt-5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Recipe Composition</label>
              <div className="space-y-3">
                {recipeRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-center bg-gray-50 border border-slate-100 p-3 rounded-2xl"
                  >
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">Ingredient Item</label>
                      <select
                        value={row.inventoryItemId}
                        onChange={(e) => {
                          const next = [...recipeRows];
                          next[idx] = { ...next[idx], inventoryItemId: e.target.value };
                          setRecipeRows(next);
                        }}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#0A1F44] font-semibold"
                        required
                      >
                        <option value="">Choose Inventory item</option>
                        {inventory.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.stockLevel} {inv.unit} in stock)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">Quantity needed</label>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        placeholder="Qty / serving"
                        value={row.quantity}
                        onChange={(e) => {
                          const next = [...recipeRows];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setRecipeRows(next);
                        }}
                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-[#0A1F44] font-semibold"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecipeRows(recipeRows.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-red-650 hover:bg-red-50 rounded-xl mt-4 sm:mt-0 transition self-end"
                      title="Remove ingredient row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex flex-wrap gap-3 pt-3">
                <button
                  type="button"
                  onClick={() =>
                    setRecipeRows([...recipeRows, { inventoryItemId: "", quantity: "" }])
                  }
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-xs font-bold text-gray-700"
                >
                  <Plus size={14} /> Add Ingredient Row
                </button>
                <button
                  type="submit"
                  disabled={savingRecipe}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs disabled:opacity-40 transition shadow-sm"
                >
                  {savingRecipe ? "Saving..." : `Save Recipe ${recipeMenu ? `for ${recipeMenu.name}` : ""}`}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default MenuManagement;
