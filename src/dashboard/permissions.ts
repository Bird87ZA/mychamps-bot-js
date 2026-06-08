import { PermissionsBitField, type Client, type Guild } from 'discord.js';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../database';
import type { DashboardGuildContext, DiscordGuildSummary } from './types';

function hasPermission(guild: DiscordGuildSummary | undefined, flag: bigint): boolean {
  if (!guild) {
    return false;
  }

  const permissions = BigInt(guild.permissions);

  return (permissions & flag) === flag;
}

export function userCanManageGuild(guild: DiscordGuildSummary | undefined): boolean {
  return (
    Boolean(guild?.owner) ||
    hasPermission(guild, PermissionsBitField.Flags.Administrator) ||
    hasPermission(guild, PermissionsBitField.Flags.ManageGuild)
  );
}

export function getSessionGuild(req: Request, guildId: string): DiscordGuildSummary | undefined {
  return req.session.dashboard?.guilds?.find((guild) => guild.id === guildId);
}

export async function getGuild(client: Client | undefined, guildId: string): Promise<Guild | null> {
  if (!client?.isReady()) {
    return null;
  }

  return client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
}

export async function userHasAccessRole(
  client: Client | undefined,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const accessRoles = await prisma.dashboardAccessRole.findMany({ where: { guildId } });

  if (accessRoles.length === 0) {
    return false;
  }

  const guild = await getGuild(client, guildId);
  const member = await guild?.members.fetch(userId).catch(() => null);

  if (!member) {
    return false;
  }

  return accessRoles.some((role) => member.roles.cache.has(role.roleId));
}

export async function resolveGuildContext(
  req: Request,
  client: Client | undefined,
  guildId: string,
): Promise<DashboardGuildContext> {
  const sessionGuild = getSessionGuild(req, guildId);
  const canManage = userCanManageGuild(sessionGuild);
  const userId = req.session.dashboard?.user?.id;
  const guild = await getGuild(client, guildId);
  const installed = !client?.isReady() || Boolean(guild);
  const hasAccessRole = userId ? await userHasAccessRole(client, guildId, userId) : false;

  return {
    guildId,
    canManage,
    canEdit: installed && (canManage || hasAccessRole),
  };
}

export function requireDashboardSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.dashboard?.user || !req.session.dashboard.accessToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  next();
}

export function requireGuildEdit(client: Client | undefined) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const context = await resolveGuildContext(req, client, guildIdParam(req));

      if (!context.canEdit) {
        res.status(403).json({ error: 'You do not have access to manage this server.' });
        return;
      }

      res.locals.guildContext = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireGuildManage(client: Client | undefined) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const context = await resolveGuildContext(req, client, guildIdParam(req));

      if (!context.canManage) {
        res.status(403).json({ error: 'Discord Manage Server permission is required.' });
        return;
      }

      res.locals.guildContext = context;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function guildIdParam(req: Request): string {
  const value = req.params.guildId;

  if (!value || Array.isArray(value)) {
    throw new Error('Missing guildId.');
  }

  return value;
}
