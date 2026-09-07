import type { LeadRow } from "@/lib/types";

const CSV_COLUMNS: { header: string; value: (r: LeadRow) => string | number | undefined }[] = [
  { header: "Name", value: (r) => r.lead.name },
  { header: "Type", value: (r) => r.lead.type },
  { header: "Status", value: (r) => r.lead.status },
  { header: "Score", value: (r) => (r.lead.score !== undefined ? Math.round(r.lead.score) : "") },
  { header: "Contact email", value: (r) => r.lead.contactEmail ?? "" },
  { header: "Relevance note", value: (r) => r.lead.relevanceNote ?? "" },
  { header: "Website", value: (r) => r.lead.url ?? "" },
  { header: "Source", value: (r) => r.lead.source ?? "" },
  { header: "Address", value: (r) => r.lead.address ?? "" },
  { header: "Outreach sent", value: (r) => (r.outreach?.sentAt ? "yes" : "no") },
  {
    header: "Reply",
    value: (r) => r.outreach?.replyClassification ?? (r.outreach?.lastReplyAt ? "replied" : ""),
  },
];

function escapeCell(value: string | number | undefined): string {
  const s = value === undefined || value === null ? "" : String(value);
  // Quote if the cell contains a comma, quote, or newline; double inner quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsToCsv(rows: LeadRow[]): string {
  const header = CSV_COLUMNS.map((c) => c.header).join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => escapeCell(c.value(r))).join(","));
  return [header, ...lines].join("\r\n");
}

// Build a CSV from the given rows and trigger a browser download.
export function downloadLeadsCsv(rows: LeadRow[], filename: string): void {
  const csv = leadsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
