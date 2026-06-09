import type { TextChannel } from 'discord.js';

export const INCIDENT_CHANNEL_LOCK_PERMISSIONS = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
} as const;

interface IncidentPermissionSource {
  defendants?: unknown;
  defenceSubmitted?: unknown;
}

export function getIncidentClosePermissionTargets(
  channel: TextChannel,
  everyoneRoleId: string,
  ticketAccessRoleIds: string[],
  incident: IncidentPermissionSource,
): string[] {
  return uniqueIds([
    everyoneRoleId,
    ...Array.from(channel.permissionOverwrites.cache?.keys() ?? []),
    ...ticketAccessRoleIds,
    ...parseStoredTargetIds(incident.defendants),
    ...parseStoredTargetIds(incident.defenceSubmitted),
  ]);
}

function parseStoredTargetIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(isPermissionTargetId);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;

      if (Array.isArray(parsed)) {
        return parseStoredTargetIds(parsed);
      }

      if (typeof parsed === 'string') {
        const parsedId = parsed.trim();
        return isPermissionTargetId(parsedId) ? [parsedId] : [];
      }
    } catch {
      // Legacy values may be stored as raw IDs rather than JSON.
    }

    return isPermissionTargetId(trimmed) ? [trimmed] : [];
  }

  return [];
}

function isPermissionTargetId(id: string): boolean {
  return id.length > 0 && !/\s/.test(id);
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}
