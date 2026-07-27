export interface Profile {
  id: string;
  username: string;
  fullname: string;
  role: 'Admin' | 'User';
  permitted_menus?: string[];
  created_at?: string;
}

export interface Survey {
  id: number;
  serial_no: number;
  owner_name: string;
  neighborhood: string;
  branch: string;
  vicinity?: string;
  land_type: string;
  built_details?: string;
  boundary_w_val?: string;
  boundary_w_neighbor?: string;
  boundary_b_val?: string;
  boundary_b_neighbor?: string;
  boundary_k_val?: string;
  boundary_k_neighbor?: string;
  boundary_g_val?: string;
  boundary_g_neighbor?: string;
  gps_location?: string;
  polygon_boundary?: string;
  sketch_area?: string;
  sketch_dimensions?: string;
  created_at?: string;
  created_by?: string;
}

export interface Reference {
  id: number;
  ref_number: string;
  survey_id?: number | null;
  subject: string;
  details?: string;
  status: 'In Progress' | 'Completed' | 'Picked Up';
  issue_date?: string;
  created_at?: string;
  created_by?: string;
  // Expanded relation from join
  surveys?: {
    owner_name: string;
    serial_no: number;
  } | null;
}

export interface Receipt {
  id: number;
  receipt_no: string;
  reference_id: number;
  details?: string;
  amount: number;
  status: 'Paid' | 'Credit';
  payment_mode: 'EVC Plus' | 'eDahab' | 'Jeeb' | 'Cash';
  payment_date: string;
  created_at?: string;
  created_by?: string;
  // Expanded relation from join
  references?: {
    ref_number: string;
    subject: string;
    issue_date: string;
  } | null;
}

export interface Expense {
  id: number;
  description: string;
  qty: number;
  amount: number;
  total: number;
  expense_date: string;
  created_by?: string;
  created_at?: string;
}

export interface Transfer {
  id: number;
  serial_no: number;
  seller_name: string;
  seller_tel: string;
  buyer_name: string;
  buyer_tel: string;
  survey_id: number;
  price: number;
  transfer_date: string;
  created_at?: string;
  created_by?: string;
  // Expanded relation from join
  surveys?: {
    serial_no: number;
    owner_name: string;
  } | null;
}
