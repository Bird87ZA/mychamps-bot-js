import { getSetting } from '../utils/settings';

export interface LinkResponse {
  message: string;
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
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  static async fromGuild(guildId: string): Promise<MyChampsApiClient> {
    const baseUrl = await getSetting(guildId, 'mychamps-api-url');
    const token = await getSetting(guildId, 'mychamps-api-token');

    if (!baseUrl) {
      throw new Error('mychamps-api-url is not configured for this guild.');
    }
    if (!token) {
      throw new Error('mychamps-api-token is not configured for this guild.');
    }

    return new MyChampsApiClient(baseUrl, token);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getChampionships(discordUserId: string): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.request<any[]>(`/api/discord/championships/${discordUserId}`);
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
