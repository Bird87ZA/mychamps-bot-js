import type { Client } from 'discord.js';

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions: string;
}

export interface DashboardSessionData {
  state?: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  user?: DiscordUser;
  guilds?: DiscordGuildSummary[];
}

export interface DashboardContext {
  client?: Client;
  basePath: string;
}

export interface DashboardGuildContext {
  guildId: string;
  canManage: boolean;
  canEdit: boolean;
}

declare module 'express-session' {
  interface SessionData {
    dashboard?: DashboardSessionData;
  }
}
