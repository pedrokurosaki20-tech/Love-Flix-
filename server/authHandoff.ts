import type { Express, Request, Response } from 'express';

interface HandoffEntry {
  confirmed: boolean;
  createdAt: number;
  confirmedAt?: number;
}

const handoffStore = new Map<string, HandoffEntry>();
const HANDOFF_TTL_MS = 30 * 60 * 1000;
const MAX_HANDOFF_ENTRIES = 5000;

function pruneHandoffStore(): void {
  const cutoff = Date.now() - HANDOFF_TTL_MS;
  for (const [token, entry] of handoffStore.entries()) {
    if (entry.createdAt < cutoff) {
      handoffStore.delete(token);
    }
  }
  if (handoffStore.size > MAX_HANDOFF_ENTRIES) {
    const excess = handoffStore.size - MAX_HANDOFF_ENTRIES;
    let removed = 0;
    for (const token of handoffStore.keys()) {
      handoffStore.delete(token);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

function normalizeToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim();
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(clean)) return null;
  return clean;
}

export function registerAuthHandoffRoutes(app: Express): void {
  app.post('/api/auth/confirm-handoff/complete', (req: Request, res: Response) => {
    const token = normalizeToken(req.body?.token);
    if (!token) {
      res.status(400).json({ ok: false, error: 'Token inválido.' });
      return;
    }

    pruneHandoffStore();
    const now = Date.now();
    const existing = handoffStore.get(token);
    handoffStore.set(token, {
      confirmed: true,
      createdAt: existing?.createdAt ?? now,
      confirmedAt: now,
    });

    res.json({ ok: true, confirmed: true });
  });

  app.get('/api/auth/confirm-handoff/status', (req: Request, res: Response) => {
    const token = normalizeToken(req.query.token);
    if (!token) {
      res.status(400).json({ ok: false, confirmed: false });
      return;
    }

    pruneHandoffStore();
    const entry = handoffStore.get(token);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.json({
      ok: true,
      confirmed: Boolean(entry?.confirmed),
    });
  });
}
