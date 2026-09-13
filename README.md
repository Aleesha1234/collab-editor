# Collab Editor

Collab Editor is a self-contained full-stack collaborative document editor for local development. Multiple browser windows can open the same document, edit simultaneously, see presence and cursor updates, and persist documents to PostgreSQL.

This project is designed to run from a normal Windows machine in VS Code. It does not require any hosted development platform or platform-specific services.

## Key Features

- Real-time collaborative document editing with multiple users
- WebSocket-based live synchronization
- Last-Write-Wins (LWW) conflict resolution for concurrent edits
- Live user presence and active-user indicators
- Live remote cursor and selection updates
- Automatic document saving to PostgreSQL
- Document creation, listing, and persistence
- Activity feed for document collaboration
- Responsive React/Vite interface
- TypeScript-based frontend and backend

## 1. Prerequisites

Install these before opening the project:

- Windows 10 or Windows 11
- Node.js 20 LTS or newer
- pnpm 10 or newer
- PostgreSQL 14 or newer
- VS Code (recommended)

Enable pnpm with Corepack if it is not already installed:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

Confirm the tools:

```powershell
node --version
pnpm --version
psql --version
```

## 2. Installation

Extract the ZIP and open the extracted folder in VS Code. Run all commands below from the project root, the folder containing `pnpm-workspace.yaml`.

Install the workspace dependencies:

```powershell
pnpm install
```

The workspace lockfile includes the Windows-compatible optional packages used by Vite, including the Windows `lightningcss` package. Do not delete `pnpm-lock.yaml` unless you intentionally want to regenerate dependency resolution.

## 3. Environment variables

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and update `DATABASE_URL` if your PostgreSQL username, password, host, port, or database name differs:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/collab_editor
```

The backend loads `.env` automatically. The frontend uses port `5173` and the backend uses port `8080` by default. You can override either port in the terminal when needed:

```powershell
$env:PORT = "8081"
pnpm run dev:backend
```

Never commit `.env` or real credentials.

## 4. Database setup

Create the PostgreSQL database once. With PostgreSQL command-line tools available:

```powershell
createdb collab_editor
```

If `createdb` is not on your PATH, use pgAdmin or connect with `psql`:

```powershell
psql -U postgres
CREATE DATABASE collab_editor;
\q
```

Apply the Drizzle schema:

```powershell
pnpm run db:push
```

Insert the starter documents and activity records:

```powershell
pnpm run db:seed
```

The seed command is safe to run more than once.

## 5. Frontend run command

Start the Vite frontend:

```powershell
pnpm run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173).

The Vite server proxies `/api` and `/api/ws` to the backend at `http://localhost:8080`, so the browser and WebSocket connection use one local origin.

## 6. Backend/API/WebSocket run command

Open a second VS Code terminal and start the API/WebSocket server:

```powershell
pnpm run dev:backend
```

The backend listens at [http://localhost:8080](http://localhost:8080).

Useful endpoints:

- Health check: `http://localhost:8080/api/healthz`
- Documents: `http://localhost:8080/api/documents`
- WebSocket: `ws://localhost:8080/api/ws`

The backend build step runs automatically before the server starts.

## 7. Run and test the complete application

From the project root:

1. Install dependencies with `pnpm install`.
2. Create `.env`.
3. Create PostgreSQL database `collab_editor`.
4. Run `pnpm run db:push`.
5. Run `pnpm run db:seed`.
6. Start `pnpm run dev:backend` in one terminal.
7. Start `pnpm run dev:frontend` in another terminal.
8. Open `http://localhost:5173`.
9. Open the same document in two browser windows to verify live edits, presence, selections, and cursor updates.

Run the static checks:

```powershell
pnpm run typecheck
```

Build both applications:

```powershell
pnpm run build
```

Regenerate the API hooks and Zod schemas after editing `lib/api-spec/openapi.yaml`:

```powershell
pnpm --filter @workspace/api-spec run codegen
```

## Collaboration protocol

The browser sends a `join` handshake with a document ID and client identity. The server responds with a snapshot containing materialized text and stable character atoms.

Editing uses these WebSocket operations:

- `insert`: inserts characters after a stable atom ID
- `delete`: tombstones stable atom IDs
- `cursor`: publishes the current selection range

Each operation has a timestamp, client ID, and operation ID. The server compares these deterministically and broadcasts accepted operations to every other client in the room. This preserves concurrent inserts instead of replacing the entire document with one client's full payload.

### Conflict resolution

The editor uses a Last-Write-Wins (LWW) approach for concurrent operations. Each operation carries a timestamp, client ID, and unique operation ID. When concurrent operations are received, the server applies a deterministic ordering based on these values so that all connected clients converge toward the same document state.

This approach allows multiple users to type at the same time without locking the editor or replacing the entire document with another user's latest full-text payload.

## Project structure

```text
artifacts/
  api-server/       Express API and WebSocket server
  collab-editor/    React/Vite frontend
lib/
  api-spec/         OpenAPI document and code-generation config
  api-client-react/ Generated React Query client and types
  api-zod/          Generated server-side Zod validators
  db/               Drizzle schema, PostgreSQL client, and migrations config
scripts/            Database seed utility
```

`tsconfig.base.json` is at the project root and is referenced by every package using a relative path. The workspace package aliases such as `@workspace/db` are resolved by pnpm workspace links.

## Common troubleshooting

### `pnpm` is not recognized

Run:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
```

Restart the VS Code terminal afterward.

### `DATABASE_URL must be set`

Confirm that `.env` exists in the project root and contains a valid PostgreSQL URL. Make sure PostgreSQL is running and the database in the URL exists.

### `database "collab_editor" does not exist`

Create it with:

```powershell
createdb collab_editor
```

Then run `pnpm run db:push` and `pnpm run db:seed` again.

### Port 5173 or 8080 is already in use

Use a different port in the current terminal:

```powershell
$env:PORT = "5174"
pnpm run dev:frontend
```

If changing the backend port, update the Vite proxy target in `artifacts/collab-editor/vite.config.ts` to match.

### `Cannot find module 'lightningcss'`

From the project root, remove installed dependencies and reinstall with the checked-in lockfile:

```powershell
Remove-Item -Recurse -Force node_modules
pnpm install
```

Do not use `npm install` in this pnpm workspace.

### Workspace package or `tsconfig.base.json` cannot be found

Run commands from the project root, not from `artifacts/collab-editor` or `artifacts/api-server`. Confirm that these files exist:

```text
pnpm-workspace.yaml
tsconfig.base.json
lib/db/package.json
lib/api-client-react/package.json
```

Then run:

```powershell
pnpm install
pnpm run typecheck
```
## Demonstration Video

[Watch the Demonstration Video](https://drive.google.com/file/d/1jItpPBPZ7uy6CmTcjf_8oUd_d6gkioED/view?usp=sharing)
