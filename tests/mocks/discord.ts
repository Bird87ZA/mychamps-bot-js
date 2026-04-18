import { vi } from 'vitest';

export function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: '123456789',
    channelId: '987654321',
    guild: { name: 'Test Guild', iconURL: () => 'https://icon.url' },
    member: {
      user: { id: 'user1', username: 'testuser', globalName: 'Test User' },
      nickname: null,
      roles: {
        cache: new Map(),
      },
    },
    message: { id: '111222333' },
    replied: false,
    deferred: false,
    customId: '',
    options: {
      getSubcommand: vi.fn(),
      getString: vi.fn(),
      getInteger: vi.fn(),
      getBoolean: vi.fn(),
      getRole: vi.fn(),
    },
    reply: vi.fn(),
    followUp: vi.fn(),
    update: vi.fn(),
    isChatInputCommand: vi.fn(() => true),
    isButton: vi.fn(() => false),
    ...overrides,
  };
}

export function createMockClient() {
  return {
    guilds: {
      cache: new Map([
        [
          '123456789',
          {
            iconURL: () => 'https://icon.url',
            members: {
              fetch: vi.fn(),
              cache: new Map(),
            },
          },
        ],
      ]),
    },
    channels: {
      fetch: vi.fn(),
    },
  };
}
