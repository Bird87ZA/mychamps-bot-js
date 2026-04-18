import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MyChampsApiClient } from '../../src/services/myChampsApiClient';

vi.mock('../../src/utils/settings', () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from '../../src/utils/settings';

const BASE_URL = 'https://api.mychamps.example.com';
const TOKEN = 'test-bearer-token';

function mockFetchOk(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

function mockFetchError(status: number, statusText: string, body = '') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MyChampsApiClient', () => {
  describe('constructor', () => {
    it('trims trailing slash from baseUrl', () => {
      const client = new MyChampsApiClient(`${BASE_URL}/`, TOKEN);
      // Verify by making a request and checking the URL
      const fetchSpy = mockFetchOk({ message: 'ok' });
      vi.stubGlobal('fetch', fetchSpy);

      void client.requestLink('a@b.com', 'uid123');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/discord/link`,
        expect.anything(),
      );
    });
  });

  describe('fromGuild', () => {
    it('creates client from guild settings', async () => {
      vi.mocked(getSetting).mockImplementation(async (_guildId, key) => {
        if (key === 'mychamps-api-url') return BASE_URL;
        if (key === 'mychamps-api-token') return TOKEN;
        return null;
      });

      const client = await MyChampsApiClient.fromGuild('guild-123');

      expect(getSetting).toHaveBeenCalledWith('guild-123', 'mychamps-api-url');
      expect(getSetting).toHaveBeenCalledWith('guild-123', 'mychamps-api-token');
      expect(client).toBeInstanceOf(MyChampsApiClient);
    });

    it('throws when mychamps-api-url is not configured', async () => {
      vi.mocked(getSetting).mockImplementation(async (_guildId, key) => {
        if (key === 'mychamps-api-url') return null;
        if (key === 'mychamps-api-token') return TOKEN;
        return null;
      });

      await expect(MyChampsApiClient.fromGuild('guild-123')).rejects.toThrow(
        'mychamps-api-url is not configured',
      );
    });

    it('throws when mychamps-api-token is not configured', async () => {
      vi.mocked(getSetting).mockImplementation(async (_guildId, key) => {
        if (key === 'mychamps-api-url') return BASE_URL;
        if (key === 'mychamps-api-token') return null;
        return null;
      });

      await expect(MyChampsApiClient.fromGuild('guild-123')).rejects.toThrow(
        'mychamps-api-token is not configured',
      );
    });
  });

  describe('requestLink', () => {
    it('makes POST to /api/discord/link with correct body and auth header', async () => {
      const fetchSpy = mockFetchOk({ message: 'Link email sent.' });
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.requestLink('user@example.com', 'discord-uid-1');

      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/discord/link`, {
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', discord_user_id: 'discord-uid-1' }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
      });
      expect(result).toEqual({ message: 'Link email sent.' });
    });
  });

  describe('confirmLink', () => {
    it('makes POST to /api/discord/confirm with correct body and auth header', async () => {
      const fetchSpy = mockFetchOk({ message: 'Account linked.' });
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.confirmLink('discord-uid-1', '123456');

      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/discord/confirm`, {
        method: 'POST',
        body: JSON.stringify({ discord_user_id: 'discord-uid-1', code: '123456' }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
      });
      expect(result).toEqual({ message: 'Account linked.' });
    });
  });

  describe('getChampionships', () => {
    it('makes GET to /api/discord/championships/{discordUserId} with auth header', async () => {
      const championships = [{ id: 1, name: 'F1 League' }, { id: 2, name: 'GT League' }];
      const fetchSpy = mockFetchOk(championships);
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.getChampionships('discord-uid-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/discord/championships/discord-uid-1`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
      expect(result).toEqual(championships);
    });
  });

  describe('createIncident', () => {
    it('makes POST to /api/incidents with correct payload and auth header', async () => {
      const incidentPayload = {
        championship_slug: 'f1-league-2026',
        reported_by_discord_id: 'reporter-uid',
        description: 'Corner cut on lap 3',
        evidence_url: 'https://youtube.com/clip123',
        defendant_driver_ids: [42, 99],
      };
      const createdIncident = { id: 7, ...incidentPayload };
      const fetchSpy = mockFetchOk(createdIncident);
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.createIncident(incidentPayload);

      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/incidents`, {
        method: 'POST',
        body: JSON.stringify(incidentPayload),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
      });
      expect(result).toEqual(createdIncident);
    });

    it('creates incident without optional evidence_url', async () => {
      const incidentPayload = {
        championship_slug: 'f1-league-2026',
        reported_by_discord_id: 'reporter-uid',
        description: 'Collision on straight',
        defendant_driver_ids: [10],
      };
      const fetchSpy = mockFetchOk({ id: 8, ...incidentPayload });
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      await client.createIncident(incidentPayload);

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(callBody).not.toHaveProperty('evidence_url');
    });
  });

  describe('submitVerdict', () => {
    it('makes POST to /api/incidents/{id}/verdict with correct payload', async () => {
      const verdictData = {
        verdict: 'Guilty',
        penalty_value: '10s',
        verdict_description: 'Caused a collision',
      };
      const fetchSpy = mockFetchOk({ id: 7, ...verdictData });
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.submitVerdict(7, verdictData);

      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/api/incidents/7/verdict`, {
        method: 'POST',
        body: JSON.stringify(verdictData),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
      });
      expect(result).toEqual({ id: 7, ...verdictData });
    });

    it('submits verdict without optional penalty_value', async () => {
      const verdictData = {
        verdict: 'Not Guilty',
        verdict_description: 'No evidence of wrongdoing',
      };
      const fetchSpy = mockFetchOk({ id: 5, ...verdictData });
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      await client.submitVerdict(5, verdictData);

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(callBody).not.toHaveProperty('penalty_value');
    });
  });

  describe('getCurrentRound', () => {
    it('makes GET to /api/incidents/championship/{slug}/current-round with auth header', async () => {
      const round = { id: 3, name: 'Round 3 - Monaco', date: '2026-05-01' };
      const fetchSpy = mockFetchOk(round);
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.getCurrentRound('f1-league-2026');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/incidents/championship/f1-league-2026/current-round`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
      expect(result).toEqual(round);
    });
  });

  describe('getDrivers', () => {
    it('makes GET to /api/incidents/championship/{slug}/drivers with auth header', async () => {
      const drivers = [
        { id: 1, name: 'Max Verstappen' },
        { id: 2, name: 'Lewis Hamilton' },
      ];
      const fetchSpy = mockFetchOk(drivers);
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);
      const result = await client.getDrivers('f1-league-2026');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/api/incidents/championship/f1-league-2026/drivers`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
          }),
        }),
      );
      expect(result).toEqual(drivers);
    });
  });

  describe('error handling', () => {
    it('throws on 401 Unauthorized response', async () => {
      const fetchSpy = mockFetchError(401, 'Unauthorized', 'Invalid token');
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);

      await expect(client.requestLink('a@b.com', 'uid')).rejects.toThrow(
        'MyChamps API error 401 Unauthorized',
      );
    });

    it('throws on 404 Not Found response', async () => {
      const fetchSpy = mockFetchError(404, 'Not Found', 'Resource not found');
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);

      await expect(client.getChampionships('unknown-uid')).rejects.toThrow(
        'MyChamps API error 404 Not Found',
      );
    });

    it('throws on 422 Unprocessable Entity response', async () => {
      const fetchSpy = mockFetchError(422, 'Unprocessable Entity', 'Validation error');
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);

      await expect(client.createIncident({
        championship_slug: 'slug',
        reported_by_discord_id: 'uid',
        description: '',
        defendant_driver_ids: [],
      })).rejects.toThrow('MyChamps API error 422');
    });

    it('throws on 500 Internal Server Error response', async () => {
      const fetchSpy = mockFetchError(500, 'Internal Server Error');
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);

      await expect(client.getCurrentRound('some-slug')).rejects.toThrow(
        'MyChamps API error 500 Internal Server Error',
      );
    });

    it('throws on 503 Service Unavailable response', async () => {
      const fetchSpy = mockFetchError(503, 'Service Unavailable');
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, TOKEN);

      await expect(client.getDrivers('some-slug')).rejects.toThrow(
        'MyChamps API error 503 Service Unavailable',
      );
    });
  });

  describe('Authorization header', () => {
    it('sends Bearer token in all requests', async () => {
      const fetchSpy = mockFetchOk([]);
      vi.stubGlobal('fetch', fetchSpy);

      const client = new MyChampsApiClient(BASE_URL, 'my-secret-token');
      await client.getDrivers('some-slug');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        }),
      );
    });
  });
});
