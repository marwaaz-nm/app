export interface Profile {
  id: string;
  username: string;
  fullname: string;
  role: "Admin" | "User" | "SuperAdmin";
  permitted_menus?: string[];
  permitted_actions?: string[];
  notifications_enabled?: boolean;
  notification_menu_preferences?: Record<string, boolean>;
  created_at?: string;
}

export interface Survey {
  id: number;
  serial_no: number;
  survey_no?: string | null;
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
  boundary_label_positions?: string;
  created_at?: string;
  created_by?: string;
  status?: SurveyStatus;
  version?: number;
  updated_at?: string;
  updated_by?: string;
  approved_at?: string;
  approved_by?: string;
  rejection_reason?: string;
}

export type SurveyStatus =
  | "Draft"
  | "Pending Review"
  | "Approved"
  | "Rejected"
  | "Archived";

export interface SurveyRevision {
  id: number;
  survey_id: number;
  version: number;
  action: string;
  notes?: string;
  survey_snapshot: Partial<Survey>;
  changed_fields?: Record<string, unknown>;
  changed_by?: string;
  created_at: string;
}

export interface SurveyDocument {
  id: number;
  survey_id: number;
  name: string;
  category: string;
  storage_path: string;
  mime_type?: string;
  size_bytes: number;
  uploaded_by?: string;
  created_at: string;
  signed_url?: string;
}

export interface SurveyOverlap {
  id: number;
  serial_no: number;
  owner_name: string;
  overlap_area_m2: number;
}

export interface Reference {
  id: number;
  verification_token?: string;
  ref_number: string;
  survey_id?: number | null;
  subject: string;
  details?: string;
  status: "In Progress" | "Completed" | "Picked Up";
  issue_date?: string;
  created_at?: string;
  created_by?: string;
  archive_drive_file_id?: string | null;
  archive_file_name?: string | null;
  archive_uploaded_at?: string | null;
  // Expanded relation from join
  surveys?: {
    id: number;
    owner_name: string;
    serial_no: number;
    survey_no?: string | null;
    neighborhood?: string;
    branch?: string;
    land_type?: string;
    sketch_area?: string;
    gps_location?: string;
    polygon_boundary?: string;
    boundary_w_val?: string;
    boundary_w_neighbor?: string;
    boundary_b_val?: string;
    boundary_b_neighbor?: string;
    boundary_k_val?: string;
    boundary_k_neighbor?: string;
    boundary_g_val?: string;
    boundary_g_neighbor?: string;
  } | null;
  receipts?: {
    id: number;
    reference_id: number;
    receipt_no: string;
    amount: number;
    status: "Paid" | "Credit";
    payment_mode: "EVC Plus" | "eDahab" | "Jeeb" | "Cash";
    payment_date: string;
    details?: string;
  }[] | null;
}

export interface Receipt {
  id: number;
  receipt_no: string;
  reference_id: number;
  details?: string;
  amount: number;
  status: "Paid" | "Credit";
  payment_mode: "EVC Plus" | "eDahab" | "Jeeb" | "Cash";
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
  expense_no?: string | null;
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
    survey_no?: string | null;
    owner_name: string;
  } | null;
}
