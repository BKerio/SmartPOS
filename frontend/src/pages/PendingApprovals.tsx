import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import API from "@/services/api";

const ROLE_LABELS: Record<string, string> = {
    tenant: "Non-Student Tenant",
    alumni: "Alumni User",
    owner: "Property Owner / Landlord",
    hostel: "Hostel / Housing Provider",
    manager: "Property Manager",
    provider: "Service Provider",
    merchant: "Marketplace Merchant",
};

const STATUS_COLORS: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
};

const PendingApprovals: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await API.get("/users");
            setUsers(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleApprove = async (id: string, name: string) => {
        const conf = await Swal.fire({
            icon: "question",
            title: `Approve ${name}?`,
            text: "This will grant the user full access to the platform.",
            showCancelButton: true,
            confirmButtonColor: "#16a34a",
            confirmButtonText: "Yes, Approve",
        });
        if (!conf.isConfirmed) return;
        try {
            await API.patch(`/users/${id}/approve`);
            Swal.fire({ icon: "success", title: "Approved!", timer: 1200, showConfirmButton: false });
            fetchUsers();
        } catch { Swal.fire({ icon: "error", title: "Failed to approve" }); }
    };

    const handleReject = async (id: string, name: string) => {
        const { value: reason, isConfirmed } = await Swal.fire({
            icon: "warning",
            title: `Reject ${name}?`,
            input: "textarea",
            inputLabel: "Reason for rejection (optional)",
            inputPlaceholder: "e.g. Incomplete information provided",
            showCancelButton: true,
            confirmButtonColor: "#dc2626",
            confirmButtonText: "Reject",
        });
        if (!isConfirmed) return;
        try {
            await API.patch(`/users/${id}/reject`, { reason });
            Swal.fire({ icon: "info", title: "Rejected", timer: 1200, showConfirmButton: false });
            fetchUsers();
        } catch { Swal.fire({ icon: "error", title: "Failed to reject" }); }
    };

    const filtered = users.filter((u) => filter === "all" ? true : u.status === filter);

    const stats = {
        pending: users.filter((u) => u.status === "pending").length,
        approved: users.filter((u) => u.status === "approved").length,
        rejected: users.filter((u) => u.status === "rejected").length,
    };

    return (
        <div className="p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-800 mb-1">User Account Approvals</h1>
                <p className="text-gray-500 text-sm">Review and manage registration requests from platform users</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { label: "Pending Review", count: stats.pending, color: "border-yellow-400 bg-yellow-50", text: "text-yellow-700" },
                    { label: "Approved", count: stats.approved, color: "border-green-400 bg-green-50", text: "text-green-700" },
                    { label: "Rejected", count: stats.rejected, color: "border-red-400 bg-red-50", text: "text-red-700" },
                ].map((s) => (
                    <div key={s.label} className={`rounded-xl border-l-4 p-4 ${s.color}`}>
                        <p className={`text-3xl font-bold ${s.text}`}>{s.count}</p>
                        <p className="text-sm text-gray-600 mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-6">
                {(["pending", "approved", "rejected", "all"] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${filter === f ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="text-center text-gray-500 py-12">Loading users...</p>
            ) : (
                <div className="space-y-4">
                    {filtered.length === 0 && (
                        <div className="text-center py-20 text-gray-400">
                            <p className="text-lg font-medium">No users in this category</p>
                        </div>
                    )}
                    {filtered.map((user) => (
                        <div key={user._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-wrap items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap mb-1">
                                    <h3 className="font-bold text-gray-800 text-lg">{user.name}</h3>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[user.status]}`}>
                                        {user.status}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                        {ROLE_LABELS[user.role] || user.role}
                                    </span>
                                </div>
                                <p className="text-gray-600 text-sm">{user.email}</p>
                                {user.phone && <p className="text-gray-500 text-sm">📞 {user.phone}</p>}
                                {user.businessName && <p className="text-gray-500 text-sm">🏢 {user.businessName}</p>}
                                {user.rejectionReason && (
                                    <p className="text-red-500 text-xs mt-1">Reason: {user.rejectionReason}</p>
                                )}
                                <p className="text-gray-400 text-xs mt-2">
                                    Registered: {new Date(user.createdAt).toLocaleDateString()}
                                </p>
                            </div>

                            {user.status === "pending" && (
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        onClick={() => handleApprove(user._id, user.name)}
                                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                                    >
                                        ✓ Approve
                                    </button>
                                    <button
                                        onClick={() => handleReject(user._id, user.name)}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                                    >
                                        ✗ Reject
                                    </button>
                                </div>
                            )}

                            {user.status === "approved" && (
                                <button
                                    onClick={() => handleReject(user._id, user.name)}
                                    className="bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
                                >
                                    Revoke
                                </button>
                            )}

                            {user.status === "rejected" && (
                                <button
                                    onClick={() => handleApprove(user._id, user.name)}
                                    className="bg-gray-100 hover:bg-green-100 text-gray-600 hover:text-green-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
                                >
                                    Re-approve
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PendingApprovals;
