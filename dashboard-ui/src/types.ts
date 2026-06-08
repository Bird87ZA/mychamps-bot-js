export interface DashboardUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ServerSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  installed: boolean;
  canManage: boolean;
  canEdit: boolean;
  category: 'manageable' | 'other';
}

export interface DiscordOption {
  id: string;
  name: string;
}

export interface DiscordRoleOption extends DiscordOption {
  color: string;
  position: number;
}

export interface SettingRecord {
  id: number;
  guildId: string;
  key: string;
  value: string;
  parsedValue?: number[];
}

export interface DashboardBootstrap {
  guild: {
    id: string;
    name: string;
    iconUrl: string | null;
    canManage: boolean;
    canEdit: boolean;
  };
  metadata: {
    roles: DiscordRoleOption[];
    channels: Array<DiscordOption & { type: number; parentId: string | null }>;
    textChannels: DiscordOption[];
    categories: DiscordOption[];
  };
  settings: SettingRecord[];
  schedules: DashboardRecord[];
  reminders: DashboardRecord[];
  attendance: DashboardRecord[];
  randomisers: DashboardRecord[];
  incidentButtons: DashboardRecord[];
  incidents: DashboardRecord[];
  accessRoles: DashboardRecord[];
  myChampsLeagues: DiscordOption[];
}

export type DashboardRecord = Record<string, unknown> & { id: number };

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'multiselect' | 'datetime';
  options?: FieldOption[];
  sourceKey?: string;
  placeholder?: string;
  required?: boolean;
}
