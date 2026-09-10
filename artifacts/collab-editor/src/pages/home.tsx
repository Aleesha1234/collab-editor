import { getListActivityQueryKey, getListDocumentsQueryKey, useCreateDocument, useListActivity, useListDocuments, type ActivityEvent, type Document } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Clock3, FilePlus2, FileText, Loader2, PencilLine, Plus, RotateCw, Search, Sparkles, UsersRound, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Avatar, WorkspaceShell } from "@/components/workspace-shell";

function timeAgo(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SkeletonRows() {
  return (
    <div data-testid="loading-documents" className="space-y-3">
      {[1, 2, 3].map((row) => (
        <div key={row} className="flex h-[76px] animate-pulse items-center gap-4 rounded-xl border border-border/70 bg-card/60 px-5">
          <div className="h-9 w-9 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-2 w-1/4 rounded bg-muted" />
          </div>
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
  if (type === "created") return <FilePlus2 size={14} />;
  if (type === "edited") return <PencilLine size={14} />;
  if (type === "joined") return <UsersRound size={14} />;
  return <Clock3 size={14} />;
}

function CreateDialog({
  open,
  onClose,
  onCreate,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, content: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) onCreate(name.trim(), content);
  };

  return (
    <div
      data-testid="dialog-create-document"
      className="fixed inset-0 z-40 grid place-items-center bg-foreground/35 px-4 backdrop-blur-[2px]"
    >
      <form
        onSubmit={submit}
        className="room-in w-full max-w-[470px] rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">
              Start a new room
            </div>
            <h2 className="mt-2 font-serif text-3xl tracking-[-.035em]">
              Give it a name.
            </h2>
          </div>

          <button
            type="button"
            data-testid="button-close-create"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            Document name
          </span>

          <input
            autoFocus
            data-testid="input-document-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Q3 launch brief"
            maxLength={120}
            className="h-11 w-full rounded-lg border border-input bg-background px-3.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
            First thought{" "}
            <span className="font-normal normal-case tracking-normal opacity-70">
              optional
            </span>
          </span>

          <textarea
            data-testid="input-document-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start with a sentence, a question, or a blank page."
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-testid="button-cancel-create"
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>

          <button
            type="submit"
            data-testid="button-submit-create"
            disabled={!name.trim() || pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Open room
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const documentsQuery = useListDocuments();
  const activityQuery = useListActivity();
  const createDocument = useCreateDocument();

  const documents = (documentsQuery.data ?? []) as Document[];

  const filtered = useMemo(
    () =>
      documents.filter((doc) =>
        doc.name.toLowerCase().includes(search.toLowerCase())
      ),
    [documents, search]
  );

  const handleCreate = (name: string, content: string) =>
    createDocument.mutate(
      { data: { name, content } },
      {
        onSuccess: (doc) => {
          queryClient.invalidateQueries({
            queryKey: getListDocumentsQueryKey(),
          });

          queryClient.invalidateQueries({
            queryKey: getListActivityQueryKey(),
          });

          setCreateOpen(false);
          setLocation(`/documents/${doc.id}`);
        },
      }
    );

  return (
    <WorkspaceShell onNewDocument={() => setCreateOpen(true)}>
      <div className="mx-auto max-w-[1380px] px-5 pb-12 sm:px-8 lg:px-12">
        <header className="flex min-h-[72px] items-center justify-between border-b border-border/75">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Workspace</span>
            <span className="text-border">/</span>
            <span className="font-medium text-foreground">Documents</span>
          </div>
        </header>

        <section className="room-in pt-10 md:pt-14">
          <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
            <div>
              <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.2em] text-accent-foreground/65">
                <Sparkles size={13} className="text-accent" />
                The writing room
              </div>

              <h1
                data-testid="text-page-heading"
                className="font-serif text-[clamp(2.8rem,6vw,5.5rem)] leading-[.9] tracking-[-.06em] text-foreground"
              >
                Make space
                <br />
                <em className="text-accent-foreground/72">
                  for good work.
                </em>
              </h1>

              <p className="mt-6 max-w-[410px] text-sm leading-6 text-muted-foreground">
                A quiet place for your team to think out loud, shape ideas,
                and leave the document better than you found it.
              </p>
            </div>

            <button
              type="button"
              data-testid="button-hero-create"
              onClick={() => setCreateOpen(true)}
              className="group flex h-12 w-fit items-center gap-3 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/10 hover:-translate-y-0.5"
            >
              <span className="grid h-6 w-6 place-items-center rounded bg-accent text-accent-foreground">
                <Plus size={16} />
              </span>
              New document
              <ArrowUpRight
                size={15}
                className="ml-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </button>
          </div>
        </section>

        <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section className="room-in room-in-delay-1">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold tracking-[-.025em]">
                  Your documents{" "}
                  <span className="ml-1 font-mono text-[11px] font-normal text-muted-foreground">
                    {documents.length}
                  </span>
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Everything your team is shaping right now.
                </p>
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />

                <input
                  id="document-search"
                  data-testid="input-document-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter documents"
                  className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-accent sm:w-[190px]"
                />
              </div>
            </div>

            {documentsQuery.isLoading ? (
              <SkeletonRows />
            ) : documentsQuery.isError ? (
              <div
                data-testid="error-documents"
                className="rounded-xl border border-destructive/25 bg-destructive/5 p-7 text-center"
              >
                <p className="text-sm font-semibold">
                  Couldn’t load your documents.
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  The room is having a quiet moment.
                </p>

                <button
                  type="button"
                  data-testid="button-retry-documents"
                  onClick={() => documentsQuery.refetch()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-accent"
                >
                  <RotateCw size={13} />
                  Try again
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div
                data-testid="empty-documents"
                className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/45 px-5 py-14 text-center"
              >
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <FileText size={21} />
                </div>

                <h3 className="text-sm font-semibold">
                  {search ? "No matching documents" : "Your room is ready"}
                </h3>

                <p className="mt-1 max-w-[260px] text-xs leading-5 text-muted-foreground">
                  {search
                    ? "Try a different phrase."
                    : "Start with a name and give your team somewhere to begin."}
                </p>

                {!search && (
                  <button
                    type="button"
                    data-testid="button-empty-create"
                    onClick={() => setCreateOpen(true)}
                    className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-accent-foreground hover:underline"
                  >
                    <Plus size={14} />
                    Create your first document
                  </button>
                )}
              </div>
            ) : (
              <div
                data-testid="document-list"
                className="space-y-2"
              >
                {filtered.map((doc, index) => (
                  <button
                    key={doc.id}
                    type="button"
                    data-testid={`card-document-${doc.id}`}
                    onClick={() => setLocation(`/documents/${doc.id}`)}
                    className="room-in group flex w-full items-center gap-4 rounded-xl border border-border/80 bg-card px-4 py-4 text-left shadow-[0_1px_0_hsl(var(--border)/.2)] hover:-translate-y-0.5 hover:border-accent/55 hover:shadow-md sm:px-5"
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-secondary text-primary">
                      <FileText size={18} strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div
                        data-testid={`text-document-name-${doc.id}`}
                        className="truncate text-sm font-semibold tracking-[-.01em]"
                      >
                        {doc.name}
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Edited {timeAgo(doc.updatedAt)}</span>
                        <span className="text-border">·</span>

                        <span className="inline-flex items-center gap-1">
                          <UsersRound size={12} />
                          {doc.collaborators.length + 1}
                        </span>
                      </div>
                    </div>

                    <div className="hidden items-center -space-x-2 sm:flex">
                      {[doc.owner, ...doc.collaborators]
                        .slice(0, 3)
                        .map((person) => (
                          <Avatar
                            key={person.id}
                            initials={person.initials}
                            color={person.color}
                            size="sm"
                            label={person.name}
                          />
                        ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside className="room-in room-in-delay-2">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-.025em]">
                  Recent activity
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  A pulse from the workspace.
                </p>
              </div>

              <span className="font-mono text-[9px] uppercase tracking-[.14em] text-accent-foreground/60">
                Live
              </span>
            </div>

            {activityQuery.isLoading ? (
              <div
                data-testid="loading-activity"
                className="space-y-5 rounded-xl border border-border/70 bg-card/50 p-5"
              >
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="flex animate-pulse gap-3">
                    <div className="h-7 w-7 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-2 w-4/5 rounded bg-muted" />
                      <div className="h-2 w-1/3 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityQuery.isError ? (
              <div
                data-testid="error-activity"
                className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground"
              >
                Activity is taking a breather.

                <button
                  type="button"
                  data-testid="button-retry-activity"
                  onClick={() => activityQuery.refetch()}
                  className="mt-2 block font-semibold text-accent-foreground hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div
                data-testid="activity-list"
                className="divide-y divide-border/70 rounded-xl border border-border/75 bg-card/55 px-4"
              >
                {(activityQuery.data ?? [])
                  .slice(0, 7)
                  .map((event) => (
                    <div
                      key={event.id}
                      data-testid={`activity-event-${event.id}`}
                      className="flex gap-3 py-4"
                    >
                      <div className="relative mt-0.5">
                        <Avatar
                          initials={event.actor.initials}
                          color={event.actor.color}
                          size="sm"
                          label={event.actor.name}
                        />

                        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-card bg-secondary text-primary">
                          <ActivityIcon type={event.type} />
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 text-xs leading-5">
                        <p>
                          <strong className="font-semibold">
                            {event.actor.name}
                          </strong>{" "}
                          <span className="text-muted-foreground">
                            {event.type === "created"
                              ? "created"
                              : event.type === "joined"
                                ? "joined"
                                : event.type === "saved"
                                  ? "saved"
                                  : "edited"}{" "}
                          </span>
                          <strong className="font-semibold">
                            {event.documentName}
                          </strong>
                        </p>

                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/75">
                          {timeAgo(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        pending={createDocument.isPending}
      />
    </WorkspaceShell>
  );
}