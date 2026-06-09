<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import { apiRequest } from '../api';
import HelpTooltip from './HelpTooltip.vue';
import type { DashboardBootstrap } from '../types';

const props = defineProps<{
  bootstrap: DashboardBootstrap;
}>();

const emit = defineEmits<{ refresh: [] }>();

const status = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);
const form = reactive({
  timezone: '',
  myChampsApiToken: '',
  ticketAccessRoles: [] as string[],
  statsLeagueIds: [] as string[],
});

watch(
  () => props.bootstrap.settings,
  () => {
    const map = new Map(props.bootstrap.settings.map((setting) => [setting.key, setting]));
    form.timezone = map.get('timezone')?.value ?? '';
    form.myChampsApiToken = map.get('mychamps-api-token')?.value ?? '';
    form.ticketAccessRoles = parseArraySetting(map.get('ticket-access-roles')?.value);
    form.statsLeagueIds = (map.get('stats-league-ids')?.parsedValue ?? []).map(String);
  },
  { immediate: true },
);

async function save(): Promise<void> {
  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await apiRequest(`/servers/${props.bootstrap.guild.id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        settings: {
          timezone: form.timezone,
          'mychamps-api-token': form.myChampsApiToken,
          'ticket-access-roles': form.ticketAccessRoles,
          'stats-league-ids': form.statsLeagueIds,
        },
      }),
    });
    status.value = 'Settings saved.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

function parseArraySetting(value: string | undefined): string[] {
  if (!value || value === '[redacted]') {
    return [];
  }

  try {
    const decoded = JSON.parse(value) as unknown;
    return Array.isArray(decoded) ? decoded.map(String) : [];
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
</script>

<template>
  <form class="settings-layout" @submit.prevent="save">
    <div class="settings-toolbar">
      <div>
        <h2 class="section-title">Settings</h2>
        <p class="section-subtitle">Server-wide defaults used by the dashboard and bot commands.</p>
      </div>
      <button class="button" type="submit" :disabled="saving">Save settings</button>
    </div>

    <div v-if="status" class="status">{{ status }}</div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="settings-grid">
      <section class="panel settings-card">
        <div class="panel-header">
          <h3 class="panel-title">General</h3>
        </div>
        <div class="panel-body form-grid">
          <label class="field">
            <span class="label-row">
              <span class="label">Timezone</span>
              <HelpTooltip
                text="Used to convert schedule dates into UTC before the bot posts attendance and reminders."
              />
            </span>
            <input v-model="form.timezone" class="input" placeholder="Europe/Berlin" />
          </label>

          <label class="field full">
            <span class="label-row">
              <span class="label">MyChamps API token</span>
              <HelpTooltip
                text="Authorises this Discord server to read championship data and sync incident verdicts with MyChamps."
              />
            </span>
            <input v-model="form.myChampsApiToken" class="input" autocomplete="off" />
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Pull stats from</span>
              <HelpTooltip
                text="Controls which MyChamps leagues are included when users run the /stats command."
              />
            </span>
            <select v-model="form.statsLeagueIds" class="select" multiple>
              <option
                v-for="league in bootstrap.myChampsLeagues"
                :key="league.id"
                :value="league.id"
              >
                {{ league.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Ticket access roles</span>
              <HelpTooltip
                text="Fallback Discord roles that can view and respond in incident ticket channels when a button has no roles set."
              />
            </span>
            <select v-model="form.ticketAccessRoles" class="select" multiple>
              <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
          </label>
        </div>
      </section>
    </div>
  </form>
</template>
