<script setup lang="ts">
import { dashboardUrl } from '../api';
import type { ServerSummary } from '../types';

defineProps<{
  manageableServers: ServerSummary[];
  otherServers: ServerSummary[];
  loading: boolean;
}>();

const emit = defineEmits<{
  selectServer: [guildId: string];
  refresh: [];
}>();

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function inviteUrl(guildId: string): string {
  return dashboardUrl(`/invite?guild_id=${encodeURIComponent(guildId)}`);
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h1 class="panel-title">Servers</h1>
      <button class="button secondary" type="button" :disabled="loading" @click="emit('refresh')">
        Refresh
      </button>
    </div>
    <div class="panel-body grid">
      <h2 class="panel-title">Your Servers</h2>
      <div class="grid server-grid">
        <a class="server-card clickable" :href="dashboardUrl('/invite')">
          <div class="server-icon">+</div>
          <div>
            <strong>Invite to your server</strong>
            <div class="muted">Add MyChamps Bot</div>
          </div>
        </a>

        <template v-for="server in manageableServers" :key="server.id">
          <button
            v-if="server.installed"
            class="server-card clickable"
            type="button"
            @click="emit('selectServer', server.id)"
          >
            <img
              v-if="server.iconUrl"
              class="server-icon"
              :src="server.iconUrl"
              :alt="server.name"
            />
            <div v-else class="server-icon">{{ initials(server.name) }}</div>
            <div>
              <strong>{{ server.name }}</strong>
              <div class="muted">Bot installed</div>
            </div>
          </button>
          <a v-else class="server-card clickable" :href="inviteUrl(server.id)">
            <img
              v-if="server.iconUrl"
              class="server-icon"
              :src="server.iconUrl"
              :alt="server.name"
            />
            <div v-else class="server-icon">{{ initials(server.name) }}</div>
            <div>
              <strong>{{ server.name }}</strong>
              <div class="muted">Invite required</div>
            </div>
          </a>
        </template>
      </div>

      <template v-if="otherServers.length > 0">
        <h2 class="panel-title">Other Servers</h2>
        <p class="muted">You are in these servers, but you do not have dashboard access.</p>
        <div class="grid server-grid">
          <div v-for="server in otherServers" :key="server.id" class="server-card">
            <img
              v-if="server.iconUrl"
              class="server-icon"
              :src="server.iconUrl"
              :alt="server.name"
            />
            <div v-else class="server-icon">{{ initials(server.name) }}</div>
            <div>
              <strong>{{ server.name }}</strong>
              <div class="muted">No permission</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
