import type { Doc } from "../../convex/_generated/dataModel";

export type BusinessDoc = Doc<"businesses">;
export type LeadDoc = Doc<"leads">;
export type OutreachDoc = Doc<"outreach">;
export type MessageDoc = Doc<"messages">;
export type LeadRow = { lead: LeadDoc; outreach: OutreachDoc | null };
export type LeadType = LeadDoc["type"];
export type Page = LeadType | "activity" | "profile" | "settings" | "contact";

export const TYPE_LABEL: Record<LeadType, string> = {
  competitor: "Competitor",
  complement: "Complement",
  office: "Office",
  event: "Event",
  customer: "Customer",
};

export const LEAD_NAV: { key: LeadType; label: string }[] = [
  { key: "customer", label: "Customers" },
  { key: "competitor", label: "Competitors" },
  { key: "complement", label: "Complements" },
  { key: "office", label: "Offices" },
  { key: "event", label: "Events" },
];

export const STATUS_LABEL: Record<LeadDoc["status"], string> = {
  sourced: "New lead",
  approved: "Sending…",
  outreach_sent: "Outreach sent",
  replied: "Replied",
  followed_up: "Followed up",
  cold: "Cold",
  won: "Won",
  skipped: "Skipped",
};

export const CLASSIFICATION_LABEL: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  needs_info: "Needs info",
};

export const KIND_LABEL: Record<MessageDoc["kind"], string> = {
  initial: "Outreach",
  follow_up: "Follow-up",
  reply: "Reply",
  auto_reply: "Auto-reply",
  manual_reply: "Your reply",
};

export const PAGE_TITLE: Record<Page, string> = {
  customer: "Customers",
  competitor: "Competitors",
  complement: "Complements",
  office: "Offices",
  event: "Events",
  activity: "Activity",
  profile: "Business profile",
  settings: "Settings",
  contact: "Contact",
};

export const PAGE_GROUP: Record<Page, string> = {
  customer: "Leads",
  competitor: "Leads",
  complement: "Leads",
  office: "Leads",
  event: "Leads",
  activity: "Agent",
  profile: "Workspace",
  settings: "Agent",
  contact: "Agent",
};

export function isDraftReady(row: LeadRow): boolean {
  return (
    row.lead.status === "sourced" &&
    !!row.lead.contactEmail &&
    row.outreach?.draftStatus === "ready" &&
    row.outreach.sentAt === undefined
  );
}
