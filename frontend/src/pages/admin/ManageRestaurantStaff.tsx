import { UtensilsCrossed } from "lucide-react";
import ManageStaff from "./ManageStaff";

const ManageRestaurantStaff = () => (
  <ManageStaff
    role="restaurant"
    title="Restaurant Staff"
    subtitle="Add and manage restaurant POS staff accounts"
    icon={<UtensilsCrossed size={28} />}
    addLabel="Add Staff Member"
  />
);

export default ManageRestaurantStaff;
