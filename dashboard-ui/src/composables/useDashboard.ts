import { computed, shallowRef } from 'vue';
import {
  dashboardUrl,
  fetchBootstrap,
  fetchMe,
  fetchServers,
  logout as logoutRequest,
} from '../api';
import type { DashboardBootstrap, DashboardUser, ServerSummary } from '../types';

export function useDashboard() {
  const loading = shallowRef(true);
  const error = shallowRef('');
  const user = shallowRef<DashboardUser | null>(null);
  const servers = shallowRef<ServerSummary[]>([]);
  const selectedGuildId = shallowRef(initialGuildId());
  const bootstrap = shallowRef<DashboardBootstrap | null>(null);

  const authenticated = computed(() => Boolean(user.value));
  const botInstalledServers = computed(() =>
    servers.value.filter((server) => server.installed && (server.canManage || server.canEdit)),
  );
  const inviteRequiredServers = computed(() =>
    servers.value.filter((server) => !server.installed && server.canManage),
  );
  const selectedServer = computed(
    () => servers.value.find((server) => server.id === selectedGuildId.value) ?? null,
  );

  async function initialize(): Promise<void> {
    loading.value = true;
    error.value = '';

    try {
      const me = await fetchMe();
      user.value = me.user;

      if (me.authenticated) {
        await loadServers();
      }
    } catch (caught) {
      error.value = messageFromError(caught);
    } finally {
      loading.value = false;
    }
  }

  async function loadServers(): Promise<void> {
    const response = await fetchServers();
    servers.value = response.servers;

    if (!selectedGuildId.value && botInstalledServers.value.length > 0) {
      await selectServer(botInstalledServers.value[0].id);
      return;
    }

    if (selectedGuildId.value) {
      await loadBootstrap();
    }
  }

  async function selectServer(guildId: string): Promise<void> {
    selectedGuildId.value = guildId;
    history.pushState({}, '', dashboardUrl(`/servers/${guildId}`));
    await loadBootstrap();
  }

  async function loadBootstrap(): Promise<void> {
    if (!selectedGuildId.value) {
      bootstrap.value = null;
      return;
    }

    loading.value = true;
    error.value = '';

    try {
      bootstrap.value = await fetchBootstrap(selectedGuildId.value);
    } catch (caught) {
      bootstrap.value = null;
      error.value = messageFromError(caught);
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    await logoutRequest();
    user.value = null;
    servers.value = [];
    selectedGuildId.value = '';
    bootstrap.value = null;
    history.pushState({}, '', dashboardUrl('/'));
  }

  return {
    loading,
    error,
    user,
    authenticated,
    servers,
    botInstalledServers,
    inviteRequiredServers,
    selectedGuildId,
    selectedServer,
    bootstrap,
    initialize,
    loadServers,
    loadBootstrap,
    selectServer,
    logout,
  };
}

function initialGuildId(): string {
  return window.location.pathname.match(/\/servers\/([^/]+)/)?.[1] ?? '';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Dashboard request failed.');
}
