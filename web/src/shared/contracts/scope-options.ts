export type BranchOption = { id: string; name: string };

export type DepartmentOption = { id: string; name: string };

export type PositionOption = { id: string; department_id: string; name: string };

export type ScopedUserOption = {
  id: string;
  user_id: string | null;
  branch_id?: string | null;
  first_name: string;
  last_name: string;
  role_label?: string;
  location_label?: string;
  department_label?: string;
  position_label?: string;
};
