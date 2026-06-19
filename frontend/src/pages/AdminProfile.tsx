import React, { useEffect, useState } from "react";
import API from "@/services/api";
import Swal from "sweetalert2";
import { Save } from "lucide-react";

const AdminProfile: React.FC = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const fetchMe = async () => {
    try {
      const { data } = await API.get("/admin/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setForm({
        name: data.name || "",
        email: data.email || "",
        password: "",
      });
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Failed to load profile",
        text: error.response?.data?.message || error.message,
      });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await API.put("/admin/me", form, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      Swal.fire({
        icon: "success",
        title: "Profile updated successfully",
        timer: 1200,
        showConfirmButton: false,
      });
      setForm({ ...form, password: "" });
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "Update failed",
        text: error.response?.data?.message || error.message,
      });
    }
  };

  useEffect(() => {
    fetchMe();
  }, []);

  return (
    <div className="max-w-lg mx-auto mt-12 bg-white p-8 rounded-xl shadow-md border border-gray-100">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">
        Admin Profile
      </h2>

      <form onSubmit={save} className="flex flex-col gap-5">
        {/* Name */}
        <div>
          <label className="text-sm text-gray-600 mb-1 block">Full Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none p-2.5 rounded-md"
            placeholder="Enter your full name"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-sm text-gray-600 mb-1 block">Email</label>
          <input
            type="email"
            value={form.email}
            readOnly
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none p-2.5 rounded-md"
            placeholder="Enter your email"
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-sm text-gray-600 mb-1 block">
            New Password (optional)
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none p-2.5 rounded-md"
            placeholder="Enter new password"
          />
        </div>

        {/* Save Button */}
        <button
          type="submit"
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-md transition"
        >
          <Save size={18} />
          Save Changes
        </button>
      </form>
    </div>
  );
};

export default AdminProfile;
