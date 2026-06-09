import type { DashboardBootstrap, DashboardUser, ServerSummary } from './types';

interface MeResponse {
  authenticated: boolean;
  user: DashboardUser | null;
}

interface ServersResponse {
  servers: ServerSummary[];
}

function dashboardBasePath(): string {
  const match = window.location.pathname.match(/^\/bot(?:\/|$)/);
  return match ? '/bot' : '';
}

export function dashboardUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${dashboardBasePath()}${normalized}`;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(dashboardUrl(`/api${normalized}`), {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    credentials: 'same-origin',
    ...options,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || `Dashboard request failed (${response.status}).`,
    );
  }

  return payload as T;
}

export function fetchMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/me');
}

export function fetchServers(): Promise<ServersResponse> {
  return apiRequest<ServersResponse>('/servers');
}

export function fetchBootstrap(guildId: string): Promise<DashboardBootstrap> {
  return apiRequest<DashboardBootstrap>(`/servers/${guildId}/bootstrap`);
}

export async function saveRecord(
  guildId: string,
  resource: string,
  payload: Record<string, unknown>,
  id?: number,
): Promise<void> {
  await apiRequest(`/servers/${guildId}/${resource}${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createAttendanceSchedule(
  guildId: string,
  payload: { attendance: Record<string, unknown>; schedule: Record<string, unknown> },
): Promise<void> {
  await apiRequest(`/servers/${guildId}/attendance-schedules`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteRecord(guildId: string, resource: string, id: number): Promise<void> {
  await apiRequest(`/servers/${guildId}/${resource}/${id}`, { method: 'DELETE' });
}

export async function logout(): Promise<void> {
  await fetch(dashboardUrl('/logout'), {
    method: 'POST',
    credentials: 'same-origin',
  });
}
