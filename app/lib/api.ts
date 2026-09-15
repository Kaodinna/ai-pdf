const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

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

export interface LibraryDerived {
  library_id: string;
  match_field: string;
  return_field: string;
}

export interface FieldConfig {
  description: string;
  required: boolean;
  data_type: "Text" | "Date" | "Number" | "Currency" | "Boolean";
  data_type_restriction: string;
  synonyms: string[];
  library_derived: LibraryDerived | null;
  doc_type_priority: string | null;
  display_doc_audit: boolean;
  add_separator_below: boolean;
}

export interface TemplateComment {
  id: string;
  user: string;
  text: string;
  timestamp: string;
}

export interface Template {
  id: string;
  name: string;
  template_type: string;
  direct_link_fields: string[];
  table_fields: string[];
  special_conditions: string[];
  field_synonyms: Record<string, string[]>;
  field_config: Record<string, FieldConfig>;
  table_config: Record<string, FieldConfig>;
  unique_id_fields: string[];
  secondary_id_fields: string[];
  reference_id_fields: string[];
  editable_in_file: boolean;
  comments: TemplateComment[];
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

export interface FieldMeta {
  confidence: number;
  evidence: string;
  status?: "approved" | "needs_review" | "rejected";
}

export interface ExtractedPage {
  page_number: number;
  fields: Record<string, string | null>;
  field_meta?: Record<string, FieldMeta>;
  field_positions: Record<string, FieldPosition>;
  page_width: number;
  page_height: number;
  table_rows: Record<string, string>[];
  table_evidence?: string;
  applied_conditions: string[];
  text_preview: string;
}

export interface ExtractionResult {
  template_id: string;
  template_name: string;
  template_type: string;
  decision?: "approved" | "for_review" | "rejected" | null;
  pages: ExtractedPage[];
}

export interface AIPlan {
  pages_to_keep: number[];
  operation: string;
  reason: string;
  download_url?: string;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<{ success: boolean; data: T | null; error: string | null }> {
  // Never let this reject — a rejected promise here (network error, timeout,
  // CORS failure, non-JSON response) would leave every bare `.then()` caller
  // across the app (starting with the root auth check) permanently hanging,
  // stuck on a loading spinner that not even a refresh clears since the same
  // failure just repeats.
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: "include", ...options });
    if (res.status === 401) onUnauthorized?.();
    return await res.json();
  } catch (e) {
    return { success: false, data: null, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function login(email: string, password: string) {
  return apiFetch<AuthUser>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return apiFetch<null>("/auth/logout", { method: "POST" });
}

export async function getMe() {
  return apiFetch<AuthUser>("/auth/me");
}

export async function getUsers() {
  return apiFetch<AuthUser[]>("/users");
}

export async function createUser(payload: { email: string; name: string; password: string; role?: "admin" | "member" }) {
  return apiFetch<AuthUser>("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(id: string) {
  return apiFetch<{ deleted: string }>(`/users/${id}`, { method: "DELETE" });
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

export async function promoteSplitOutput(filename: string, display_name?: string) {
  return apiFetch<{ file_id: string; page_count: number }>("/split/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, display_name }),
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
  field_synonyms?: Record<string, string[]>;
  unique_id_fields?: string[];
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

export async function updateTemplate(
  id: string,
  payload: {
    field_config?: Record<string, Partial<FieldConfig>>;
    table_config?: Record<string, Partial<FieldConfig>>;
    direct_link_fields?: string[];
    table_fields?: string[];
    unique_id_fields?: string[];
    secondary_id_fields?: string[];
    reference_id_fields?: string[];
    editable_in_file?: boolean;
  }
) {
  return apiFetch<Template>(`/templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function copyTemplateFrom(target_id: string, source_template_id: string) {
  return apiFetch<Template>(`/templates/${target_id}/copy-from`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_template_id }),
  });
}

export async function getTemplateComments(template_id: string) {
  return apiFetch<TemplateComment[]>(`/templates/${template_id}/comments`);
}

export async function addTemplateComment(template_id: string, text: string, user = "me") {
  return apiFetch<TemplateComment>(`/templates/${template_id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user }),
  });
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

export async function suggestTemplate(file_id: string) {
  return apiFetch<{ template_id: string | null; template_name: string | null; pages: DetectedPage[] }>(
    "/templates/suggest",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id }),
    }
  );
}

export interface ProposedTemplate {
  suggested_name: string;
  suggested_type: string;
  direct_link_fields: string[];
  table_fields: string[];
}

export async function proposeTemplate(file_id: string) {
  return apiFetch<ProposedTemplate>("/templates/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id }),
  });
}

export interface SmartExtractedPage {
  page_number: number;
  document_type: string | null;
  fields: Record<string, string | null>;
  field_meta?: Record<string, FieldMeta>;
  table_columns: string[];
  table_rows: Record<string, string>[];
  table_evidence?: string;
  text_preview: string;
}

export async function smartExtract(file_id: string, page_numbers?: number[]) {
  return apiFetch<{ pages: SmartExtractedPage[]; decision?: "approved" | "for_review" | "rejected" | null }>("/smart-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id, page_numbers }),
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

export interface DocumentGroup {
  document_number: number;
  document_type: string;
  pages: number[];
  customer: string | null;
  agent: string | null;
  reference: string | null;
  is_invoice: boolean;
}

export interface DocumentGroupResult {
  documents: DocumentGroup[];
}

export async function groupDocuments(file_id: string) {
  return apiFetch<DocumentGroupResult>("/documents/group", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id }),
  });
}

export interface FileRecord {
  id: string;
  filename: string;
  size_bytes: number;
  page_count: number;
  template_id: string | null;
  template_name: string | null;
  template_type: string | null;
  suggested_template_id?: string | null;
  suggested_template_name?: string | null;
  status: string;
  uploaded_at: string;
  extracted_at: string | null;
  owner_id?: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
  assigned_to?: string | null;
  decision?: "approved" | "for_review" | "rejected" | null;
  pages: Array<{
    page_number: number;
    fields: Record<string, string | null>;
    field_meta?: Record<string, FieldMeta>;
    field_positions?: Record<string, FieldPosition>;
    page_width?: number;
    page_height?: number;
    table_rows: Record<string, string>[];
    table_evidence?: string;
    applied_conditions: string[];
    text_preview: string;
  }>;
}

export interface WorkflowState {
  id: string;
  name: string;
  order: number;
}

export async function getFileRecords() {
  return apiFetch<FileRecord[]>("/files");
}

export async function getFileRecord(id: string) {
  return apiFetch<FileRecord>(`/files/${id}`);
}

export async function setFileStatus(id: string, status: FileRecord["status"]) {
  return apiFetch<FileRecord>(`/files/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function deleteFileRecord(id: string) {
  return apiFetch<{ deleted: string }>(`/files/${id}`, { method: "DELETE" });
}

export async function bulkUpdateStatus(file_ids: string[], status: string) {
  return apiFetch<{ updated: number }>("/files/bulk/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids, status }),
  });
}

export async function bulkDelete(file_ids: string[]) {
  return apiFetch<{ deleted: number }>("/files/bulk/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids }),
  });
}

export async function assignFile(id: string, assigned_to: string | null) {
  return apiFetch<FileRecord>(`/files/${id}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigned_to }),
  });
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  user: string;
  details: Record<string, unknown>;
}

export async function getAuditLogs(params?: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.entity_type) q.set("entity_type", params.entity_type);
  if (params?.entity_id) q.set("entity_id", params.entity_id);
  if (params?.action) q.set("action", params.action);
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return apiFetch<AuditEvent[]>(`/audit/logs${q.toString() ? "?" + q : ""}`);
}

export async function getAuditSummary() {
  return apiFetch<{ total: number; actions: Record<string, number>; entity_types: Record<string, number>; latest: AuditEvent[] }>("/audit/summary");
}

export async function updateFileField(
  id: string,
  field: string,
  value: string | null,
  action: "update" | "add" | "delete" = "update",
  reason?: string
) {
  return apiFetch<FileRecord>(`/files/${id}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, value, action, reason }),
  });
}

export interface AiMemory {
  id: string;
  field_name: string;
  doc_type: string | null;
  original_value: string | null;
  corrected_value: string | null;
  reason: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export async function getAiMemories(doc_type?: string) {
  const q = doc_type ? `?doc_type=${encodeURIComponent(doc_type)}` : "";
  return apiFetch<{ memories: AiMemory[]; active_count: number; total_count: number }>(`/ai-memories${q}`);
}

export async function updateAiMemory(id: string, updates: { active?: boolean; reason?: string; corrected_value?: string }) {
  return apiFetch<AiMemory>(`/ai-memories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function deleteAiMemory(id: string) {
  return apiFetch<{ deleted: string }>(`/ai-memories/${id}`, { method: "DELETE" });
}

export async function setFieldDecision(id: string, field: string, status: "approved" | "needs_review" | "rejected") {
  return apiFetch<FileRecord>(`/files/${id}/fields/decision`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, status }),
  });
}

export async function setRecordDecision(id: string, decision: "approved" | "for_review" | "rejected") {
  return apiFetch<FileRecord>(`/files/${id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

export async function getFileComments(id: string) {
  return apiFetch<TemplateComment[]>(`/files/${id}/comments`);
}

export async function postFileComment(id: string, text: string, user = "me") {
  return apiFetch<TemplateComment>(`/files/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, user }),
  });
}

export interface AutoApproveSettings {
  auto_approve_enabled: boolean;
  auto_approve_threshold: number;
  auto_reject_enabled: boolean;
  auto_reject_doc_types: string[];
}

export async function getAutoApproveSettings() {
  return apiFetch<AutoApproveSettings>("/settings/auto-approve");
}

export async function updateAutoApproveSettings(updates: Partial<Pick<AutoApproveSettings, "auto_approve_enabled" | "auto_approve_threshold">>) {
  return apiFetch<AutoApproveSettings>("/settings/auto-approve", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function updateAutoRejectSettings(updates: Partial<Pick<AutoApproveSettings, "auto_reject_enabled" | "auto_reject_doc_types">>) {
  return apiFetch<AutoApproveSettings>("/settings/auto-reject", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export interface ExtractionQuality {
  auto_approved_fields_total: number;
  corrected_after_approval_total: number;
  correction_rate: number | null;
}

export async function getExtractionQuality() {
  return apiFetch<ExtractionQuality>("/settings/extraction-quality");
}

export async function getWorkflowStates() {
  return apiFetch<WorkflowState[]>("/workflow/states");
}

export async function createWorkflowState(name: string) {
  return apiFetch<WorkflowState>("/workflow/states", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function updateWorkflowState(id: string, name: string) {
  return apiFetch<WorkflowState>(`/workflow/states/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteWorkflowState(id: string) {
  return apiFetch<{ deleted: string }>(`/workflow/states/${id}`, { method: "DELETE" });
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

export interface RuleAction {
  type: "set_status" | "set_field";
  field?: string;
  value: string;
}

export interface Rule {
  id: string;
  name: string;
  trigger_type: string;
  logic_operator: "AND" | "OR";
  conditions: RuleCondition[];
  actions: RuleAction[];
  description: string;
  created_by: string;
  active: boolean;
  sequence: number;
  created_at: string;
}

export interface GeneratedRule {
  name: string;
  description: string;
  logic_operator: "AND" | "OR";
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export async function getRules(trigger_type?: string) {
  const q = trigger_type ? `?trigger_type=${encodeURIComponent(trigger_type)}` : "";
  return apiFetch<Rule[]>(`/rules${q}`);
}

export async function getRuleMeta() {
  return apiFetch<{ trigger_types: string[]; condition_operators: string[]; action_types: string[] }>("/rules/meta");
}

export async function createRule(payload: Omit<Rule, "id" | "active" | "sequence" | "created_at">) {
  return apiFetch<Rule>("/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateRule(id: string, payload: Partial<Rule>) {
  return apiFetch<Rule>(`/rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function toggleRule(id: string) {
  return apiFetch<Rule>(`/rules/${id}/toggle`, { method: "PATCH" });
}

export async function deleteRule(id: string) {
  return apiFetch<{ deleted: string }>(`/rules/${id}`, { method: "DELETE" });
}

export async function generateRule(params: { description: string; trigger_type: string; file_id?: string }) {
  return apiFetch<GeneratedRule>("/rules/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export async function testRule(params: {
  conditions: RuleCondition[];
  logic_operator: string;
  actions: RuleAction[];
  file_id: string;
}) {
  return apiFetch<{
    triggered: boolean;
    condition_results: Array<{ condition: RuleCondition; passed: boolean; field_value: string | null }>;
    actions_that_would_run: RuleAction[];
    sample_data: Record<string, string | null>;
  }>("/rules/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

// ─── Library ──────────────────────────────────────────────────────────────

export interface Library {
  id: string;
  name: string;
  description: string;
  columns: string[];
  rows: Array<Record<string, string>>;
  cache?: Array<Record<string, string>>;
  last_indexed_at?: string | null;
  indexed_row_count?: number;
  created_at: string;
  updated_at: string;
}

export async function getLibraries() {
  return apiFetch<Library[]>("/libraries");
}

export async function getLibrary(id: string) {
  return apiFetch<Library>(`/libraries/${id}`);
}

export async function createLibrary(payload: { name: string; description?: string; columns?: string[] }) {
  return apiFetch<Library>("/libraries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateLibrary(id: string, payload: { name?: string; description?: string; columns?: string[] }) {
  return apiFetch<Library>(`/libraries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteLibrary(id: string) {
  return apiFetch<{ deleted: string }>(`/libraries/${id}`, { method: "DELETE" });
}

export async function addLibraryRow(id: string, row: Record<string, string>) {
  return apiFetch<Library>(`/libraries/${id}/rows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ row }),
  });
}

export async function updateLibraryRow(id: string, rowId: string, row: Record<string, string>) {
  return apiFetch<Library>(`/libraries/${id}/rows/${rowId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ row }),
  });
}

export async function deleteLibraryRow(id: string, rowId: string) {
  return apiFetch<Library>(`/libraries/${id}/rows/${rowId}`, { method: "DELETE" });
}

export async function importLibraryCSV(id: string, csv_text: string) {
  return apiFetch<Library>(`/libraries/${id}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv_text }),
  });
}

export async function reindexLibrary(id: string) {
  return apiFetch<Library>(`/libraries/${id}/reindex`, { method: "POST" });
}

export async function getLibraryCache(id: string) {
  return apiFetch<Array<Record<string, string>>>(`/libraries/${id}/cache`);
}

export async function clearLibraryCache(id: string) {
  return apiFetch<Library>(`/libraries/${id}/cache/clear`, { method: "POST" });
}

export async function deleteLibraryCacheRow(id: string, cacheRowId: string) {
  return apiFetch<Library>(`/libraries/${id}/cache/${cacheRowId}`, { method: "DELETE" });
}

// ─── Learning ─────────────────────────────────────────────────────────────

export interface Lesson {
  id: string;
  title: string;
  type: "video" | "article" | "quiz";
  completed: boolean;
}

export interface LearningModule {
  id: string;
  title: string;
  description: string;
  category: string;
  duration_minutes: number;
  lessons: Lesson[];
  created_at: string;
}

export async function getLearningModules(category?: string) {
  const q = category ? `?category=${encodeURIComponent(category)}` : "";
  return apiFetch<LearningModule[]>(`/learning/modules${q}`);
}

export async function completeLearningLesson(moduleId: string, lessonId: string, completed = true) {
  return apiFetch<LearningModule>(`/learning/modules/${moduleId}/lessons/${lessonId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
}

// ─── Security ─────────────────────────────────────────────────────────────

export interface SecurityRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface SecurityUser {
  id: string;
  name: string;
  email: string;
  role_id: string;
  active: boolean;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  role_id: string;
  key: string;
  active: boolean;
  created_at: string;
  last_used: string | null;
}

export interface SecuritySettings {
  require_mfa: boolean;
  session_timeout_minutes: number;
  max_file_size_mb: number;
  allowed_file_types: string[];
  audit_log_enabled: boolean;
  ip_whitelist_enabled: boolean;
  ip_whitelist: string[];
}

export interface SecurityConfig {
  roles: SecurityRole[];
  users: SecurityUser[];
  api_keys: ApiKey[];
  settings: SecuritySettings;
  all_permissions: string[];
}

export async function getSecurityConfig() {
  return apiFetch<SecurityConfig>("/security/config");
}

export async function createSecurityRole(payload: { name: string; description?: string; permissions: string[] }) {
  return apiFetch<SecurityRole>("/security/roles", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function updateSecurityRole(id: string, payload: Partial<SecurityRole>) {
  return apiFetch<SecurityRole>(`/security/roles/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function deleteSecurityRole(id: string) {
  return apiFetch<{ deleted: string }>(`/security/roles/${id}`, { method: "DELETE" });
}

export async function createSecurityUser(payload: { name: string; email: string; role_id: string }) {
  return apiFetch<SecurityUser>("/security/users", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function updateSecurityUser(id: string, payload: Partial<SecurityUser>) {
  return apiFetch<SecurityUser>(`/security/users/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function deleteSecurityUser(id: string) {
  return apiFetch<{ deleted: string }>(`/security/users/${id}`, { method: "DELETE" });
}

export async function createApiKey(payload: { name: string; role_id: string }) {
  return apiFetch<ApiKey>("/security/api-keys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

export async function revokeApiKey(id: string) {
  return apiFetch<{ revoked: string }>(`/security/api-keys/${id}/revoke`, { method: "PATCH" });
}

export async function deleteApiKey(id: string) {
  return apiFetch<{ deleted: string }>(`/security/api-keys/${id}`, { method: "DELETE" });
}

export async function updateSecuritySettings(payload: Partial<SecuritySettings>) {
  return apiFetch<SecuritySettings>("/security/settings", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

// ─── Export & Integrations ────────────────────────────────────────────────

export interface Integration {
  id: string;
  name: string;
  type: string;
  endpoint_url: string;
  auth_type: "none" | "bearer" | "api_key" | "basic";
  auth_token: string;
  headers: Record<string, string>;
  field_mapping: Record<string, string>;
  description: string;
  active: boolean;
  last_pushed_at: string | null;
  created_at: string;
}

export interface PushResult {
  success: boolean;
  status_code: number | null;
  response_body: string;
  records_pushed: number;
}

export async function exportFiles(
  format: "csv" | "excel" | "json",
  file_ids: string[],
  fields?: string[]
): Promise<void> {
  const ext = format === "excel" ? "xlsx" : format;
  const res = await fetch(`${BASE}/export/${format === "excel" ? "excel" : format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids, fields }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `export.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getIntegrations() {
  return apiFetch<Integration[]>("/export/integrations");
}

export async function createIntegration(payload: Omit<Integration, "id" | "active" | "last_pushed_at" | "created_at">) {
  return apiFetch<Integration>("/export/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateIntegration(id: string, payload: Partial<Integration>) {
  return apiFetch<Integration>(`/export/integrations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteIntegration(id: string) {
  return apiFetch<{ deleted: string }>(`/export/integrations/${id}`, { method: "DELETE" });
}

export async function testIntegration(id: string) {
  return apiFetch<PushResult>(`/export/integrations/${id}/test`, { method: "POST" });
}

export async function pushToIntegration(id: string, file_ids: string[]) {
  return apiFetch<PushResult>(`/export/integrations/${id}/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids }),
  });
}

export async function reorderWorkflowStates(ordered_ids: string[]) {
  return apiFetch<WorkflowState[]>("/workflow/states/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordered_ids }),
  });
}

export async function refineExtraction(params: {
  template_id: string;
  file_id: string;
  page_number: number;
  current_fields: Record<string, string | null>;
  current_table_rows: Record<string, string>[];
  instructions: string;
  mode: "headers" | "table";
}) {
  const { template_id, ...body } = params;
  return apiFetch<{
    fields?: Record<string, string | null>;
    table_rows?: Record<string, string>[];
  }>(`/templates/${template_id}/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function downloadUrl(url: string) {
  return `${BASE}${url}`;
}

export interface DuplicateGroup {
  template_id: string;
  template_name: string;
  unique_id_fields: string[];
  match_values: Record<string, string>;
  files: Array<{
    id: string;
    filename: string;
    status: string;
    uploaded_at: string;
  }>;
}

export async function getDuplicates() {
  return apiFetch<DuplicateGroup[]>("/duplicates");
}

export interface ApprovalRoute {
  id: string;
  state_name: string;
  approver: string;
  escalation_hours: number | null;
}

export interface PendingApproval {
  file_id: string;
  filename: string;
  status: string;
  assigned_to: string | null;
  approver: string;
  entered_at: string | null;
  hours_waiting: number | null;
  escalation_hours: number | null;
  overdue: boolean;
}

export async function getApprovalRoutes() {
  return apiFetch<ApprovalRoute[]>("/approvals/routes");
}

export async function createApprovalRoute(state_name: string, approver: string, escalation_hours?: number | null) {
  return apiFetch<ApprovalRoute>("/approvals/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state_name, approver, escalation_hours }),
  });
}

export async function deleteApprovalRoute(id: string) {
  return apiFetch<{ deleted: string }>(`/approvals/routes/${id}`, { method: "DELETE" });
}

export async function getPendingApprovals() {
  return apiFetch<PendingApproval[]>("/approvals/pending");
}

export interface ReconciliationComparison {
  field: string;
  values: Record<string, string | null>;
  matches: boolean;
}

export interface ReconciliationGroup {
  key_value: string;
  files: Array<{ id: string; filename: string; template_name: string | null }>;
  comparisons: ReconciliationComparison[];
  all_match: boolean;
}

export async function getReconciliationFields(file_ids: string[]) {
  return apiFetch<string[]>("/reconciliation/fields", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids }),
  });
}

export async function runReconciliation(file_ids: string[], match_field: string, compare_fields: string[]) {
  return apiFetch<ReconciliationGroup[]>("/reconciliation/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_ids, match_field, compare_fields }),
  });
}

export interface DocumentType {
  id: string;
  document_type: string;
  client_document_type: string;
  abbreviation: string;
  keywords: string[];
  description: string;
  allow_processing: boolean;
  created_at: string;
  updated_at: string;
}

export async function getDocumentTypes() {
  return apiFetch<DocumentType[]>("/document-types");
}

export async function createDocumentType(payload: {
  document_type: string;
  abbreviation: string;
  client_document_type?: string;
  keywords?: string[];
  description?: string;
  allow_processing?: boolean;
}) {
  return apiFetch<DocumentType>("/document-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateDocumentType(id: string, updates: Partial<Omit<DocumentType, "id" | "created_at" | "updated_at">>) {
  return apiFetch<DocumentType>(`/document-types/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function deleteDocumentType(id: string) {
  return apiFetch<{ deleted: string }>(`/document-types/${id}`, { method: "DELETE" });
}

export interface InboxRecord {
  id: string;
  from: string;
  subject: string;
  received_at: string;
  body_preview: string;
  file_ids: string[];
  attachment_count: number;
  page_count: number;
  status: string;
  assigned_to: string | null;
  tags: string[];
  created_at: string;
}

export interface InboxCounts {
  processing: number;
  to_review: number;
  archived: number;
  pages_to_process: number;
}

export async function getInbox() {
  return apiFetch<{ records: InboxRecord[]; counts: InboxCounts }>("/inbox");
}

export async function getInboxConfig() {
  return apiFetch<{ configured: boolean; mailbox_count: number; user: string | null }>("/inbox/config");
}

export interface Mailbox {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  template_id: string | null;
  template_name: string | null;
  enabled: boolean;
  created_at: string;
}

export async function getMailboxes() {
  return apiFetch<Mailbox[]>("/mailboxes");
}

export async function createMailbox(payload: {
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
  template_id?: string | null;
  template_name?: string | null;
}) {
  return apiFetch<Mailbox>("/mailboxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateMailbox(
  id: string,
  payload: Partial<{
    label: string; host: string; port: number; user: string; password: string;
    template_id: string | null; template_name: string | null; enabled: boolean;
  }>
) {
  return apiFetch<Mailbox>(`/mailboxes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteMailbox(id: string) {
  return apiFetch<{ deleted: string }>(`/mailboxes/${id}`, { method: "DELETE" });
}

export async function pollInbox() {
  return apiFetch<{ checked: number; ingested: number; new_files: number; first_run: boolean }>("/inbox/poll", {
    method: "POST",
  });
}

export async function setInboxStatus(id: string, status: string) {
  return apiFetch<InboxRecord>(`/inbox/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function assignInboxRecord(id: string, assigned_to: string | null) {
  return apiFetch<InboxRecord>(`/inbox/${id}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigned_to }),
  });
}

export interface GlobalSearchResult {
  files: Array<{ id: string; filename: string; template_name: string | null }>;
  inbox: Array<{ id: string; subject: string; from: string }>;
}

export async function globalSearch(q: string) {
  return apiFetch<GlobalSearchResult>(`/search?q=${encodeURIComponent(q)}`);
}
