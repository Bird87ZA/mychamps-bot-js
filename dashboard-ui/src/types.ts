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

export interface DiscordChannelOption extends DiscordOption {
  type: number;
  parentId: string | null;
}

export interface MyChampsChampionshipOption extends DiscordOption {
  slug: string;
  teamId?: number;
  teamName?: string;
  completed?: boolean;
  is_completed?: boolean;
  isCompleted?: boolean;
  status?: string;
  completed_at?: string | null;
  completedAt?: string | null;
  label: string;
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
    channels: DiscordChannelOption[];
    textChannels: DiscordChannelOption[];
    categories: DiscordChannelOption[];
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
  myChampsChampionships: MyChampsChampionshipOption[];
}

export type DashboardRecord = Record<string, unknown> & { id: number };

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'checkbox'
    | 'select'
    | 'multiselect'
    | 'datetime'
    | 'channel-select';
  options?: FieldOption[];
  sourceKey?: string;
  placeholder?: string;
  required?: boolean;
}
