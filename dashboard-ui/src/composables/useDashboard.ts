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
  const manageableServers = computed(() =>
    servers.value.filter((server) => server.canManage || server.canEdit),
  );
  const installedManageableServers = computed(() =>
    manageableServers.value.filter((server) => server.installed),
  );
  const otherServers = computed(() => servers.value.filter((server) => !server.canEdit));
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

    if (!selectedGuildId.value && installedManageableServers.value.length > 0) {
      await selectServer(installedManageableServers.value[0].id);
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
    manageableServers,
    otherServers,
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
