import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import AppLoader from "@/components/shared/AppLoader";
import { ChoiceCards, FieldLabel, initialsOf } from "@/components/shared/FormModal";
import API from "@/services/api";

export type StudentOption = {
  id: string;
  name: string;
  regNo: string;
  walletBalance?: number;
};

const formatKes = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;

const StudentPicker = ({
  selected,
  onSelect,
  onClear,
}: {
  selected: StudentOption | null;
  onSelect: (student: StudentOption) => void;
  onClear: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await API.get<StudentOption[]>("/students/search", { params: { q } });
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, selected]);

  if (selected) {
    return (
      <div className="fm-summary">
        <span className="fm-card-tile" style={{ background: "var(--green)", color: "#fff" }} aria-hidden="true">
          {initialsOf(selected.name)}
        </span>
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 650 }}>{selected.name}</span>
          <span className="fm-hint">
            {selected.regNo}
            {selected.walletBalance != null && ` · Balance ${formatKes(selected.walletBalance)}`}
          </span>
        </div>
        <button type="button" onClick={onClear} className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="field">
      <FieldLabel htmlFor="student-picker" required hint="At least 2 characters">Find student</FieldLabel>
      <div className="input-icon">
        <input
          id="student-picker"
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, admission no. or phone"
          autoComplete="off"
        />
        <Search />
      </div>
      {searching && (
        <p className="fm-note row" style={{ gap: 8 }}>
          <AppLoader size={14} /> Searching…
        </p>
      )}
      {!searching && query.trim().length >= 2 && results.length === 0 && <p className="fm-note">No students match "{query.trim()}".</p>}
      {results.length > 0 && (
        <div className="fm-cards-scroll">
          <ChoiceCards
            label="Matching students"
            columns={2}
            options={results.map((s) => ({
              value: s.id,
              label: s.name,
              sub: `${s.regNo}${s.walletBalance != null ? ` · ${formatKes(s.walletBalance)}` : ""}`,
            }))}
            selected={[]}
            onToggle={(id) => {
              const s = results.find((r) => r.id === id);
              if (s) onSelect(s);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default StudentPicker;