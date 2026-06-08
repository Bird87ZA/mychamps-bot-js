<script setup lang="ts">
import { reactive, shallowRef, watch } from 'vue';
import { apiRequest } from '../api';
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
  postTime: '',
  remindAttendees: '',
  incidentReminderInterval: '',
  myChampsApiToken: '',
  incidentsCategory: '',
  ticketAccessRoles: [] as string[],
  statsLeagueIds: [] as string[],
});

watch(
  () => props.bootstrap.settings,
  () => {
    const map = new Map(props.bootstrap.settings.map((setting) => [setting.key, setting]));
    form.timezone = map.get('timezone')?.value ?? '';
    form.postTime = map.get('post-time')?.value ?? '';
    form.remindAttendees = map.get('remind-attendees')?.value ?? '';
    form.incidentReminderInterval = map.get('incident-reminder-interval')?.value ?? '';
    form.myChampsApiToken = map.get('mychamps-api-token')?.value ?? '';
    form.incidentsCategory = map.get('incidents-category')?.value ?? '';
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
          'post-time': form.postTime,
          'remind-attendees': form.remindAttendees,
          'incident-reminder-interval': form.incidentReminderInterval,
          'mychamps-api-token': form.myChampsApiToken,
          'incidents-category': form.incidentsCategory,
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
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}
</script>

<template>
  <form class="panel" @submit.prevent="save">
    <div class="panel-header">
      <h2 class="panel-title">Settings</h2>
      <button class="button" type="submit" :disabled="saving">Save settings</button>
    </div>
    <div class="panel-body grid">
      <div v-if="status" class="status">{{ status }}</div>
      <div v-if="error" class="error">{{ error }}</div>
      <div class="form-grid">
        <label class="field">
          <span class="label">Timezone</span>
          <input v-model="form.timezone" class="input" placeholder="Europe/Berlin" />
        </label>
        <label class="field">
          <span class="label">Post time days before</span>
          <input v-model="form.postTime" class="input" type="number" min="0" />
        </label>
        <label class="field">
          <span class="label">Attendee reminder hours</span>
          <input v-model="form.remindAttendees" class="input" type="number" min="0" />
        </label>
        <label class="field">
          <span class="label">Incident reminder hours</span>
          <input v-model="form.incidentReminderInterval" class="input" type="number" min="0" />
        </label>
        <label class="field full">
          <span class="label">MyChamps API token</span>
          <input v-model="form.myChampsApiToken" class="input" />
        </label>
        <label class="field">
          <span class="label">Incidents category</span>
          <select v-model="form.incidentsCategory" class="select">
            <option value="">Disabled</option>
            <option
              v-for="category in bootstrap.metadata.categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select>
        </label>
        <label class="field">
          <span class="label">Stats leagues</span>
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
        <label class="field full">
          <span class="label">Ticket access roles</span>
          <select v-model="form.ticketAccessRoles" class="select" multiple>
            <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </label>
      </div>
    </div>
  </form>
</template>
