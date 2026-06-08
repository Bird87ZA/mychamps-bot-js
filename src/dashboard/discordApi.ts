import crypto from 'crypto';
import type { Request } from 'express';
import {
  DISCORD_AUTHORIZE_URL,
  DISCORD_TOKEN_URL,
  DISCORD_USER_GUILDS_URL,
  DISCORD_USER_URL,
  getBotInvitePermissions,
  getDashboardPublicBaseUrl,
  getDiscordClientId,
  getDiscordClientSecret,
} from './config';
import type { DiscordGuildSummary, DiscordUser } from './types';

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface DiscordUserResponse {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export function createOAuthState(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function getAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) {
    return null;
  }

  const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}`;
}

export function getGuildIconUrl(guild: { id: string; icon: string | null }): string | null {
  if (!guild.icon) {
    return null;
  }

  const extension = guild.icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${extension}`;
}

export function buildLoginUrl(req: Request, basePath: string, state: string): string {
  const params = new URLSearchParams({
    client_id: getDiscordClientId(),
    redirect_uri: `${getDashboardPublicBaseUrl(req, basePath)}/auth/callback`,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });

  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

export function buildInviteUrl(req: Request, basePath: string, guildId?: string): string {
  const params = new URLSearchParams({
    client_id: getDiscordClientId(),
    permissions: getBotInvitePermissions(),
    redirect_uri: `${getDashboardPublicBaseUrl(req, basePath)}/invite/callback`,
    response_type: 'code',
    scope: 'bot applications.commands',
  });

  if (guildId) {
    params.set('guild_id', guildId);
    params.set('disable_guild_select', 'true');
  }

  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  req: Request,
  basePath: string,
  code: string,
): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${getDashboardPublicBaseUrl(req, basePath)}/auth/callback`,
  });

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${getDiscordClientId()}:${getDiscordClientSecret()}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`Discord token exchange failed (${response.status}). ${message}`.trim());
  }

  return (await response.json()) as DiscordTokenResponse;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(DISCORD_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord user fetch failed (${response.status}).`);
  }

  const user = (await response.json()) as DiscordUserResponse;

  return {
    id: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    avatar: user.avatar ?? null,
  };
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  const response = await fetch(DISCORD_USER_GUILDS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord guild fetch failed (${response.status}).`);
  }

  return (await response.json()) as DiscordGuildSummary[];
}

export function isDashboardSessionFresh(expiresAt: number | undefined): boolean {
  return Boolean(expiresAt && expiresAt > Date.now() + 30_000);
}
