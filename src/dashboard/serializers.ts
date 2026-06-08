import { ChannelType, type Client, type Guild, type GuildBasedChannel } from 'discord.js';
import { getGuildIconUrl, getAvatarUrl } from './discordApi';
import { userCanManageGuild } from './permissions';
import type { DiscordGuildSummary, DiscordUser } from './types';

export function serializeBigInts(data: unknown): unknown {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  );
}

export function serializeUser(user: DiscordUser) {
  return {
    ...user,
    avatarUrl: getAvatarUrl(user),
    displayName: user.globalName ?? user.username,
  };
}

export function serializeServerList(
  guilds: DiscordGuildSummary[],
  client: Client | undefined,
  accessGuildIds: Set<string>,
) {
  const botGuilds = new Set(client?.guilds.cache.map((guild) => guild.id) ?? []);

  return guilds.map((guild) => {
    const installed = botGuilds.has(guild.id);
    const canManage = userCanManageGuild(guild);
    const canEdit = installed && (canManage || accessGuildIds.has(guild.id));

    return {
      id: guild.id,
      name: guild.name,
      iconUrl: getGuildIconUrl(guild),
      installed,
      canManage,
      canEdit,
      category: canManage || canEdit ? 'manageable' : 'other',
    };
  });
}

export async function serializeGuildMetadata(guild: Guild | null) {
  if (!guild) {
    return {
      roles: [],
      channels: [],
      textChannels: [],
      categories: [],
    };
  }

  const [roles, channels] = await Promise.all([
    guild.roles.fetch().catch(() => guild.roles.cache),
    guild.channels.fetch().catch(() => guild.channels.cache),
  ]);

  const serializedRoles = roles
    .filter((role) => !role.managed && role.name !== '@everyone')
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position,
    }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));

  const channelList: GuildBasedChannel[] = Array.from(channels.values()).filter(
    (channel): channel is GuildBasedChannel => Boolean(channel),
  );

  const serializedChannels = channelList
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: 'parentId' in channel ? channel.parentId : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    roles: serializedRoles,
    channels: serializedChannels,
    textChannels: serializedChannels.filter((channel) => channel.type === ChannelType.GuildText),
    categories: serializedChannels.filter((channel) => channel.type === ChannelType.GuildCategory),
  };
}

export function createDiscordNameResolver(
  metadata: Awaited<ReturnType<typeof serializeGuildMetadata>>,
) {
  const roles = new Map(metadata.roles.map((role) => [role.id, role.name]));
  const channels = new Map(metadata.channels.map((channel) => [channel.id, channel.name]));

  return {
    roleName(id: string | bigint | null | undefined): string {
      if (!id) {
        return '-';
      }

      const key = id.toString();
      return roles.get(key) ?? key;
    },
    channelName(id: string | bigint | null | undefined): string {
      if (!id) {
        return '-';
      }

      const key = id.toString();
      return channels.get(key) ?? key;
    },
  };
}

export function redactSetting<T extends { key: string; value: string | null }>(setting: T): T {
  if (!/(token|password|secret)/i.test(setting.key)) {
    return setting;
  }

  return {
    ...setting,
    value: setting.value ? '[redacted]' : setting.value,
  };
}
