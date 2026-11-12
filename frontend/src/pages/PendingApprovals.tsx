import React, { useState, useEffect } from "react";
import { CheckCircle2, Clock, MessageSquareText, ShieldCheck, UserX } from "lucide-react";
import { PageHeader, Segmented, StatTile, StatTiles } from "@/components/page/Page";
import { displayName } from "@/lib/text";
import FormModal, { FieldLabel, FormSection } from "@/components/shared/FormModal";
import { toast } from "@/services/toast";
import API from "@/services/api";
import Loader from "@/components/ui/loader";
import { Avatar } from "@/components/page/DataTable";

const ROLE_LABELS: Record<string, string> = {
    finance: "Finance Officer",
    restaurant: "Restaurant Staff",
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
    const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
    const [rejectReason, setRejectReason] = useState("");

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
        const confirmed = await toast.confirm(`Approve ${name}?`, {
            description: "This will grant the user full access to the platform.",
            confirmLabel: "Approve",
        });
        if (!confirmed) return;
        try {
            await API.patch(`/users/${id}/approve`);
            toast.success("Approved!");
            fetchUsers();
        } catch {
            toast.error("Failed to approve");
        }
    };

    const submitReject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rejectTarget) return;
        try {
            await API.patch(`/users/${rejectTarget.id}/reject`, { reason: rejectReason });
            toast.info("User rejected");
            setRejectTarget(null);
            setRejectReason("");
            fetchUsers();
        } catch {
            toast.error("Failed to reject");
        }
    };

    const filtered = users.filter((u) => filter === "all" ? true : u.status === filter);

    const stats = {
        pending: users.filter((u) => u.status === "pending").length,
        approved: users.filter((u) => u.status === "approved").length,
        rejected: users.filter((u) => u.status === "rejected").length,
    };

    return (
        <div className="p-4 md:p-8 space-y-6">
            <PageHeader
                icon={ShieldCheck}
                eyebrow="Management"
                title="Pending approvals"
                subtitle="Review registration requests from staff before they can sign in"
            />

            <StatTiles cols={3}>
                <StatTile label="Waiting for review" value={stats.pending} icon={Clock} tone="gold" />
                <StatTile label="Approved" value={stats.approved} icon={CheckCircle2} tone="green" />
                <StatTile label="Rejected" value={stats.rejected} icon={UserX} tone="red" />
            </StatTiles>

            <Segmented
                label="Status"
                value={filter}
                options={[
                    { value: "pending", label: `Pending (${stats.pending})` },
                    { value: "approved", label: "Approved" },
                    { value: "rejected", label: "Rejected" },
                    { value: "all", label: "All" },
                ]}
                onChange={setFilter}
            />

            {loading ? (
                <Loader size="sm" title="Loading users..." subtitle="Fetching pending registrations" className="py-12" />
            ) : (
                <div className="space-y-4">
                    {filtered.length === 0 && (
                        <div className="text-center py-20 text-gray-400">
                            <p className="text-lg font-medium">No users in this category</p>
                        </div>
                    )}
                    {filtered.map((user) => (
                        <div key={user._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-wrap items-start justify-between gap-4">
                            <Avatar name={user.name} size="lg" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap mb-1">
                                    <h3 className="font-bold text-gray-800 text-lg">{displayName(user.name)}</h3>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[user.status]}`}>
                                        {user.status}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                                        {ROLE_LABELS[user.role] || user.role}
                                    </span>
                                </div>
                                <p className="text-gray-600 text-sm">{user.email}</p>
                                {user.phone && <p className="text-gray-500 text-sm">{user.phone}</p>}
                                {user.rejectionReason && (
                                    <p className="text-red-500 text-xs mt-1">Reason: {user.rejectionReason}</p>
                                )}
                                <p className="text-gray-400 text-xs mt-2">
                                    Registered: {new Date(user.createdAt).toLocaleDateString()}
                                </p>
                            </div>

                            {user.status === "pending" && (
                                <div className="flex gap-2 shrink-0">
                                    <button onClick={() => handleApprove(user._id, user.name)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                                        Approve
                                    </button>
                                    <button onClick={() => setRejectTarget({ id: user._id, name: user.name })} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                                        Reject
                                    </button>
                                </div>
                            )}

                            {user.status === "approved" && (
                                <button onClick={() => setRejectTarget({ id: user._id, name: user.name })} className="bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
                                    Revoke
                                </button>
                            )}

                            {user.status === "rejected" && (
                                <button onClick={() => handleApprove(user._id, user.name)} className="bg-gray-100 hover:bg-green-100 text-gray-600 hover:text-green-700 px-4 py-2 rounded-lg text-sm font-semibold transition">
                                    Re-approve
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {rejectTarget && (
                <FormModal
                    icon={UserX}
                    title={`Reject ${rejectTarget.name}?`}
                    subtitle="They won't be able to sign in. You can re-approve them later."
                    statusLabel="Rejecting"
                    statusDetail={rejectTarget.name}
                    submitLabel="Confirm rejection"
                    submitIcon={UserX}
                    onClose={() => { setRejectTarget(null); setRejectReason(""); }}
                    onSubmit={submitReject}
                >
                    <FormSection id="reason" icon={MessageSquareText} title="Reason">
                        <div className="field">
                            <FieldLabel htmlFor="rj-reason" hint={`Optional · ${rejectReason.length} characters`}>Reason for rejection</FieldLabel>
                            <textarea id="rj-reason" className="eoc-textarea" placeholder="e.g. Not a member of staff" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
                        </div>
                    </FormSection>
                </FormModal>
            )}
        </div>
    );
};

export default PendingApprovals;
