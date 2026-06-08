import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { prisma } from '../../src/database';
import { createApiRouter } from '../../src/dashboard/api';

vi.mock('../../src/services/myChampsApiClient', () => ({
  MyChampsApiClient: {
    fromGuild: vi.fn(async () => ({
      getManagedStatsLeagues: vi.fn(async () => []),
      submitVerdict: vi.fn(),
    })),
  },
}));

vi.mock('../../src/utils/reminders', () => ({
  rebuildReminders: vi.fn(async () => undefined),
}));

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.setting.findMany.mockResolvedValue([]);
  mockPrisma.schedule.findMany.mockResolvedValue([]);
  mockPrisma.reminder.findMany.mockResolvedValue([]);
  mockPrisma.attendance.findMany.mockResolvedValue([]);
  mockPrisma.randomiser.findMany.mockResolvedValue([]);
  mockPrisma.incidentButton.findMany.mockResolvedValue([]);
  mockPrisma.incident.findMany.mockResolvedValue([]);
  mockPrisma.dashboardAccessRole.findMany.mockResolvedValue([]);
});

describe('Dashboard API', () => {
  it('reports anonymous users without requiring a dashboard session', async () => {
    const res = await request(createApp()).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: false, user: null });
  });

  it('requires a dashboard session for server routes', async () => {
    const res = await request(createApp()).get('/api/servers');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns the user servers from the Discord OAuth session', async () => {
    const res = await request(createApp(authenticatedSession(), installedClient())).get(
      '/api/servers',
    );

    expect(res.status).toBe(200);
    expect(res.body.servers).toEqual([
      expect.objectContaining({
        id: '123',
        name: 'Test Guild',
        installed: true,
        canManage: true,
        canEdit: true,
      }),
    ]);
  });

  it('returns guild bootstrap data with redacted secrets and readable counts', async () => {
    mockPrisma.setting.findMany.mockResolvedValue([
      setting('mychamps-api-token', 'secret-token'),
      setting('timezone', 'UTC'),
    ]);
    mockPrisma.schedule.findMany.mockResolvedValue([
      {
        id: 10,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: null,
        guildName: 'Test Guild',
        name: 'Race',
        date: new Date('2099-01-01T18:00:00Z'),
        dateUtc: new Date('2099-01-01T18:00:00Z'),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: false,
        attendees: {},
        closed: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    mockPrisma.reminder.findMany.mockResolvedValue([
      {
        id: 1,
        scheduleId: '10',
        remindAt: new Date('2098-12-31T18:00:00Z'),
        reminded: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const res = await request(createApp(authenticatedSession())).get('/api/servers/123/bootstrap');

    expect(res.status).toBe(200);
    expect(res.body.guild).toEqual(expect.objectContaining({ id: '123', canEdit: true }));
    expect(res.body.settings).toEqual([
      expect.objectContaining({ key: 'mychamps-api-token', value: '[redacted]' }),
      expect.objectContaining({ key: 'timezone', value: 'UTC' }),
    ]);
    expect(res.body.schedules[0]).toEqual(
      expect.objectContaining({
        name: 'Race',
        reminderCount: 1,
        postTimeDaysBefore: '6',
      }),
    );
    expect(res.body.reminders[0]).toEqual(expect.objectContaining({ scheduleName: 'Race' }));
  });

  it('deletes schedule reminders before deleting the schedule', async () => {
    mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.schedule.delete.mockResolvedValue({} as never);

    const res = await request(createApp(authenticatedSession())).delete(
      '/api/servers/123/schedules/10',
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.reminder.deleteMany).toHaveBeenCalledWith({
      where: { scheduleId: '10' },
    });
    expect(mockPrisma.schedule.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('deletes blank settings instead of storing empty strings', async () => {
    mockPrisma.setting.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(createApp(authenticatedSession()))
      .put('/api/servers/123/settings')
      .send({ settings: { 'post-time': '' } });

    expect(res.status).toBe(200);
    expect(mockPrisma.setting.deleteMany).toHaveBeenCalledWith({
      where: { guildId: '123', key: 'post-time' },
    });
    expect(mockPrisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('stores dashboard access roles for users with Manage Server access', async () => {
    mockPrisma.dashboardAccessRole.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.dashboardAccessRole.createMany.mockResolvedValue({ count: 2 });

    const res = await request(createApp(authenticatedSession()))
      .put('/api/servers/123/access-roles')
      .send({ roleIds: ['111', '222'] });

    expect(res.status).toBe(200);
    expect(mockPrisma.dashboardAccessRole.deleteMany).toHaveBeenCalledWith({
      where: { guildId: '123' },
    });
    expect(mockPrisma.dashboardAccessRole.createMany).toHaveBeenCalledWith({
      data: [
        { guildId: '123', roleId: '111' },
        { guildId: '123', roleId: '222' },
      ],
      skipDuplicates: true,
    });
  });
});

function createApp(session: Record<string, unknown> = {}, client?: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = session as Request['session'];
    next();
  });
  app.use('/api', createApiRouter({ client: client as never }));
  return app;
}

function installedClient() {
  return {
    guilds: {
      cache: {
        map: (mapper: (guild: { id: string }) => string) => [{ id: '123' }].map(mapper),
      },
    },
  };
}

function authenticatedSession() {
  return {
    dashboard: {
      accessToken: 'discord-token',
      user: {
        id: '42',
        username: 'tester',
        discriminator: '0',
        avatar: null,
        globalName: 'Tester',
      },
      guilds: [
        {
          id: '123',
          name: 'Test Guild',
          icon: null,
          owner: true,
          permissions: '0',
        },
      ],
    },
  };
}

function setting(key: string, value: string) {
  return {
    id: Math.floor(Math.random() * 10000),
    guildId: '123',
    key,
    value,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}
