const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface PageInfo {
  page_index: number;
  page_number: number;
  text_preview: string;
}

export interface UploadResult {
  file_id: string;
  filename: string;
  size_bytes: number;
  page_count: number;
  pages: PageInfo[];
}

export interface Template {
  id: string;
  name: string;
  template_type: string;
  direct_link_fields: string[];
  table_fields: string[];
  special_conditions: string[];
  created_at: string;
}

export interface DetectedPage {
  page_number: number;
  template_id: string | null;
  template_name: string | null;
}

export interface FieldPosition {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ExtractedPage {
  page_number: number;
  fields: Record<string, string | null>;
  field_positions: Record<string, FieldPosition>;
  page_width: number;
  page_height: number;
  table_rows: Record<string, string>[];
  applied_conditions: string[];
  text_preview: string;
}

export interface ExtractionResult {
  template_id: string;
  template_name: string;
  template_type: string;
  pages: ExtractedPage[];
}

export interface AIPlan {
  pages_to_keep: number[];
  operation: string;
  reason: string;
  download_url?: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ success: boolean; data: T | null; error: string | null }> {
  const res = await fetch(`${BASE}${path}`, options);
  return res.json();
}

export async function uploadPdf(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<UploadResult>("/upload", { method: "POST", body: form });
}

export async function splitPdf(payload: {
  file_id: string;
  mode: "range" | "every_n" | "selected";
  start_page?: number;
  end_page?: number;
  every_n?: number;
  selected_pages?: number[];
}) {
  return apiFetch<{ download_url: string; files: string[] }>("/split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function mergePdfs(payload: {
  file_ids: string[];
  page_selections?: (number[] | null)[];
  skip_blank?: boolean;
}) {
  return apiFetch<{ download_url: string }>("/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function aiPlan(file_id: string, instruction: string) {
  return apiFetch<AIPlan>("/ai-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, instruction }),
  });
}

export async function getTemplates() {
  return apiFetch<Template[]>("/templates");
}

export async function createTemplate(payload: {
  name: string;
  template_type: string;
  direct_link_fields: string[];
  table_fields: string[];
  special_conditions: string[];
}) {
  return apiFetch<Template>("/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteTemplate(id: string) {
  return apiFetch<{ deleted: string }>(`/templates/${id}`, { method: "DELETE" });
}

export async function applyTemplate(template_id: string, file_id: string) {
  return apiFetch<{ pages_matched: number[]; reason: string; download_url: string | null }>(
    `/templates/${template_id}/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id }),
    }
  );
}

export async function detectDocType(file_id: string, template_ids?: string[]) {
  return apiFetch<{ pages: DetectedPage[] }>("/templates/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, template_ids }),
  });
}

export async function extractTemplateData(template_id: string, file_id: string, page_numbers?: number[]) {
  return apiFetch<ExtractionResult>(`/templates/${template_id}/extract-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, page_numbers }),
  });
}

export interface ShippingRecord {
  page_number: number;
  document_type: string | null;
  bl_number: string | null;
  awb_number: string | null;
  container_numbers: string[];
  seal_numbers: string[];
  vessel_name: string | null;
  voyage_number: string | null;
  flight_number: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  place_of_delivery: string | null;
  shipper_name: string | null;
  shipper_address: string | null;
  shipper_uen: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  notify_party: string | null;
  description_of_goods: string | null;
  hs_code: string | null;
  gross_weight: string | null;
  net_weight: string | null;
  number_of_packages: string | null;
  package_type: string | null;
  freight_terms: string | null;
  incoterms: string | null;
  shipment_date: string | null;
  eta: string | null;
  total_value: string | null;
  currency: string | null;
  country_of_origin: string | null;
  tradenet_permit: string | null;
  gst_registration: string | null;
  marks_and_numbers: string | null;
  company_key: string | null;
  remarks: string | null;
}

export interface ShippingGroupResult {
  pages: number[];
  download_url: string;
}

export async function extractShippingData(file_id: string) {
  return apiFetch<{ file_id: string; total_pages: number; records: ShippingRecord[] }>(
    "/shipping/extract",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id }),
    }
  );
}

export async function separateShippingDocs(
  file_id: string,
  group_by: "company" | "container",
  records: ShippingRecord[]
) {
  return apiFetch<{ group_by: string; groups: Record<string, ShippingGroupResult>; zip_url: string }>(
    "/shipping/separate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id, group_by, records }),
    }
  );
}

export function downloadUrl(url: string) {
  return `${BASE}${url}`;
}
