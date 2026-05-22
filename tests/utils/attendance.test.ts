import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isScheduleClosed, buildAttendanceMessage } from '../../src/utils/attendance';
import { prisma } from '../../src/database';
import { createMockClient } from '../mocks/discord';
import type { Schedule } from '@prisma/client';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    guildId: BigInt(123456789),
    channelId: BigInt(987654321),
    messageId: null,
    guildName: 'Test Guild',
    name: 'Test Event',
    date: new Date('2099-06-01T14:00:00'),
    dateUtc: new Date('2099-06-01T12:00:00Z'),
    closingDate: null,
    closingDateUtc: null,
    image: null,
    timeBefore: '-6',
    botPosted: false,
    attendees: {},
    closed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('attendance utils', () => {
  describe('isScheduleClosed', () => {
    it('returns true when schedule.closed is true', () => {
      const schedule = makeSchedule({ closed: true });
      expect(isScheduleClosed(schedule)).toBe(true);
    });

    it('returns true when closingDateUtc is in the past', () => {
      const schedule = makeSchedule({
        closingDateUtc: new Date('2020-01-01'),
      });
      expect(isScheduleClosed(schedule)).toBe(true);
    });

    it('returns true when dateUtc is in the past', () => {
      const schedule = makeSchedule({
        dateUtc: new Date('2020-01-01'),
      });
      expect(isScheduleClosed(schedule)).toBe(true);
    });

    it('returns false when schedule is open and dates are in the future', () => {
      const schedule = makeSchedule();
      expect(isScheduleClosed(schedule)).toBe(false);
    });

    it('returns false when closingDateUtc is in the future', () => {
      const schedule = makeSchedule({
        closingDateUtc: new Date('2099-12-31'),
      });
      expect(isScheduleClosed(schedule)).toBe(false);
    });
  });

  describe('buildAttendanceMessage', () => {
    it('builds message with buttons for open schedule', async () => {
      const schedule = makeSchedule();
      const client = createMockClient();

      mockPrisma.attendance.findFirst.mockResolvedValue({
        id: 1,
        guildId: BigInt(123456789),
        channelId: BigInt(987654321),
        fullTime: BigInt(111),
        reserve: BigInt(222),
        commentator: null,
        attendees: { 'Team A': {} },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await buildAttendanceMessage(
        schedule,
        client as unknown as import('discord.js').Client,
      );

      expect(result.embeds).toHaveLength(1);
      expect(result.components).toHaveLength(1); // Has buttons
    });

    it('builds message without buttons for closed schedule', async () => {
      const schedule = makeSchedule({ closed: true });
      const client = createMockClient();

      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      const result = await buildAttendanceMessage(
        schedule,
        client as unknown as import('discord.js').Client,
      );

      expect(result.embeds).toHaveLength(1);
      expect(result.components).toHaveLength(0); // No buttons
    });

    it('includes attendee names in fields', async () => {
      const schedule = makeSchedule({
        attendees: {
          'Team A': { user1: 'Alice', user2: 'Bob' },
          'Not Participating': { user3: 'Charlie' },
        },
      });
      const client = createMockClient();

      mockPrisma.attendance.findFirst.mockResolvedValue(null);

      const result = await buildAttendanceMessage(
        schedule,
        client as unknown as import('discord.js').Client,
      );

      const embed = result.embeds![0];
      expect(embed.data.fields).toBeDefined();
      expect(embed.data.fields).toHaveLength(2);
      expect(embed.data.fields![0].name).toBe('Team A');
      expect(embed.data.fields![0].value).toContain('Alice');
      expect(embed.data.fields![0].value).toContain('Bob');
    });

    it('falls back to attendance config when schedule has no attendees', async () => {
      const schedule = makeSchedule({ attendees: {} });
      const client = createMockClient();

      mockPrisma.attendance.findFirst.mockResolvedValue({
        id: 1,
        guildId: BigInt(123456789),
        channelId: BigInt(987654321),
        fullTime: BigInt(111),
        reserve: null,
        commentator: null,
        attendees: { 'Team X': { u1: 'Dan' } },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await buildAttendanceMessage(
        schedule,
        client as unknown as import('discord.js').Client,
      );

      const embed = result.embeds![0];
      expect(embed.data.fields).toBeDefined();
      expect(embed.data.fields![0].name).toBe('Team X');
    });

    it('keeps configured empty groups when schedule attendance is partial', async () => {
      const schedule = makeSchedule({
        attendees: {
          'Team A': { u1: 'Alice' },
        },
      });
      const client = createMockClient();

      mockPrisma.attendance.findFirst.mockResolvedValue({
        id: 1,
        guildId: BigInt(123456789),
        channelId: BigInt(987654321),
        fullTime: BigInt(111),
        reserve: null,
        commentator: null,
        attendees: {
          'Team A': {},
          'Team B': {},
          'Not Participating': {},
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await buildAttendanceMessage(
        schedule,
        client as unknown as import('discord.js').Client,
      );

      const embed = result.embeds![0];
      expect(embed.data.fields).toEqual([
        expect.objectContaining({ name: 'Team A', value: 'Alice' }),
        expect.objectContaining({ name: 'Team B', value: '-' }),
        expect.objectContaining({ name: 'Not Participating', value: '-' }),
      ]);
    });
  });
});
