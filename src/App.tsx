import { useQuery } from "convex/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { LogOut, Search } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import SignInForm from "./Auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityPage } from "@/pages/activity";
import { ContactPage } from "@/pages/contact";
import { DashboardPage } from "@/pages/dashboard";
import { LeadsPage } from "@/pages/leads";
import { SettingsPage } from "@/pages/settings";
import { ConfirmCard, FailedCard, Onboarding, ProgressPanel } from "@/pages/setup";
import { PAGE_GROUP, PAGE_TITLE } from "@/lib/types";
import type { LeadType, Page } from "@/lib/types";

function LoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="w-full max-w-sm space-y-3 p-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function AppHeader({
  group,
  title,
  search,
  onSearch,
  email,
  onSignOut,
}: {
  group: string;
  title: string;
  search: string;
  onSearch: (v: string) => void;
  email: string | undefined;
  onSignOut: () => void;
}) {
  const initial = (email ?? "?").charAt(0).toUpperCase();
  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
      <SidebarTrigger className="-ml-1 md:hidden" />
      <nav className="flex min-w-0 items-center gap-2 text-base">
        {group && <span className="hidden text-muted-foreground sm:inline">{group}</span>}
        {group && <span className="hidden text-muted-foreground/60 sm:inline">/</span>}
        <span className="truncate font-semibold">{title}</span>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search leads, offices, events…"
            className="h-10 w-72 rounded-full border-transparent bg-slate-100 pl-10 shadow-none focus-visible:bg-background dark:bg-white/5"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Avatar className="size-10">
                <AvatarFallback className="bg-gradient-to-br from-amber-300 to-amber-500 font-bold text-amber-950">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="min-w-56 rounded-xl">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function Root() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const businesses = useQuery(api.businesses.list);
  const [selectedId, setSelectedId] = useState<Id<"businesses"> | null>(null);
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState<Page>("profile");
  const [search, setSearch] = useState("");

  const selected =
    businesses?.find((b) => b._id === selectedId) ?? (businesses ? businesses[0] : null) ?? null;
  const active = selected && (selected.status === "sourcing" || selected.status === "ready");
  const rows = useQuery(api.leads.list, active ? { businessId: selected._id } : "skip");

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <SignInForm />;
  if (businesses === undefined || businesses === null) return <LoadingScreen />;

  const showOnboarding = adding || businesses.length === 0;
  const goTo = (t: LeadType) => {
    setPage(t);
    setAdding(false);
  };

  let content: ReactNode;
  let group = "";
  let title: string;
  if (showOnboarding) {
    title = "Add business";
    content = (
      <Onboarding
        onCreated={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onCancel={businesses.length > 0 ? () => setAdding(false) : undefined}
      />
    );
  } else if (!selected) {
    title = "";
    content = null;
  } else if (selected.status === "scraping") {
    title = "Setting up";
    content = <ProgressPanel business={selected} title="Reading the site…" />;
  } else if (selected.status === "confirm") {
    title = "Confirm business";
    content = <ConfirmCard business={selected} />;
  } else if (selected.status === "failed") {
    title = "Setup failed";
    content = <FailedCard business={selected} />;
  } else {
    group = PAGE_GROUP[page];
    title = PAGE_TITLE[page];
    if (page === "contact") content = <ContactPage />;
    else if (page === "profile")
      content = (
        <DashboardPage key={selected._id} business={selected} rows={rows ?? []} search={search} onGoTo={goTo} />
      );
    else if (page === "settings") content = <SettingsPage business={selected} />;
    else if (page === "activity") content = <ActivityPage businessId={selected._id} />;
    else content = <LeadsPage business={selected} rows={rows ?? []} type={page} search={search} />;
  }

  return (
    <SidebarProvider>
      <AppSidebar
        businesses={businesses}
        selectedId={selected?._id ?? null}
        onSelect={(id) => {
          setSelectedId(id);
          setAdding(false);
        }}
        onAdd={() => setAdding(true)}
        page={page}
        setPage={(p) => {
          setPage(p);
          setAdding(false);
        }}
        rows={rows ?? undefined}
      />
      <SidebarInset>
        <AppHeader
          group={group}
          title={title}
          search={search}
          onSearch={setSearch}
          email={me?.email}
          onSignOut={() => void signOut()}
        />
        <div className="mx-auto w-full min-w-0 max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{content}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function App() {
  return <Root />;
}
