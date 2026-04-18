import { Router, Request, Response } from 'express';
import { prisma } from '../database';

const router = Router();

function paramId(req: Request): number {
  const raw = req.params.id;
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

// ─── Schedules ───────────────────────────────────────────────────────────────

router.get('/schedules', async (_req: Request, res: Response) => {
  const schedules = await prisma.schedule.findMany({
    orderBy: { date: 'asc' },
  });
  // Attach reminder counts since there's no Prisma relation (schedule_id is a string in MySQL)
  const reminderCounts = await prisma.reminder.groupBy({
    by: ['scheduleId'],
    _count: true,
  });
  const countMap = new Map(reminderCounts.map((r) => [r.scheduleId, r._count]));
  const result = schedules.map((s) => ({
    ...s,
    reminderCount: countMap.get(s.id.toString()) ?? 0,
  }));
  res.json(serialize(result));
});

router.get('/schedules/:id', async (req: Request, res: Response) => {
  const schedule = await prisma.schedule.findUnique({
    where: { id: paramId(req) },
  });
  if (!schedule) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const reminders = await prisma.reminder.findMany({
    where: { scheduleId: schedule.id.toString() },
    orderBy: { remindAt: 'asc' },
  });
  res.json(serialize({ ...schedule, reminders }));
});

router.put('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const id = paramId(req);
    const { name, closed, botPosted } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (closed !== undefined) data.closed = closed;
    if (botPosted !== undefined) data.botPosted = botPosted;

    const schedule = await prisma.schedule.update({ where: { id }, data });
    res.json(serialize(schedule));
  } catch {
    res.status(400).json({ error: 'Update failed' });
  }
});

router.delete('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const id = paramId(req);
    await prisma.reminder.deleteMany({ where: { scheduleId: id.toString() } });
    await prisma.schedule.delete({ where: { id } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Delete failed' });
  }
});

// ─── Reminders ───────────────────────────────────────────────────────────────

router.get('/reminders', async (_req: Request, res: Response) => {
  const reminders = await prisma.reminder.findMany({
    orderBy: { remindAt: 'asc' },
  });
  // Attach schedule info manually since schedule_id is a string column
  const scheduleIds = [...new Set(reminders.map((r) => parseInt(r.scheduleId)))].filter(
    (id) => !isNaN(id),
  );
  const schedules = await prisma.schedule.findMany({
    where: { id: { in: scheduleIds } },
    select: { id: true, name: true, guildName: true },
  });
  const scheduleMap = new Map(schedules.map((s) => [s.id.toString(), s]));
  const result = reminders.map((r) => ({
    ...r,
    schedule: scheduleMap.get(r.scheduleId) ?? null,
  }));
  res.json(serialize(result));
});

router.delete('/reminders/:id', async (req: Request, res: Response) => {
  try {
    await prisma.reminder.delete({ where: { id: paramId(req) } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Delete failed' });
  }
});

// ─── Attendance ──────────────────────────────────────────────────────────────

router.get('/attendance', async (_req: Request, res: Response) => {
  const attendance = await prisma.attendance.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json(serialize(attendance));
});

router.delete('/attendance/:id', async (req: Request, res: Response) => {
  try {
    await prisma.attendance.delete({ where: { id: paramId(req) } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Delete failed' });
  }
});

// ─── Randomisers ─────────────────────────────────────────────────────────────

router.get('/randomisers', async (_req: Request, res: Response) => {
  const randomisers = await prisma.randomiser.findMany({
    orderBy: { postAt: 'asc' },
  });
  res.json(serialize(randomisers));
});

router.delete('/randomisers/:id', async (req: Request, res: Response) => {
  try {
    await prisma.randomiser.delete({ where: { id: paramId(req) } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Delete failed' });
  }
});

// ─── Settings ────────────────────────────────────────────────────────────────

router.get('/settings', async (_req: Request, res: Response) => {
  const settings = await prisma.setting.findMany({
    orderBy: [{ guildId: 'asc' }, { key: 'asc' }],
  });
  res.json(settings);
});

router.put('/settings/:id', async (req: Request, res: Response) => {
  try {
    const setting = await prisma.setting.update({
      where: { id: paramId(req) },
      data: { value: req.body.value },
    });
    res.json(setting);
  } catch {
    res.status(400).json({ error: 'Update failed' });
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  const [schedules, reminders, attendance, randomisers, settings] = await Promise.all([
    prisma.schedule.count(),
    prisma.reminder.count(),
    prisma.attendance.count(),
    prisma.randomiser.count(),
    prisma.setting.count(),
  ]);
  res.json({ schedules, reminders, attendance, randomisers, settings });
});

// BigInt serialization helper — converts BigInt fields to strings for JSON
function serialize(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  );
}

export { router as apiRouter };
