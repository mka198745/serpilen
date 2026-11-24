/** Single-use, process-local backup tickets; only a hash of the issuing session is retained. */
import crypto from "node:crypto";

type Ticket = { name: string; userId: number; sessionHash: string; exp: number };
export const DOWNLOAD_TICKET_TTL_SECONDS = 30;
const TTL_MS = DOWNLOAD_TICKET_TTL_SECONDS * 1000;
const STORE_KEY = "__ipek_download_tickets_v2__";

function store(): Map<string, Ticket> {
  const g = globalThis as unknown as Record<string, Map<string, Ticket> | undefined>;
  if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, Ticket>();
  return g[STORE_KEY];
}
function gc(now: number) {
  for (const [key, value] of store()) if (value.exp <= now) store().delete(key);
}

export function issueDownloadTicket(name: string, userId: number, sessionHash: string): string {
  const now = Date.now();
  gc(now);
  if (store().size >= 1024) throw new Error("Too many pending tickets");
  const ticket = crypto.randomBytes(32).toString("hex");
  store().set(ticket, { name, userId, sessionHash, exp: now + TTL_MS });
  return ticket;
}

/** A valid ticket is consumed before the caller checks the current session or reads the file. */
export function consumeDownloadTicket(ticket: string, name: string): Omit<Ticket, "exp"> | null {
  if (!/^[a-f0-9]{64}$/.test(ticket)) return null;
  const now = Date.now();
  gc(now);
  const entry = store().get(ticket);
  if (!entry || entry.name !== name) return null;
  store().delete(ticket);
  return { name: entry.name, userId: entry.userId, sessionHash: entry.sessionHash };
}
