import { getSetting } from '../utils/settings';

export const MYCHAMPS_API_BASE_URL = 'https://mychamps.gg';

export interface LinkResponse {
  message: string;
}

export interface StatsLeague {
  id: number;
  name: string;
  slug: string | null;
}

export interface DriverStats {
  entries: number;
  wins: number;
  podiums: number;
  poles: number;
  dnfs: number;
  fastest_laps: number;
}

export interface LeagueStats {
  id: number;
  name: string;
  stats: DriverStats;
}

export interface LinkedStatsResponse {
  leagues: LeagueStats[];
  combined: DriverStats;
}

export interface ChampionshipSummary {
  id: number;
  name: string;
  slug: string;
  team_name?: string;
  created_at?: string;
}

export interface IncidentData {
  championship_slug: string;
  reported_by_discord_id: string;
  description: string;
  evidence_url?: string;
  defendant_driver_ids: number[];
}

export interface VerdictData {
  verdict: string;
  penalty_value?: string;
  verdict_description: string;
}

export class MyChampsApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.trim().replace(/\/$/, '');
    this.token = token;
  }

  static async fromGuild(guildId: string): Promise<MyChampsApiClient> {
    const token = await getSetting(guildId, 'mychamps-api-token');

    if (!token) {
      throw new Error('mychamps-api-token is not configured for this guild.');
    }

    return new MyChampsApiClient(MYCHAMPS_API_BASE_URL, token);
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...(options?.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `MyChamps API error ${response.status} ${response.statusText}: ${body}`.trim(),
      );
    }

    return response.json() as Promise<T>;
  }

  async requestLink(email: string, discordUserId: string): Promise<LinkResponse> {
    return this.request<LinkResponse>('/api/discord/link', {
      method: 'POST',
      body: JSON.stringify({ email, discord_user_id: discordUserId }),
    });
  }

  async confirmLink(discordUserId: string, code: string): Promise<LinkResponse> {
    return this.request<LinkResponse>('/api/discord/confirm', {
      method: 'POST',
      body: JSON.stringify({ discord_user_id: discordUserId, code }),
    });
  }

  async getManagedStatsLeagues(discordUserId: string): Promise<StatsLeague[]> {
    const response = await this.request<{ teams: StatsLeague[] }>(
      `/api/discord/stats/leagues/${discordUserId}`,
    );

    return response.teams;
  }

  async getLinkedStats(discordUserId: string, teamIds: number[]): Promise<LinkedStatsResponse> {
    return this.request<LinkedStatsResponse>('/api/discord/stats', {
      method: 'POST',
      body: JSON.stringify({ discord_user_id: discordUserId, team_ids: teamIds }),
    });
  }

  async getChampionships(discordUserId: string): Promise<ChampionshipSummary[]> {
    return this.request<ChampionshipSummary[]>(`/api/discord/championships/${discordUserId}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createIncident(data: IncidentData): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<any>('/api/incidents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async submitVerdict(incidentId: number, data: VerdictData): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<any>(`/api/incidents/${incidentId}/verdict`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getCurrentRound(championshipSlug: string): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<any>(`/api/incidents/championship/${championshipSlug}/current-round`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getDrivers(championshipSlug: string): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<any[]>(`/api/incidents/championship/${championshipSlug}/drivers`);
  }
}
