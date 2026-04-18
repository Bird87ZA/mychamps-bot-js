import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSetting,
  setSetting,
  hasTimezone,
  guildsWithRemindersEnabled,
} from '../../src/utils/settings';
import { prisma } from '../../src/database';

const mockPrisma = vi.mocked(prisma);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('settings utils', () => {
  describe('getSetting', () => {
    it('returns value when setting exists', async () => {
      mockPrisma.setting.findFirst.mockResolvedValue({
        id: 1,
        guildId: '123',
        key: 'timezone',
        value: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getSetting('123', 'timezone');
      expect(result).toBe('UTC');
    });

    it('returns null when setting does not exist', async () => {
      mockPrisma.setting.findFirst.mockResolvedValue(null);

      const result = await getSetting('123', 'timezone');
      expect(result).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('upserts a setting value', async () => {
      mockPrisma.setting.findFirst.mockResolvedValue({
        id: 5,
        guildId: '123',
        key: 'timezone',
        value: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.setting.upsert.mockResolvedValue({} as never);

      await setSetting('123', 'timezone', 'Africa/Johannesburg');

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: 5 },
        create: { guildId: '123', key: 'timezone', value: 'Africa/Johannesburg' },
        update: { value: 'Africa/Johannesburg' },
      });
    });

    it('creates new setting when none exists', async () => {
      mockPrisma.setting.findFirst.mockResolvedValue(null);
      mockPrisma.setting.upsert.mockResolvedValue({} as never);

      await setSetting('123', 'timezone', 'UTC');

      expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
        where: { id: 0 },
        create: { guildId: '123', key: 'timezone', value: 'UTC' },
        update: { value: 'UTC' },
      });
    });
  });

  describe('hasTimezone', () => {
    it('returns true when timezone is set', async () => {
      mockPrisma.setting.findFirst.mockResolvedValue({
        id: 1,
        guildId: '123',
        key: 'timezone',
        value: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await hasTimezone('123');
      expect(result).toBe(true);
    });

    it('throws when timezone is not set', async () => {
      mockPrisma.setting.findFirst.mockResolvedValue(null);

      await expect(hasTimezone('123')).rejects.toThrow(
        'Please set a timezone first using `/settings timezone`.',
      );
    });
  });

  describe('guildsWithRemindersEnabled', () => {
    it('returns guild IDs with remind-attendees setting', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([
        {
          id: 1,
          guildId: '111',
          key: 'remind-attendees',
          value: '2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          guildId: '222',
          key: 'remind-attendees',
          value: '4',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await guildsWithRemindersEnabled();
      expect(result).toEqual(['111', '222']);
    });

    it('returns empty array when no guilds have reminders', async () => {
      mockPrisma.setting.findMany.mockResolvedValue([]);

      const result = await guildsWithRemindersEnabled();
      expect(result).toEqual([]);
    });
  });
});
