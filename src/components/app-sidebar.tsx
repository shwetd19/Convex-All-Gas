import { ChevronDown, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Briefcase,
  Building2,
  CalendarDays,
  Layers,
  Mail,
  Settings2,
  Target,
  Users,
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { formatAgo, initials } from "@/lib/format";
import { LEAD_NAV } from "@/lib/types";
import type { BusinessDoc, LeadRow, LeadType, Page } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEAD_ICON: Record<LeadType, LucideIcon> = {
  customer: Users,
  competitor: Target,
  complement: Layers,
  office: Briefcase,
  event: CalendarDays,
};

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 font-heading font-bold text-amber-950 shadow-md shadow-amber-500/30",
        className,
      )}
    >
      B
    </div>
  );
}

export function AppSidebar({
  businesses,
  selectedId,
  onSelect,
  onAdd,
  page,
  setPage,
  rows,
}: {
  businesses: BusinessDoc[];
  selectedId: Id<"businesses"> | null;
  onSelect: (id: Id<"businesses">) => void;
  onAdd: () => void;
  page: Page;
  setPage: (p: Page) => void;
  rows: LeadRow[] | undefined;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const selected = businesses.find((b) => b._id === selectedId) ?? businesses[0] ?? null;
  const countFor = (t: LeadType) =>
    rows?.filter((r) => r.lead.type === t && r.lead.status !== "skipped").length ?? 0;

  const go = (p: Page) => {
    setPage(p);
    if (isMobile) setOpenMobile(false);
  };

  const navItem = (key: Page, label: string, Icon: LucideIcon, count?: number) => (
    <SidebarMenuItem key={key}>
      <SidebarMenuButton
        isActive={page === key}
        onClick={() => go(key)}
        className="h-10 rounded-lg px-3 text-[0.9rem] text-sidebar-foreground/80 hover:bg-white/8 hover:text-white data-active:bg-white/10 data-active:text-white"
      >
        <Icon className="opacity-70" />
        <span>{label}</span>
        {count !== undefined && (
          <span className="ml-auto text-xs text-sidebar-foreground/60 tabular-nums">{count}</span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const scanning = selected?.status === "sourcing";
  const agentLine = selected
    ? scanning
      ? "Scanning 5 buckets now"
      : selected.lastScanAt
        ? `5 buckets · synced ${formatAgo(selected.lastScanAt)}`
        : "Waiting for first scan"
    : "Add a business to start";

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="gap-4 px-4 pt-5">
        <div className="flex items-center gap-3">
          <BrandMark className="size-11 text-xl" />
          <div className="leading-tight">
            <div className="font-heading text-lg font-bold tracking-wide text-white">BLOCK</div>
            <div className="text-[0.65rem] font-medium tracking-[0.2em] text-sidebar-foreground/60 uppercase">
              Lead agent
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-white p-2.5 text-left shadow-md shadow-black/20 transition-colors hover:bg-slate-50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-bold text-white">
                {selected ? initials(selected.name ?? selected.url) : "+"}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {selected ? (selected.name ?? selected.url) : "Add a business"}
                </div>
                <div className="text-xs text-slate-500">
                  {businesses.length} {businesses.length === 1 ? "workspace" : "workspaces"}
                </div>
              </div>
              <ChevronDown className="size-4 shrink-0 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
            {businesses.map((b) => (
              <DropdownMenuItem key={b._id} onClick={() => onSelect(b._id)} className="gap-2 p-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-blue-50 text-[0.65rem] font-bold text-blue-700">
                  {initials(b.name ?? b.url)}
                </div>
                <span className="truncate">{b.name ?? b.url}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2" onClick={onAdd}>
              <div className="flex size-6 items-center justify-center rounded-md border">
                <Plus className="size-4" />
              </div>
              <span className="font-medium">Add business</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.65rem] tracking-[0.2em] text-sidebar-foreground/50 uppercase">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{navItem("profile", "Business profile", Building2)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.65rem] tracking-[0.2em] text-sidebar-foreground/50 uppercase">
            Lead buckets
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {LEAD_NAV.map((t) => navItem(t.key, t.label, LEAD_ICON[t.key], countFor(t.key)))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[0.65rem] tracking-[0.2em] text-sidebar-foreground/50 uppercase">
            Agent
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItem("activity", "Activity", Activity)}
              {navItem("settings", "Settings", Settings2)}
              {navItem("contact", "Contact", Mail)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={cn(
                "size-2 rounded-full",
                scanning ? "animate-pulse bg-amber-400" : "bg-blue-400",
              )}
            />
            {scanning ? "Agent scanning" : "Agent online"}
          </div>
          <div className="mt-1 truncate text-xs text-sidebar-foreground/60">{agentLine}</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
