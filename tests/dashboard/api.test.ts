import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../../src/database';

// Must import after mocks are set up (setup.ts handles the mock)
import { apiRouter } from '../../src/dashboard/api';

const mockPrisma = vi.mocked(prisma);

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard API', () => {
  describe('GET /api/schedules', () => {
    it('returns schedules with reminder counts', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          id: 1,
          guildId: BigInt(123),
          channelId: BigInt(456),
          messageId: null,
          guildName: 'Test',
          name: 'Event',
          date: new Date('2099-01-01'),
          dateUtc: new Date('2099-01-01'),
          closingDate: null,
          closingDateUtc: null,
          image: null,
          timeBefore: '-6',
          botPosted: false,
          attendees: {},
          closed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.reminder.groupBy.mockResolvedValue([{ scheduleId: '1', _count: 3 }] as never);

      const res = await request(app).get('/api/schedules');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Event');
      expect(res.body[0].reminderCount).toBe(3);
    });
  });

  describe('GET /api/schedules/:id', () => {
    it('returns schedule with reminders', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: null,
        guildName: 'Test',
        name: 'Event',
        date: new Date('2099-01-01'),
        dateUtc: new Date('2099-01-01'),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: false,
        attendees: {},
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.reminder.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/schedules/1');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Event');
    });

    it('returns 404 when not found', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/schedules/999');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/schedules/:id', () => {
    it('updates schedule fields', async () => {
      mockPrisma.schedule.update.mockResolvedValue({
        id: 1,
        guildId: BigInt(123),
        channelId: BigInt(456),
        messageId: null,
        guildName: 'Test',
        name: 'Updated Event',
        date: new Date(),
        dateUtc: new Date(),
        closingDate: null,
        closingDateUtc: null,
        image: null,
        timeBefore: '-6',
        botPosted: false,
        attendees: {},
        closed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .put('/api/schedules/1')
        .send({ name: 'Updated Event', closed: true });

      expect(res.status).toBe(200);
      expect(mockPrisma.schedule.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { name: 'Updated Event', closed: true },
      });
    });

    it('returns 400 on error', async () => {
      mockPrisma.schedule.update.mockRejectedValue(new Error('Not found'));

      const res = await request(app).put('/api/schedules/999').send({ name: 'test' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/schedules/:id', () => {
    it('deletes schedule and its reminders', async () => {
      mockPrisma.reminder.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.schedule.delete.mockResolvedValue({} as never);

      const res = await request(app).delete('/api/schedules/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 on error', async () => {
      mockPrisma.reminder.deleteMany.mockRejectedValue(new Error('fail'));

      const res = await request(app).delete('/api/schedules/999');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/reminders', () => {
    it('returns reminders with schedule info', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([
        {
          id: 1,
          scheduleId: '10',
          remindAt: new Date('2099-01-01'),
          reminded: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 10, name: 'Event', guildName: 'Guild' } as never,
      ]);

      const res = await request(app).get('/api/reminders');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].schedule.name).toBe('Event');
    });
  });

  describe('DELETE /api/reminders/:id', () => {
    it('deletes a reminder', async () => {
      mockPrisma.reminder.delete.mockResolvedValue({} as never);

      const res = await request(app).delete('/api/reminders/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/attendance', () => {
    it('returns all attendance configs', async () => {
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          id: 1,
          guildId: BigInt(123),
          channelId: BigInt(456),
          fullTime: BigInt(111),
          reserve: null,
          commentator: null,
          attendees: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app).get('/api/attendance');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('DELETE /api/attendance/:id', () => {
    it('deletes attendance config', async () => {
      mockPrisma.attendance.delete.mockResolvedValue({} as never);

      const res = await request(app).delete('/api/attendance/1');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/randomisers', () => {
    it('returns all randomisers', async () => {
      mockPrisma.randomiser.findMany.mockResolvedValue([]);

      const res = await request(app).get('/api/randomisers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('DELETE /api/randomisers/:id', () => {
    it('deletes a randomiser', async () => {
      mockPrisma.randomiser.delete.mockResolvedValue({} as never);

      const res = await request(app).delete('/api/randomisers/1');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/settings', () => {
    it('returns all settings', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        {
          id: 1,
          guildId: '123',
          key: 'timezone',
          value: 'UTC',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('PUT /api/settings/:id', () => {
    it('updates setting value', async () => {
      mockPrisma.setting.update.mockResolvedValue({
        id: 1,
        guildId: '123',
        key: 'timezone',
        value: 'Africa/Johannesburg',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app).put('/api/settings/1').send({ value: 'Africa/Johannesburg' });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/stats', () => {
    it('returns entity counts', async () => {
      mockPrisma.schedule.count.mockResolvedValue(5);
      mockPrisma.reminder.count.mockResolvedValue(10);
      mockPrisma.attendance.count.mockResolvedValue(3);
      mockPrisma.randomiser.count.mockResolvedValue(2);
      mockPrisma.setting.count.mockResolvedValue(8);

      const res = await request(app).get('/api/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        schedules: 5,
        reminders: 10,
        attendance: 3,
        randomisers: 2,
        settings: 8,
      });
    });
  });
});
