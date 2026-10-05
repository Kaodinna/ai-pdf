// One-line explanations shown when hovering a sidebar item. Keyed by the same
// Tab ids used in app/page.tsx.
export const FEATURE_HELP: Record<string, { title: string; body: string }> = {
  files: { title: "Files", body: "Every document you've uploaded, with its extracted fields, status and review decision." },
  templates: { title: "Templates", body: "Define the fields to pull out of one document type. A file matched to a template is extracted automatically." },
  inbox: { title: "Smart Inbox", body: "Documents received by email from your connected mailboxes, and the status of each." },
  ai: { title: "AI Commands", body: "Describe in plain words what you want done to a document, such as keeping only certain pages." },
  split: { title: "Split", body: "Cut a PDF into separate files by page range." },
  merge: { title: "Merge", body: "Combine several PDFs into one file, in the order you choose." },
  workflow: { title: "Workflow", body: "The status stages a file moves through, such as New, Validation, Approved and Rejected." },
  rules: { title: "Rules", body: "Automatic actions that run when a file is extracted or its fields change." },
  library: { title: "Library", body: "Reference lists, such as a customer or port list, that can fill in fields automatically." },
  docTypes: { title: "Document Types", body: "The document categories used for grouping, approval rules and auto-reject." },
  learning: { title: "Learning Module", body: "Corrections your reviewers have made, which teach future extractions." },
  security: { title: "Security", body: "Access and authentication settings for this workspace." },
  analytics: { title: "Analytics", body: "Volumes, review rates and processing trends across your files." },
  duplicates: { title: "Duplicates", body: "Files that look like repeats of one you already have, based on their unique ID fields." },
  reconciliation: { title: "Reconcile", body: "Match documents against each other, such as an invoice against its delivery order." },
  export: { title: "Export", body: "Send extracted data to an external system, such as your ERP, through a configured integration." },
  audit: { title: "Audit Log", body: "A record of who did what to each file, and when." },
  billing: { title: "Billing & Credits", body: "Your credit balance, what each extraction cost, and where to buy more." },
};
