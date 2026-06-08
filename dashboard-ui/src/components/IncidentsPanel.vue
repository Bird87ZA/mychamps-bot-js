<script setup lang="ts">
import { reactive, shallowRef } from 'vue';
import { apiRequest } from '../api';
import { displayValue, formatDate } from '../format';
import type { DashboardBootstrap, DashboardRecord } from '../types';

const props = defineProps<{ bootstrap: DashboardBootstrap }>();
const emit = defineEmits<{ refresh: [] }>();

const selectedIncident = shallowRef<DashboardRecord | null>(null);
const status = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);
const form = reactive({
  verdict: 'NFA',
  penaltyValue: '',
  verdictDescription: '',
});

async function closeIncident(): Promise<void> {
  if (!selectedIncident.value) {
    return;
  }

  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    const response = await apiRequest<{ warning?: string }>(
      `/servers/${props.bootstrap.guild.id}/incidents/${selectedIncident.value.id}/close`,
      {
        method: 'POST',
        body: JSON.stringify(form),
      },
    );
    status.value = response.warning ? `Closed with warning: ${response.warning}` : 'Incident closed.';
    selectedIncident.value = null;
    form.verdict = 'NFA';
    form.penaltyValue = '';
    form.verdictDescription = '';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="grid">
    <form v-if="selectedIncident" class="panel" @submit.prevent="closeIncident">
      <div class="panel-header">
        <h2 class="panel-title">Close Incident #{{ selectedIncident.id }}</h2>
        <button class="button secondary" type="button" @click="selectedIncident = null">Cancel</button>
      </div>
      <div class="panel-body grid">
        <div v-if="status" class="status">{{ status }}</div>
        <div v-if="error" class="error">{{ error }}</div>
        <div class="form-grid">
          <label class="field">
            <span class="label">Verdict</span>
            <select v-model="form.verdict" class="select">
              <option value="Penalty">Penalty</option>
              <option value="Warning">Warning</option>
              <option value="NFA">No Further Action</option>
            </select>
          </label>
          <label v-if="form.verdict === 'Penalty'" class="field">
            <span class="label">Penalty value</span>
            <input v-model="form.penaltyValue" class="input" />
          </label>
          <label class="field full">
            <span class="label">Description</span>
            <textarea v-model="form.verdictDescription" class="textarea" required />
          </label>
        </div>
        <div>
          <button class="button" type="submit" :disabled="saving">Close incident</button>
        </div>
      </div>
    </form>

    <div class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Incidents</h2>
        <span class="badge">{{ bootstrap.incidents.length }}</span>
      </div>
      <div v-if="status && !selectedIncident" class="panel-body">
        <div class="status">{{ status }}</div>
      </div>
      <div v-if="bootstrap.incidents.length === 0" class="empty">No incidents found.</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Championship</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Created</th>
              <th>Stewards</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="incident in bootstrap.incidents" :key="incident.id">
              <td>{{ displayValue(incident.incidentNumber ?? incident.id) }}</td>
              <td>{{ displayValue(incident.championshipSlug) }}</td>
              <td>{{ displayValue(incident.channelName) }}</td>
              <td>{{ displayValue(incident.status) }}</td>
              <td>{{ formatDate(incident.createdAt) }}</td>
              <td>{{ displayValue(incident.stewardRoleNames) }}</td>
              <td>
                <button
                  class="button secondary"
                  type="button"
                  :disabled="incident.status === 'closed'"
                  @click="selectedIncident = incident"
                >
                  Close
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
