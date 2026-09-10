import { useHealthCheck, getHealthCheckQueryKey } from "@workspace/api-client-react";
import { Activity, ChevronDown, FileText, Plus, Wifi, WifiOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

type WorkspaceShellProps = {
  children: ReactNode;
  onNewDocument: () => void;
};

export function Avatar({
  initials,
  color,
  size = "md",
  label,
}: {
  initials: string;
  color: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const sizeClass =
    size === "sm"
      ? "h-7 w-7 text-[10px]"
      : size === "lg"
        ? "h-11 w-11 text-sm"
        : "h-8 w-8 text-[11px]";

  return (
    <span
      data-testid={label ? `avatar-${label}` : undefined}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-white ring-2 ring-background ${sizeClass}`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}

export function WorkspaceShell({
  children,
  onNewDocument,
}: WorkspaceShellProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const health = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      staleTime: 60_000,
    },
  });

  const connected = health.data?.status === "ok" || !health.isError;

  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground md:flex">
      <aside
        className={`${
          collapsed ? "md:w-[76px]" : "md:w-[246px]"
        } flex w-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 md:min-h-[100dvh]`}
      >
        <div className="flex h-[72px] items-center justify-between border-b border-sidebar-border px-5">
          <Link
            href="/"
            data-testid="link-workspace-home"
            className="flex items-center gap-3 overflow-hidden"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <FileText size={16} strokeWidth={2.5} />
            </span>

            {!collapsed && (
              <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-.02em]">
                Collab Editor
              </span>
            )}
          </Link>

          <button
            type="button"
            data-testid="button-toggle-sidebar"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground md:block"
            aria-label="Toggle sidebar"
          >
            <ChevronDown
              className={`rotate-90 transition-transform ${
                collapsed ? "rotate-180" : ""
              }`}
              size={15}
            />
          </button>
        </div>

        <div className="flex-1 px-3 py-5">
          <button
            type="button"
            data-testid="button-create-document"
            onClick={onNewDocument}
            className={`${
              collapsed ? "justify-center px-0" : "px-3"
            } mb-6 flex h-10 w-full items-center gap-2 rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-[0_7px_18px_hsl(var(--sidebar-primary)/.16)] hover:brightness-105`}
          >
            <Plus size={17} />

            {!collapsed && <span>New document</span>}
          </button>

          <nav className="space-y-1">
            <Link
              href="/"
              data-testid="link-nav-home"
              className={`${
                location === "/"
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/62 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground"
              } ${
                collapsed ? "justify-center px-0" : "px-3"
              } flex h-10 items-center gap-3 rounded-lg text-[13px] font-medium`}
            >
              <FileText size={16} />

              {!collapsed && <span>Documents</span>}
            </Link>
          </nav>

          {!collapsed && (
            <div className="mt-10">
              <div className="mb-3 px-3 font-mono text-[9px] font-medium uppercase tracking-[.18em] text-sidebar-foreground/38">
                Workspace
              </div>

              <div className="space-y-1">
                <Link
                    href="/"
                    data-testid="button-workspace-activity"
                    className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[12px] text-sidebar-foreground/58 hover:bg-sidebar-accent/75 hover:text-sidebar-foreground"
>
                   <Activity size={15} />
                    Activity
                </Link>
               </div>
            </div>
          )}
        </div>

        <div
          className={`${
            collapsed ? "items-center px-3" : "px-5"
          } border-t border-sidebar-border py-4`}
        >
          <div
            className={`${
              collapsed ? "justify-center" : "justify-between"
            } flex items-center`}
          >
            {!collapsed && (
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="pulse-soft absolute inline-flex h-full w-full rounded-full bg-sidebar-primary" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-sidebar-primary" />
                </span>

                <span
                  data-testid="status-health"
                  className="font-mono text-[10px] uppercase tracking-[.12em] text-sidebar-foreground/52"
                >
                  {health.isLoading
                    ? "Checking"
                    : connected
                      ? "Connected"
                      : "Reconnecting"}
                </span>
              </div>
            )}

            {collapsed && (
              <div className="text-sidebar-foreground/45">
                {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
