import { PieChart } from "lucide-react";
import ManageStaff from "./ManageStaff";

const ManageFinanceOfficers = () => (
  <ManageStaff
    role="finance"
    title="Finance Officers"
    subtitle="Add and manage finance department staff accounts"
    icon={<PieChart size={28} />}
    addLabel="Add Finance Officer"
  />
);

export default ManageFinanceOfficers;
