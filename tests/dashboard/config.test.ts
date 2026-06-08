import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBotInvitePermissions,
  getDashboardSessionSecret,
  getDiscordClientId,
  getDiscordClientSecret,
} from '../../src/dashboard/config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dashboard config', () => {
  it('falls back to DISCORD_CLIENT_ID when DISCORD_OAUTH_CLIENT_ID is blank', () => {
    vi.stubEnv('DISCORD_OAUTH_CLIENT_ID', '');
    vi.stubEnv('DISCORD_CLIENT_ID', '123456789');

    expect(getDiscordClientId()).toBe('123456789');
  });

  it('prefers a non-empty dashboard OAuth client ID', () => {
    vi.stubEnv('DISCORD_OAUTH_CLIENT_ID', ' 987654321 ');
    vi.stubEnv('DISCORD_CLIENT_ID', '123456789');

    expect(getDiscordClientId()).toBe('987654321');
  });

  it('trims the Discord OAuth client secret', () => {
    vi.stubEnv('DISCORD_OAUTH_CLIENT_SECRET', ' secret ');

    expect(getDiscordClientSecret()).toBe('secret');
  });

  it('uses the default bot permissions when the env var is blank', () => {
    vi.stubEnv('DISCORD_BOT_PERMISSIONS', '');

    expect(getBotInvitePermissions()).toBe('268520528');
  });

  it('requires a configured session secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DASHBOARD_SESSION_SECRET', '');

    expect(() => getDashboardSessionSecret()).toThrow('DASHBOARD_SESSION_SECRET is required');
  });
});
