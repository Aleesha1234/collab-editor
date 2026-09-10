import {
  getGetDocumentQueryKey,
  useCreateDocument,
  useGetDocument,
  useUpdateDocument,
  type Document,
  type Person,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  FileText,
  MessageCircle,
  PanelRight,
  RotateCw,
  Save,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useLocation, useParams } from "wouter";
import { Avatar, WorkspaceShell } from "@/components/workspace-shell";

type Atom = {
  id: string;
  leftId: string | null;
  char: string;
  deleted: boolean;
};

type RoomUser = Person & {
  cursor?: { anchor: number; head: number };
};

type SocketMessage =
  | { type: "snapshot"; content: string; atoms: Atom[]; users: RoomUser[] }
  | { type: "ack"; content: string; atoms: Atom[] }
  | { type: "operations"; content: string; atoms: Atom[] }
  | { type: "presence"; users: RoomUser[] };

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function PresenceStack({ people }: { people: Person[] }) {
  return (
    <div className="flex items-center -space-x-2">
      {people.slice(0, 4).map((person) => (
        <Avatar
          key={person.id}
          initials={person.initials}
          color={person.color}
          size="sm"
          label={person.name}
        />
      ))}
      {people.length > 4 && (
        <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{people.length - 4}
        </span>
      )}
    </div>
  );
}

function getClientId() {
  const storageKey = "collab-editor-client-id";
  const existing = window.localStorage.getItem(storageKey);

  if (existing) return existing;

  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(storageKey, id);
  return id;
}

function getUser(): Person {
  return {
    id: getClientId(),
    name: "You",
    initials: "YO",
    color: "#e76f51",
  };
}

function makeOperations(
  previous: string,
  next: string,
  atoms: Atom[],
  clientId: string,
) {
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  ) {
    prefix += 1;
  }

  let previousEnd = previous.length;
  let nextEnd = next.length;
  while (
    previousEnd > prefix &&
    nextEnd > prefix &&
    previous[previousEnd - 1] === next[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const visibleAtoms = atoms.filter((atom) => !atom.deleted);
  const deletedIds = visibleAtoms
    .slice(prefix, previousEnd)
    .map((atom) => atom.id);
  const insertedText = next.slice(prefix, nextEnd);
  const opId =
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const operations: Array<Record<string, unknown>> = [];

  if (deletedIds.length > 0) {
    operations.push({
      action: "delete",
      ids: deletedIds,
      opId: `${opId}:delete`,
      timestamp: Date.now(),
    });
  }
  if (insertedText.length > 0) {
    const leftId = visibleAtoms[prefix - 1]?.id ?? null;
    operations.push({
      action: "insert",
      text: insertedText,
      ids: [...insertedText].map(
        (_, index) => `${clientId}:${opId}:${index}`,
      ),
      leftId,
      opId: `${opId}:insert`,
      timestamp: Date.now(),
    });
  }
  return operations;
}

function getCursorPosition(text: string, position: number) {
  const beforeCursor = text.slice(0, position);
  const lines = beforeCursor.split("\n");

  return {
    line: lines.length - 1,
    column: lines[lines.length - 1].length,
  };
}

function selectionColor(color: string, alpha = 0.22) {
  const match = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match) return `rgba(42, 157, 143, ${alpha})`;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function RemoteCaret({ person }: { person: RoomUser }) {
  return (
    <span
      className="remote-cursor-caret"
      style={{ borderColor: person.color }}
      aria-hidden="true"
    >
      <span
        className="remote-cursor-label"
        style={{ backgroundColor: person.color }}
      >
        {person.name}
      </span>
    </span>
  );
}

function RemoteCursorOverlay({
  content,
  people,
  mirrorRef,
}: {
  content: string;
  people: RoomUser[];
  mirrorRef: RefObject<HTMLDivElement | null>;
}) {
  const selections = people
    .map((person) => {
      const anchor = Math.max(
        0,
        Math.min(content.length, person.cursor?.anchor ?? 0),
      );
      const head = Math.max(
        0,
        Math.min(content.length, person.cursor?.head ?? 0),
      );
      return {
        person,
        start: Math.min(anchor, head),
        end: Math.max(anchor, head),
        head,
      };
    })
    .filter(({ person }) => person.cursor);

  const boundaries = new Set<number>([0, content.length]);
  const carets = new Map<number, RoomUser[]>();

  for (const selection of selections) {
    boundaries.add(selection.start);
    boundaries.add(selection.end);
    const atPosition = carets.get(selection.head) ?? [];
    atPosition.push(selection.person);
    carets.set(selection.head, atPosition);
  }

  const points = [...boundaries].sort((left, right) => left - right);

  return (
    <div
      ref={mirrorRef}
      className="paper-lines collab-textarea-mirror min-h-[560px] w-full resize-none border-0 bg-transparent pb-12 font-serif text-[21px] leading-[1.52] tracking-[-.012em] sm:text-[23px] md:text-[25px]"
      aria-hidden="true"
    >
      {points.slice(0, -1).map((start, index) => {
        const end = points[index + 1];
        const selectedBy = selections.find(
          (selection) => selection.start < end && selection.end > start,
        );
        const caretPeople = carets.get(start) ?? [];

        return (
          <Fragment key={`${start}-${end}`}>
            {caretPeople.map((person) => (
              <RemoteCaret key={`${person.id}-${start}`} person={person} />
            ))}
            <span
              style={
                selectedBy
                  ? {
                      backgroundColor: selectionColor(selectedBy.person.color),
                      borderRadius: "2px",
                    }
                  : undefined
              }
            >
              {content.slice(start, end)}
            </span>
          </Fragment>
        );
      })}
      {(carets.get(content.length) ?? []).map((person) => (
        <RemoteCaret key={`${person.id}-end`} person={person} />
      ))}
    </div>
  );
}

export default function Editor() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const documentQuery = useGetDocument(documentId, {
    query: {
      enabled: Boolean(documentId),
      queryKey: getGetDocumentQueryKey(documentId),
    },
  });
  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [copied, setCopied] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<RoomUser[]>([]);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "offline"
  >("connecting");
  const initializedForId = useRef<string | null>(null);
  const lastSaved = useRef({ title: "", content: "" });
  const atomsRef = useRef<Atom[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const clientIdRef = useRef<string>("");
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const mutateRef = useRef(updateDocument.mutate);
  mutateRef.current = updateDocument.mutate;

  useEffect(() => {
    clientIdRef.current = getClientId();
  }, []);

  const handleSocketMessage = useCallback((message: SocketMessage) => {
    if (message.type === "presence") {
  setRoomUsers(message.users);
  setRemoteCursors(
    message.users.filter(
      (user) =>
        user.id !== clientIdRef.current &&
        user.cursor &&
        Number.isInteger(user.cursor.anchor) &&
        Number.isInteger(user.cursor.head),
    ),
  );
  return;
}
    if ("atoms" in message) atomsRef.current = message.atoms;
    if ("content" in message) setContent(message.content);
    if ("users" in message) setRoomUsers(message.users);
  }, []);

  useEffect(() => {
    const doc = documentQuery.data as Document | undefined;
    if (doc && initializedForId.current !== documentId) {
      initializedForId.current = documentId;
      setTitle(doc.name);
      setContent(doc.content);
      lastSaved.current = { title: doc.name, content: doc.content };
      atomsRef.current = [...doc.content].map((char, index) => ({
        id: `seed:${index}`,
        leftId: index > 0 ? `seed:${index - 1}` : null,
        char,
        deleted: false,
      }));
      setSaveState("saved");
    }
  }, [documentQuery.data, documentId]);

  useEffect(() => {
    if (!documentId) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnection("connecting");
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(
        `${protocol}://${window.location.host}/api/ws`,
      );
      socketRef.current = socket;
      socket.onopen = () => {
        setConnection("connected");
        socket.send(
          JSON.stringify({
            type: "join",
            documentId,
            clientId: clientIdRef.current || getClientId(),
            user: getUser(),
          }),
        );
      };
      socket.onmessage = (event) => {
        try {
          handleSocketMessage(JSON.parse(event.data) as SocketMessage);
        } catch {
          setConnection("offline");
        }
      };
      socket.onerror = () => setConnection("offline");
      socket.onclose = () => {
        socketRef.current = null;
        if (!disposed) {
          setConnection("offline");
          reconnectTimer.current = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [documentId, handleSocketMessage]);

  useEffect(() => {
    if (!documentId || initializedForId.current !== documentId) return;
    if (title === lastSaved.current.title && content === lastSaved.current.content)
      return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      mutateRef.current(
        { documentId, data: { name: title, content } },
        {
          onSuccess: (updated) => {
            lastSaved.current = { title, content };
            setSaveState("saved");
            queryClient.setQueryData(getGetDocumentQueryKey(documentId), updated);
          },
          onError: () => setSaveState("error"),
        },
      );
    }, 850);
    return () => window.clearTimeout(timer);
  }, [title, content, documentId, queryClient]);

  const sendCursor = (anchor: number, head: number) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "cursor", cursor: { anchor, head } }));
    }
  };

  const changeContent = (next: string) => {
    const operations = makeOperations(
      content,
      next,
      atomsRef.current,
      clientIdRef.current || getClientId(),
    );
    setContent(next);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && operations.length > 0) {
      socket.send(JSON.stringify({ type: "edit", operations }));
    }
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const doc = documentQuery.data as Document | undefined;
  const collaborators = useMemo(
    () =>
      roomUsers.filter((person) => person.id !== clientIdRef.current).map(
        ({ cursor: _cursor, ...person }) => person,
      ),
    [roomUsers],
  );
  
  const cursorPeople = roomUsers.filter(
    (person) => person.id !== clientIdRef.current && person.cursor,
  );


  const allPeople = doc
    ? [
        doc.owner,
        ...collaborators.filter((person) => person.id !== doc.owner.id),
      ]
    : [];
  const createFromEditor = () =>
    createDocument.mutate(
      { data: { name: "Untitled document", content: "" } },
      { onSuccess: (newDocument) => setLocation(`/documents/${newDocument.id}`) },
    );

  return (
    <WorkspaceShell onNewDocument={createFromEditor}>
      {documentQuery.isLoading ? (
        <div
          data-testid="loading-editor"
          className="min-h-[100dvh] p-6 md:p-10"
        >
          <div className="mx-auto max-w-[950px] animate-pulse">
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="mt-14 h-12 w-2/3 rounded bg-muted" />
            <div className="mt-10 space-y-5">
              {[1, 2, 3, 4, 5].map((line) => (
                <div
                  key={line}
                  className={`h-3 rounded bg-muted ${
                    line % 2 ? "w-full" : "w-4/5"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      ) : documentQuery.isError || !doc ? (
        <div
          data-testid="error-editor"
          className="grid min-h-[100dvh] place-items-center p-6"
        >
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <WifiOff size={20} />
            </div>
            <h1 className="text-lg font-semibold">This room isn’t available.</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The document may have moved, or your connection may have wandered
              off.
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                data-testid="button-editor-back-error"
                onClick={() => setLocation("/")}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold"
              >
                Back to documents
              </button>
              <button
                type="button"
                data-testid="button-retry-editor"
                onClick={() => documentQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <RotateCw size={14} /> Retry
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`${focusMode ? "fixed inset-0 z-30 bg-background" : "min-h-[100dvh]"} flex flex-col`}
        >
          <header className="flex min-h-[68px] items-center justify-between gap-4 border-b border-border/75 bg-background/90 px-4 backdrop-blur md:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                data-testid="button-back-documents"
                onClick={() => setLocation("/")}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={17} />
              </button>
              <span className="hidden h-5 w-px bg-border sm:block" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="shrink-0 text-accent-foreground" />
                  <input
                    data-testid="input-editor-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={() => setTitle(title.trim() || doc.name)}
                    maxLength={120}
                    className="w-[150px] truncate border-0 bg-transparent p-0 text-sm font-semibold outline-none focus:ring-0 sm:w-[250px] md:w-[350px]"
                  />
                </div>
                <div className="mt-1 hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground sm:flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Private room <span className="text-border">/</span> Edited{" "}
                  {formatUpdated(doc.updatedAt)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="mr-1 lg:hidden">
                <PresenceStack people={allPeople} />
              </div>
              <div
                data-testid="status-save"
                className="mr-1 hidden items-center gap-1.5 px-2 text-[11px] text-muted-foreground sm:flex"
              >
                {saveState === "saving" ? (
                  <>
                    <Save size={13} className="animate-pulse" /> Saving
                  </>
                ) : saveState === "error" ? (
                  <>
                    <WifiOff size={13} className="text-destructive" /> Couldn’t
                    save
                  </>
                ) : (
                  <>
                    <Check size={14} className="text-accent-foreground" /> Saved
                  </>
                )}
              </div>
              <button
                type="button"
                data-testid="button-toggle-focus"
                onClick={() => setFocusMode(!focusMode)}
                className={`hidden rounded-lg p-2 hover:bg-muted md:block ${
                  focusMode ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
                title="Focus mode"
              >
                <Sparkles size={16} />
              </button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[850px] px-5 py-10 sm:px-10 md:py-16">
                <div className="mb-9 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">
                    <span className="text-accent-foreground">Draft</span>
                    <span className="text-border">·</span>
                    <span data-testid="text-word-count">
                      {content.trim()
                        ? `${content.trim().split(/\s+/).length} words`
                        : "Blank page"}
                    </span>
                  </div>
                  <div
                    data-testid="status-connection"
                    className="flex items-center gap-2 text-[11px] text-muted-foreground"
                  >
                    {connection === "connected" ? (
                      <Wifi size={13} className="text-accent-foreground" />
                    ) : (
                      <WifiOff size={13} className="text-muted-foreground" />
                    )}
                    {connection === "connected"
                      ? "Live room"
                      : connection === "connecting"
                        ? "Connecting"
                        : "Reconnecting"}
                  </div>
                </div>
               <div className="collab-textarea-stage">
  <RemoteCursorOverlay
    content={content}
    people={cursorPeople}
    mirrorRef={mirrorRef}
  />
  <textarea
    data-testid="textarea-document-content"
    value={content}
    onChange={(event) => changeContent(event.target.value)}
    onSelect={(event) =>
      sendCursor(
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
      )
    }
    onScroll={(event) => {
      const mirror = mirrorRef.current;
      if (mirror) {
        mirror.scrollTop = event.currentTarget.scrollTop;
        mirror.scrollLeft = event.currentTarget.scrollLeft;
      }
    }}
    placeholder="Begin anywhere…"
    className="collab-textarea-input paper-lines min-h-[560px] w-full resize-none border-0 bg-transparent pb-12 font-serif text-[21px] leading-[1.52] tracking-[-.012em] text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/45 focus:ring-0 sm:text-[23px] md:text-[25px]"
  />
</div>
                <div className="flex items-center justify-between border-t border-border/70 pt-5 text-[11px] text-muted-foreground">
                  <span>Autosave is on</span>
                  <span className="font-mono">
                    {content.length.toLocaleString()} characters
                  </span>
                </div>
              </div>
            </main>
            <aside
              className="hidden w-[235px] shrink-0 border-l border-border/75 bg-card/30 lg:block"
              >
              <div className="border-b border-border/70 px-5 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[.11em]">
                    In the room
                  </h2>
                  <button
                    type="button"
                    data-testid="button-collapse-presence"
                    onClick={() => {}}
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                  >
                    <PanelRight size={15} />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <PresenceStack people={allPeople} />
                  <span
                    data-testid="text-collaborator-count"
                    className="font-mono text-[10px] text-muted-foreground"
                  >
                    {allPeople.length}{" "}
                    {allPeople.length === 1 ? "person" : "people"}
                  </span>
                </div>
              </div>
              <div className="border-b border-border/70 px-5 py-5">
                <div className="mb-3 font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground">
                  Active now
                </div>
                <div className="space-y-3">
                  {allPeople.map((person, index) => (
                    <div
                      key={person.id}
                      data-testid={`presence-person-${person.id}`}
                      className="flex items-center gap-2.5"
                    >
                      <span className="relative">
                        <Avatar
                          initials={person.initials}
                          color={person.color}
                          size="sm"
                          label={person.name}
                        />
                        {index === 1 && (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-card bg-accent" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {person.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {index === 0
                            ? "Owner"
                            : index === 1
                              ? "Editing now"
                              : "In the room"}
                        </div>
                      </div>
                      {index === 1 && (
                        <span className="h-3 w-px bg-accent cursor-blink" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}