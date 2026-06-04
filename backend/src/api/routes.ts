import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { botEngine } from '../bot/engine.js';
import { sorareAuth } from '../sorare/auth.js';
import { targetsRepo, blacklistRepo, settingsRepo, actionLogsRepo } from '../db/repositories.js';
import { hasSorareCredentials } from '../utils/config.js';

/**
 * API REST consommee par le frontend.
 * Le frontend ne parle qu'a ce backend (proxy unique vers Sorare).
 * Les secrets (mdp, JWT, cle Starkware) ne sont JAMAIS exposes ici.
 */

export const router = Router();

// --- Helper de validation ---
function validate<T>(schema: z.ZodSchema<T>, body: unknown, res: Response): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation', details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

// ===========================================================================
//  Etat du bot & controle
// ===========================================================================
router.get('/state', (_req: Request, res: Response) => {
  res.json(botEngine.getState());
});

router.post('/bot/start', async (_req: Request, res: Response) => {
  await botEngine.start();
  res.json(botEngine.getState());
});

router.post('/bot/pause', (_req: Request, res: Response) => {
  botEngine.pause();
  res.json(botEngine.getState());
});

router.post('/bot/stop', (_req: Request, res: Response) => {
  botEngine.stop();
  res.json(botEngine.getState());
});

// Mode DEMO : injecte des donnees fictives pour visualiser le dashboard
// sans connexion Sorare (aucun appel reseau, aucune enchere reelle).
router.post('/demo/load', (_req: Request, res: Response) => {
  botEngine.loadDemoData();
  res.json(botEngine.getState());
});

// ===========================================================================
//  Authentification Sorare (sans exposer de secret)
// ===========================================================================
router.get('/auth/status', (_req: Request, res: Response) => {
  res.json({
    ...sorareAuth.getState(),
    hasCredentials: hasSorareCredentials(),
  });
});

router.post('/auth/signin', async (_req: Request, res: Response) => {
  const result = await sorareAuth.signIn();
  res.json({ ...result, state: sorareAuth.getState() });
});

// 2FA : le code OTP est transmis mais JAMAIS stocke
const OtpSchema = z.object({ otp: z.string().min(4).max(10) });
router.post('/auth/otp', async (req: Request, res: Response) => {
  const body = validate(OtpSchema, req.body, res);
  if (!body) return;
  const result = await sorareAuth.signInWithOtp(body.otp);
  res.json({ ...result, state: sorareAuth.getState() });
});

// ===========================================================================
//  Joueurs cibles
// ===========================================================================
router.get('/targets', (_req: Request, res: Response) => {
  res.json(targetsRepo.list());
});

const TargetCreateSchema = z.object({
  playerSlug: z.string().min(1),
  displayName: z.string().min(1),
  maxPriceCents: z.number().int().positive(),
  enabled: z.boolean().default(true),
});
router.post('/targets', (req: Request, res: Response) => {
  const body = validate(TargetCreateSchema, req.body, res);
  if (!body) return;
  try {
    const created = targetsRepo.create({
      playerSlug: body.playerSlug,
      displayName: body.displayName,
      maxPriceCents: body.maxPriceCents,
      enabled: body.enabled ?? true,
    });
    botEngine.triggerPoll();
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: 'Slug deja present ou invalide' });
  }
});

const TargetUpdateSchema = z.object({
  displayName: z.string().min(1).optional(),
  maxPriceCents: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});
router.patch('/targets/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = validate(TargetUpdateSchema, req.body, res);
  if (!body) return;
  const updated = targetsRepo.update(id, body);
  if (!updated) {
    res.status(404).json({ error: 'Introuvable' });
    return;
  }
  botEngine.triggerPoll();
  res.json(updated);
});

router.delete('/targets/:id', (req: Request, res: Response) => {
  const ok = targetsRepo.delete(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Introuvable' });
    return;
  }
  res.status(204).end();
});

// ===========================================================================
//  Blacklist
// ===========================================================================
router.get('/blacklist', (_req: Request, res: Response) => {
  res.json(blacklistRepo.list());
});

const BlacklistCreateSchema = z.object({
  userSlug: z.string().min(1),
  note: z.string().nullable().default(null),
});
router.post('/blacklist', (req: Request, res: Response) => {
  const body = validate(BlacklistCreateSchema, req.body, res);
  if (!body) return;
  try {
    const created = blacklistRepo.create({ userSlug: body.userSlug, note: body.note ?? null });
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: 'Slug deja blackliste' });
  }
});

router.delete('/blacklist/:id', (req: Request, res: Response) => {
  const ok = blacklistRepo.delete(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Introuvable' });
    return;
  }
  res.status(204).end();
});

// ===========================================================================
//  Parametres generaux
// ===========================================================================
router.get('/settings', (_req: Request, res: Response) => {
  res.json(settingsRepo.getAll());
});

const SettingsSchema = z.object({
  pollIntervalMs: z.number().int().min(3000).optional(),
  dryRun: z.boolean().optional(),
  bindingHost: z.string().optional(),
  bindingPort: z.number().int().positive().optional(),
});
router.patch('/settings', (req: Request, res: Response) => {
  const body = validate(SettingsSchema, req.body, res);
  if (!body) return;
  const updated = settingsRepo.update(body);
  botEngine.triggerPoll();
  res.json(updated);
});

// ===========================================================================
//  Historique des actions
// ===========================================================================
router.get('/history', (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const offset = req.query.offset ? Number(req.query.offset) : 0;
  const auctionId = typeof req.query.auctionId === 'string' ? req.query.auctionId : undefined;
  res.json({
    total: actionLogsRepo.count(),
    items: actionLogsRepo.list({ limit, offset, auctionId }),
  });
});
