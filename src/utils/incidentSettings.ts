import { getSetting } from './settings';

export const INCIDENTS_CATEGORY_SETTING_KEY = 'incidents-category';
export const LEGACY_INCIDENT_CATEGORY_SETTING_KEY = 'incident-category';
export const TICKET_ACCESS_ROLES_SETTING_KEY = 'ticket-access-roles';
export const LEGACY_STEWARD_ROLE_SETTING_KEY = 'steward-role';

export function parseSettingIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean);
    }

    if (typeof parsed === 'string') {
      return parsed.trim() ? [parsed.trim()] : [];
    }
  } catch {
    // Legacy settings were stored as raw Discord IDs, not JSON.
  }

  return [trimmed];
}

export async function getIncidentsCategoryId(guildId: string): Promise<string | null> {
  const categoryId =
    (await getSetting(guildId, INCIDENTS_CATEGORY_SETTING_KEY)) ??
    (await getSetting(guildId, LEGACY_INCIDENT_CATEGORY_SETTING_KEY));

  return categoryId?.trim() || null;
}

export async function getTicketAccessRoleIds(guildId: string): Promise<string[]> {
  const roleSetting = await getSetting(guildId, TICKET_ACCESS_ROLES_SETTING_KEY);

  if (roleSetting !== null) {
    return parseSettingIds(roleSetting);
  }

  return parseSettingIds(await getSetting(guildId, LEGACY_STEWARD_ROLE_SETTING_KEY));
}

export function formatRoleMentions(roleIds: string[], fallback = 'Ticket access roles'): string {
  return roleIds.length > 0 ? roleIds.map((roleId) => `<@&${roleId}>`).join(' ') : fallback;
}
