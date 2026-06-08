import type { Request } from 'express';

export const DISCORD_API_BASE_URL = 'https://discord.com/api/v10';
export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_TOKEN_URL = `${DISCORD_API_BASE_URL}/oauth2/token`;
export const DISCORD_USER_URL = `${DISCORD_API_BASE_URL}/users/@me`;
export const DISCORD_USER_GUILDS_URL = `${DISCORD_API_BASE_URL}/users/@me/guilds`;

const DEFAULT_BOT_PERMISSIONS = '268520528';

export function getDashboardPublicBaseUrl(req: Request, basePath: string): string {
  const configured = process.env.DASHBOARD_PUBLIC_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const protocol = req.headers['x-forwarded-proto']?.toString().split(',')[0] ?? req.protocol;
  const host = req.headers['x-forwarded-host']?.toString().split(',')[0] ?? req.get('host');

  return `${protocol}://${host}${basePath === '/' ? '' : basePath}`.replace(/\/+$/, '');
}

export function getDiscordClientId(): string {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;

  if (!clientId) {
    throw new Error('DISCORD_CLIENT_ID or DISCORD_OAUTH_CLIENT_ID is required.');
  }

  return clientId;
}

export function getDiscordClientSecret(): string {
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;

  if (!clientSecret) {
    throw new Error('DISCORD_OAUTH_CLIENT_SECRET is required for dashboard login.');
  }

  return clientSecret;
}

export function getDashboardSessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DASHBOARD_SESSION_SECRET is required in production.');
  }

  return 'mychamps-dashboard-dev-session-secret';
}

export function getBotInvitePermissions(): string {
  return process.env.DISCORD_BOT_PERMISSIONS?.trim() || DEFAULT_BOT_PERMISSIONS;
}

export function dashboardApiPath(basePath: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return basePath === '/' ? `/api${normalizedPath}` : `${basePath}/api${normalizedPath}`;
}
