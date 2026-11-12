import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  AlertTriangle,
  Plus,
  Pencil,
  Save,
  Trash2,
  List,
  Link2,
  ImagePlus,
  X,
  Tags,
  UtensilsCrossed,
  Banknote,
  ArrowRight,
  ChefHat,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import AppLoader from "@/components/shared/AppLoader";
import { ChoicePills, FieldLabel, FormCard, FormSection } from "@/components/shared/FormModal";
import API from "@/services/api";
import { toast } from "@/services/toast";
import { PageHeader } from "@/components/page/Page";

export type Tab = "list" | "add" | "edit" | "update" | "delete" | "recipes" | "categories";

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

interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  isAvailable: boolean;
  imageUrl?: string;
  stockLevel?: number | null;
  batchYield?: number | null;
  ingredients?: MenuIngredient[];
}

const EMPTY_FORM = { name: "", description: "", price: "", category: "", imageUrl: "", stockLevel: "" };

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "list", label: "All Items", icon: List },
  { id: "categories", label: "Categories", icon: Tags },
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

// ─── ImageUploader ──────────────────────────────────────────────────────────
interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

const ImageUploader = ({ value, onChange, disabled }: ImageUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        return toast.error("Invalid file", "Only jpg, png, and webp images are allowed");
      }
      if (file.size > 3 * 1024 * 1024) {
        return toast.error("File too large", "Maximum image size is 3 MB");
      }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("image", file);
        const { data } = await API.post<{ url: string }>("/menu/upload-image", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        onChange(data.url);
        toast.success("Image uploaded");
      } catch (e: any) {
        toast.error("Upload failed", e.response?.data?.message ?? e.message);
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div className="field">
      <FieldLabel hint="Optional · JPG, PNG or WEBP up to 3 MB">Food photo</FieldLabel>

      {value ? (
        <div className="fm-drop-preview">
          <img src={value} alt="Menu item" />
          <div className="fm-drop-preview-actions">
            <button type="button" className="btn btn-soft btn-sm" disabled={disabled || uploading} onClick={() => !disabled && inputRef.current?.click()}>
              {uploading ? <AppLoader size={14} /> : <ImagePlus size={14} />} Change
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={disabled} onClick={() => onChange("")}>
              <X size={14} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`fm-drop${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
        >
          {uploading ? <AppLoader size={26} /> : <ImagePlus size={26} />}
          <b>{uploading ? "Uploading…" : dragging ? "Drop to upload" : "Click or drag a photo here"}</b>
          <span>Shown on the POS and the ordering kiosk.</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled || uploading}
      />
    </div>
  );
};

// ─── MenuManagement ──────────────────────────────────────────────────────────
const MenuManagement = ({ initialTab = "list", showTabs = true }: Props) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);

  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState("");

  const [categoryForm, setCategoryForm] = useState({ name: "", sortOrder: "" });
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [categoryDraft, setCategoryDraft] = useState({ name: "", sortOrder: "" });
  const [deleteCategoryId, setDeleteCategoryId] = useState("");

  const [recipeMenuId, setRecipeMenuId] = useState("");
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [batchYield, setBatchYield] = useState("");
  const [savingRecipe, setSavingRecipe] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = async () => {
    try {
      const { data } = await API.get<MenuCategory[]>("/menu/categories");
      setCategories(data);
      const defaultCategory = data[0]?.name ?? "";
      setAddForm((prev) => (prev.category ? prev : { ...prev, category: defaultCategory }));
      setDraft((prev) => (prev.category ? prev : { ...prev, category: defaultCategory }));
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    }
  };

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
    fetchCategories();
    fetchInventory();
  }, []);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const selectedItem = items.find((i) => i.id === selectedId);
  const deleteTarget = items.find((i) => i.id === deleteId);
  const editingCategory = categories.find((c) => c.id === editingCategoryId);
  const deleteCategoryTarget = categories.find((c) => c.id === deleteCategoryId);
  const categoryNames = categories.map((c) => c.name);

  const loadIntoDraft = (item: MenuItem) => {
    setSelectedId(item.id);
    setDraft({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      category: item.category,
      imageUrl: item.imageUrl || "",
      stockLevel: item.stockLevel == null ? "" : String(item.stockLevel),
    });
  };

  const loadRecipe = async (menuItemId: string) => {
    setRecipeMenuId(menuItemId);
    if (!menuItemId) {
      setRecipeRows([]);
      setBatchYield("");
      return;
    }
    const item = items.find((i) => i.id === menuItemId);
    setBatchYield(item?.batchYield ? String(item.batchYield) : "");
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
    if (!addForm.name || !addForm.price || !addForm.category) {
      return toast.warning("Name, price, and category are required");
    }
    setSubmitting(true);
    try {
      await API.post("/menu", {
        ...addForm,
        price: Number(addForm.price),
        imageUrl: addForm.imageUrl || undefined,
        stockLevel: addForm.stockLevel === "" ? null : Number(addForm.stockLevel),
      });
      setAddForm({ ...EMPTY_FORM, category: categories[0]?.name ?? "" });
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
        imageUrl: draft.imageUrl || null,
        stockLevel: draft.stockLevel === "" ? null : Number(draft.stockLevel),
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
      await API.put(`/menu/${recipeMenuId}`, {
        batchYield: batchYield === "" ? null : Math.max(1, Math.floor(Number(batchYield))),
      });
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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = categoryForm.name.trim();
    if (!name) return toast.warning("Category name is required");
    setSubmitting(true);
    try {
      await API.post("/menu/categories", {
        name,
        sortOrder: categoryForm.sortOrder ? Number(categoryForm.sortOrder) : 0,
      });
      setCategoryForm({ name: "", sortOrder: "" });
      await fetchCategories();
      toast.success("Category added");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategoryId) return toast.warning("Select a category to update");
    const name = categoryDraft.name.trim();
    if (!name) return toast.warning("Category name is required");
    setSubmitting(true);
    try {
      await API.put(`/menu/categories/${editingCategoryId}`, {
        name,
        sortOrder: categoryDraft.sortOrder ? Number(categoryDraft.sortOrder) : 0,
      });
      await fetchCategories();
      await fetchItems();
      toast.success("Category updated");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryId) return toast.warning("Select a category to delete");
    const confirmed = await toast.confirm(
      `Delete category "${deleteCategoryTarget?.name}"?`,
      { confirmLabel: "Delete" },
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await API.delete(`/menu/categories/${deleteCategoryId}`);
      if (editingCategoryId === deleteCategoryId) {
        setEditingCategoryId("");
        setCategoryDraft({ name: "", sortOrder: "" });
      }
      setDeleteCategoryId("");
      await fetchCategories();
      toast.success("Category deleted");
    } catch (e: any) {
      toast.error("Error", e.response?.data?.message);
    } finally {
      setSubmitting(false);
    }
  };

  const loadCategoryIntoDraft = (category: MenuCategory) => {
    setEditingCategoryId(category.id);
    setCategoryDraft({
      name: category.name,
      sortOrder: String(category.sortOrder),
    });
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
    <div className="p-4 md:p-8 bg-page min-h-screen font-sans space-y-6">
      <PageHeader icon={ClipboardList} eyebrow="Menu" title="Menu management" subtitle="Add, edit and remove menu items, manage categories and recipes" />

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
                  ? "bg-brand text-white shadow-sm"
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
                <th className="px-5 py-4 text-center font-extrabold tracking-wider">Stock</th>
                <th className="px-5 py-4 text-center font-extrabold tracking-wider">Status</th>
                <th className="px-5 py-4 text-right font-extrabold tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
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
                      <div className="flex items-center gap-3">
                        {/* Thumbnail */}
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-100"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 border border-slate-100">
                            <span className="text-slate-400 text-xs font-black">
                              {item.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-extrabold text-brand">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
                          )}
                        </div>
                      </div>
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
                    <td className="px-5 py-4 text-right font-black text-brand">
                      KES {item.price.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {item.stockLevel == null ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <span className={`text-xs font-bold ${item.stockLevel <= 0 ? "text-red-600" : "text-gray-700"}`}>
                          {item.stockLevel}
                        </span>
                      )}
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
                          className="px-2.5 py-1 text-xs font-bold text-brand hover:bg-brand/5 border border-slate-200 rounded-lg transition duration-150"
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

      {tab === "categories" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-extrabold text-brand">All Categories</h3>
              <p className="text-xs text-gray-400 mt-1">Categories appear in POS filters and menu item forms.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-gray-500 uppercase text-[10px] border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3 text-left font-extrabold tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left font-extrabold tracking-wider">Sort</th>
                  <th className="px-5 py-3 text-left font-extrabold tracking-wider">Items</th>
                  <th className="px-5 py-3 text-right font-extrabold tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-gray-400">
                      No categories yet. Add your first category on the right.
                    </td>
                  </tr>
                ) : (
                  categories.map((category) => {
                    const itemCount = items.filter((i) => i.category === category.name).length;
                    return (
                      <tr key={category.id} className="hover:bg-slate-50/40 transition">
                        <td className="px-5 py-4 font-bold text-brand">{category.name}</td>
                        <td className="px-5 py-4 text-gray-500">{category.sortOrder}</td>
                        <td className="px-5 py-4 text-gray-500">{itemCount}</td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => loadCategoryIntoDraft(category)}
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteCategoryId(category.id)}
                              className="px-2.5 py-1 text-xs font-bold text-red-650 hover:bg-red-50 border border-red-100 rounded-lg transition"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-6">
            <FormCard
              icon={Tags}
              title="Add a category"
              subtitle="Group menu items on the POS and kiosk."
              statusLabel="New category"
              statusDetail={categoryForm.name}
              submitLabel="Add category"
              submittingLabel="Adding…"
              submitIcon={Plus}
              submitting={submitting}
              onSubmit={handleAddCategory}
            >
              <FormSection id="cat-new" icon={Tags} title="Category">
                <div className="field">
                  <FieldLabel htmlFor="mc-name" required>Name</FieldLabel>
                  <input id="mc-name" className="input" placeholder="e.g. Breakfast" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
                </div>
                <div className="field">
                  <FieldLabel htmlFor="mc-sort" hint="Optional, lower shows first">Sort order</FieldLabel>
                  <input id="mc-sort" type="number" min="0" className="input" placeholder="0" value={categoryForm.sortOrder} onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: e.target.value })} />
                </div>
              </FormSection>
            </FormCard>

            <FormCard
              icon={Pencil}
              title="Update a category"
              subtitle="Rename or reorder an existing category."
              statusLabel="Editing"
              statusDetail={editingCategory?.name}
              submitLabel="Save category"
              submitting={submitting}
              submitDisabled={!editingCategoryId}
              onSubmit={handleUpdateCategory}
            >
              <FormSection id="cat-edit" icon={Tags} title="Category">
                <div className="field">
                  <FieldLabel htmlFor="mc-pick" required>Category</FieldLabel>
                  <select
                    id="mc-pick"
                    className="input"
                    value={editingCategoryId}
                    onChange={(e) => {
                      const category = categories.find((c) => c.id === e.target.value);
                      if (category) loadCategoryIntoDraft(category);
                      else { setEditingCategoryId(""); setCategoryDraft({ name: "", sortOrder: "" }); }
                    }}
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="fm-grid-2">
                  <div className="field">
                    <FieldLabel htmlFor="mc-newname" required>New name</FieldLabel>
                    <input id="mc-newname" className="input" placeholder="Category name" value={categoryDraft.name} onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })} disabled={!editingCategoryId} required />
                  </div>
                  <div className="field">
                    <FieldLabel htmlFor="mc-newsort">Sort order</FieldLabel>
                    <input id="mc-newsort" type="number" min="0" className="input" placeholder="0" value={categoryDraft.sortOrder} onChange={(e) => setCategoryDraft({ ...categoryDraft, sortOrder: e.target.value })} disabled={!editingCategoryId} />
                  </div>
                </div>
                {editingCategory && <p className="fm-note">Renaming updates every menu item currently in "{editingCategory.name}".</p>}
              </FormSection>
            </FormCard>

            <FormCard
              icon={Trash2}
              title="Delete a category"
              subtitle="Only empty categories can be deleted."
              requiredNote={false}
              statusLabel="Deleting"
              statusDetail={deleteCategoryTarget?.name}
              submitLabel="Delete category"
              submittingLabel="Deleting…"
              submitIcon={Trash2}
              danger
              submitting={submitting}
              submitDisabled={!deleteCategoryTarget}
              onSubmit={(e) => { e.preventDefault(); handleDeleteCategory(); }}
            >
              <FormSection id="cat-del" icon={Tags} title="Category">
                <div className="field">
                  <FieldLabel htmlFor="mc-del">Category to delete</FieldLabel>
                  <select id="mc-del" className="input" value={deleteCategoryId} onChange={(e) => setDeleteCategoryId(e.target.value)}>
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {deleteCategoryTarget && (
                  <div className="fm-preview danger">
                    <div className="col" style={{ gap: 4 }}>
                      <b>{deleteCategoryTarget.name}</b>
                      <span>
                        {items.filter((i) => i.category === deleteCategoryTarget.name).length} menu item(s) use this category.
                        Categories with items can't be deleted; move or remove those items first.
                      </span>
                    </div>
                  </div>
                )}
              </FormSection>
            </FormCard>
          </div>
        </div>
      )}

      {tab === "add" && (
        <div className="max-w-2xl">
          <FormCard
            icon={UtensilsCrossed}
            title="Add a menu item"
            subtitle="Create a dish or drink for the POS and kiosk."
            statusLabel="New item"
            statusDetail={addForm.name}
            submitLabel="Add menu item"
            submittingLabel="Adding…"
            submitting={submitting}
            onSubmit={handleAdd}
          >
            <FormSection id="photo" icon={ImagePlus} title="Photo">
              <ImageUploader value={addForm.imageUrl} onChange={(url) => setAddForm({ ...addForm, imageUrl: url })} />
            </FormSection>
            <FormSection id="details" icon={ClipboardList} title="Details">
              <div className="field">
                <FieldLabel htmlFor="mi-name" required>Item name</FieldLabel>
                <input id="mi-name" className="input" placeholder="e.g. Grilled chicken salad" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="mi-desc" hint="Optional">Description</FieldLabel>
                <input id="mi-desc" className="input" placeholder="e.g. Served with fresh vinaigrette" value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })} />
              </div>
              <div className="field">
                <FieldLabel required hint={categoryNames.length === 0 ? "Add a category first" : undefined}>Category</FieldLabel>
                <ChoicePills label="Category" value={addForm.category} options={categoryNames.map((c) => ({ value: c, label: c }))} onChange={(v) => setAddForm({ ...addForm, category: v })} />
              </div>
            </FormSection>
            <FormSection id="pricing" icon={Banknote} title="Price & stock">
              <div className="fm-grid-2">
                <div className="field">
                  <FieldLabel htmlFor="mi-price" required hint="KES">Price</FieldLabel>
                  <input id="mi-price" type="number" min="0" step="0.01" className="input" placeholder="0.00" value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: e.target.value })} required />
                </div>
                <div className="field">
                  <FieldLabel htmlFor="mi-stock" hint="Portions">Stock</FieldLabel>
                  <input id="mi-stock" type="number" min="0" className="input" placeholder="Blank = unlimited" value={addForm.stockLevel} onChange={(e) => setAddForm({ ...addForm, stockLevel: e.target.value })} />
                </div>
              </div>
              <p className="fm-note">Stock goes down by 1 each time the item is sold. Restock it here or under Update.</p>
            </FormSection>
          </FormCard>
        </div>
      )}

      {tab === "edit" && (
        <div className="max-w-2xl">
          <FormCard
            icon={Pencil}
            title="Edit a menu item"
            subtitle="Pick an item to review it, then continue to Update to change it."
            requiredNote={false}
            statusLabel="Editing"
            statusDetail={selectedItem?.name}
            submitLabel="Continue to update"
            submitIcon={ArrowRight}
            submitDisabled={!selectedItem}
            onSubmit={(e) => { e.preventDefault(); setTab("update"); }}
          >
            <FormSection id="pick" icon={List} title="Item">
              <div className="field">
                <FieldLabel htmlFor="me-pick">Menu item</FieldLabel>
                <select
                  id="me-pick"
                  className="input"
                  value={selectedId}
                  onChange={(e) => {
                    const item = items.find((i) => i.id === e.target.value);
                    if (item) loadIntoDraft(item);
                    else { setSelectedId(""); setDraft(EMPTY_FORM); }
                  }}
                >
                  <option value="">Select menu item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category}) - KES {i.price}</option>)}
                </select>
              </div>
              {selectedItem && (
                <div className="fm-preview">
                  {selectedItem.imageUrl && <img src={selectedItem.imageUrl} alt={selectedItem.name} />}
                  <div className="col" style={{ gap: 4, minWidth: 0 }}>
                    <b>{selectedItem.name}</b>
                    <span>{selectedItem.category} · KES {selectedItem.price.toLocaleString()}</span>
                    {selectedItem.description && <span>{selectedItem.description}</span>}
                  </div>
                </div>
              )}
            </FormSection>
          </FormCard>
        </div>
      )}

      {tab === "update" && (
        <div className="max-w-2xl">
          <FormCard
            icon={Save}
            title="Update a menu item"
            subtitle="Change the photo, name, price, category or stock."
            statusLabel="Updating"
            statusDetail={draft.name}
            submitLabel="Save changes"
            submittingLabel="Updating…"
            submitting={submitting}
            submitDisabled={!selectedId}
            onSubmit={handleUpdate}
          >
            <FormSection id="pick" icon={List} title="Item">
              <div className="field">
                <FieldLabel htmlFor="mu-pick" required>Menu item</FieldLabel>
                <select
                  id="mu-pick"
                  className="input"
                  value={selectedId}
                  onChange={(e) => {
                    const item = items.find((i) => i.id === e.target.value);
                    if (item) loadIntoDraft(item);
                    else { setSelectedId(""); setDraft(EMPTY_FORM); }
                  }}
                >
                  <option value="">Select menu item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category})</option>)}
                </select>
                {!selectedId && <p className="fm-note">Choose an item to start editing.</p>}
              </div>
            </FormSection>
            <FormSection id="photo" icon={ImagePlus} title="Photo">
              <ImageUploader value={draft.imageUrl} onChange={(url) => setDraft({ ...draft, imageUrl: url })} disabled={!selectedId} />
            </FormSection>
            <FormSection id="details" icon={ClipboardList} title="Details">
              <div className="field">
                <FieldLabel htmlFor="mu-name" required>Item name</FieldLabel>
                <input id="mu-name" className="input" placeholder="Item name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={!selectedId} required />
              </div>
              <div className="field">
                <FieldLabel htmlFor="mu-desc" hint="Optional">Description</FieldLabel>
                <input id="mu-desc" className="input" placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} disabled={!selectedId} />
              </div>
              <div className="field">
                <FieldLabel required>Category</FieldLabel>
                <ChoicePills label="Category" value={draft.category} options={categoryNames.map((c) => ({ value: c, label: c }))} onChange={(v) => selectedId && setDraft({ ...draft, category: v })} />
              </div>
            </FormSection>
            <FormSection id="pricing" icon={Banknote} title="Price & stock">
              <div className="fm-grid-2">
                <div className="field">
                  <FieldLabel htmlFor="mu-price" required hint="KES">Price</FieldLabel>
                  <input id="mu-price" type="number" min="0" step="0.01" className="input" placeholder="0.00" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} disabled={!selectedId} required />
                </div>
                <div className="field">
                  <FieldLabel htmlFor="mu-stock" hint="Portions">Stock</FieldLabel>
                  <input id="mu-stock" type="number" min="0" className="input" placeholder="Blank = unlimited" value={draft.stockLevel} onChange={(e) => setDraft({ ...draft, stockLevel: e.target.value })} disabled={!selectedId} />
                </div>
              </div>
              <p className="fm-note">Increase to restock. Stock goes down automatically as orders are placed.</p>
            </FormSection>
          </FormCard>
        </div>
      )}

      {tab === "delete" && (
        <div className="max-w-2xl">
          <FormCard
            icon={Trash2}
            title="Delete a menu item"
            subtitle="Remove a dish permanently. Its linked recipe is removed too."
            requiredNote={false}
            statusLabel="Deleting"
            statusDetail={deleteTarget?.name}
            submitLabel="Delete permanently"
            submittingLabel="Deleting…"
            submitIcon={Trash2}
            danger
            submitting={submitting}
            submitDisabled={!deleteTarget}
            onSubmit={(e) => { e.preventDefault(); handleDelete(); }}
          >
            <FormSection id="pick" icon={List} title="Item">
              <div className="field">
                <FieldLabel htmlFor="md-pick">Item to remove</FieldLabel>
                <select id="md-pick" className="input" value={deleteId} onChange={(e) => setDeleteId(e.target.value)}>
                  <option value="">Select menu item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category}) - KES {i.price}</option>)}
                </select>
              </div>
              {deleteTarget && (
                <div className="fm-preview danger">
                  {deleteTarget.imageUrl && <img src={deleteTarget.imageUrl} alt={deleteTarget.name} />}
                  <div className="col" style={{ gap: 4, minWidth: 0 }}>
                    <b>{deleteTarget.name}</b>
                    <span>{deleteTarget.category} · KES {deleteTarget.price.toLocaleString()}</span>
                    <span style={{ color: "var(--red)", fontWeight: 600 }}>This can't be undone.</span>
                  </div>
                </div>
              )}
            </FormSection>
          </FormCard>
        </div>
      )}

      {tab === "recipes" && (
        <div className="max-w-3xl">
          <FormCard
            icon={ChefHat}
            title="Recipe & batch production"
            subtitle="Ingredients are used once per cooking batch, not per sale (e.g. 1 kg flour makes 60 mandazis)."
            statusLabel="Recipe"
            statusDetail={recipeMenu?.name}
            submitLabel={recipeMenu ? `Save recipe for ${recipeMenu.name}` : "Save recipe"}
            submittingLabel="Saving…"
            submitting={savingRecipe}
            submitDisabled={!recipeMenuId}
            onSubmit={saveRecipe}
          >
            <FormSection id="dish" icon={UtensilsCrossed} title="Dish">
              <div className="field">
                <FieldLabel htmlFor="mr-dish" required>Menu item</FieldLabel>
                <select id="mr-dish" className="input" value={recipeMenuId} onChange={(e) => loadRecipe(e.target.value)}>
                  <option value="">Select menu item</option>
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name} - {i.ingredients?.length ?? 0} ingredient(s) linked</option>)}
                </select>
              </div>
              {recipeMenuId && (
                <div className="fm-grid-2">
                  <div className="field">
                    <FieldLabel htmlFor="mr-yield" hint="Portions per cook">Batch yield</FieldLabel>
                    <input id="mr-yield" type="number" min={1} className="input" placeholder="e.g. 60" value={batchYield} onChange={(e) => setBatchYield(e.target.value)} />
                  </div>
                  {recipeMenu && batchYield && Number(batchYield) > 0 && (
                    <div className="fm-summary" style={{ alignSelf: "end" }}>
                      <div className="col" style={{ gap: 2 }}>
                        <span className="fm-hint">Expected per batch</span>
                        <b>KES {(Number(batchYield) * recipeMenu.price).toLocaleString()}</b>
                        <span className="fm-hint">{batchYield} × KES {recipeMenu.price}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </FormSection>

            {recipeMenuId && (
              <FormSection id="ingredients" icon={Boxes} title="Ingredients per batch">
                {recipeRows.length === 0 && <p className="fm-note">No ingredients yet. Add the raw stock this dish uses.</p>}
                {recipeRows.map((row, idx) => (
                  <div key={idx} className="fm-row-3">
                    <div className="field">
                      <FieldLabel htmlFor={`mr-ing-${idx}`} required>Ingredient</FieldLabel>
                      <select
                        id={`mr-ing-${idx}`}
                        className="input"
                        value={row.inventoryItemId}
                        onChange={(e) => {
                          const next = [...recipeRows];
                          next[idx] = { ...next[idx], inventoryItemId: e.target.value };
                          setRecipeRows(next);
                        }}
                        required
                      >
                        <option value="">Choose inventory item</option>
                        {inventory.map((inv) => <option key={inv.id} value={inv.id}>{inv.name} ({inv.stockLevel} {inv.unit} in stock)</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <FieldLabel htmlFor={`mr-qty-${idx}`} required hint={inventory.find((i) => i.id === row.inventoryItemId)?.unit}>Qty</FieldLabel>
                      <input
                        id={`mr-qty-${idx}`}
                        type="number"
                        step="any"
                        min="0.001"
                        className="input"
                        placeholder="e.g. 1"
                        value={row.quantity}
                        onChange={(e) => {
                          const next = [...recipeRows];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setRecipeRows(next);
                        }}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ height: 48, width: 48 }}
                      onClick={() => setRecipeRows(recipeRows.filter((_, i) => i !== idx))}
                      title="Remove ingredient"
                      aria-label="Remove ingredient"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="fm-card fm-card-new"
                  style={{ justifyContent: "center" }}
                  onClick={() => setRecipeRows([...recipeRows, { inventoryItemId: "", quantity: "" }])}
                >
                  <Plus size={16} /> Add ingredient
                </button>
              </FormSection>
            )}
          </FormCard>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
