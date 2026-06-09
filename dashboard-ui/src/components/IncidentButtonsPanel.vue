<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue';
import { deleteRecord, saveRecord, apiRequest } from '../api';
import { displayValue, formatDate, recordValue } from '../format';
import GroupedChannelSelect from './GroupedChannelSelect.vue';
import HelpTooltip from './HelpTooltip.vue';
import type { DashboardBootstrap, DashboardRecord } from '../types';

const props = defineProps<{ bootstrap: DashboardBootstrap }>();
const emit = defineEmits<{ refresh: [] }>();

const status = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);
const settingsStatus = shallowRef('');
const settingsError = shallowRef('');
const savingSettings = shallowRef(false);
const editingButtonId = shallowRef<number | null>(null);
const expandedButtonIds = shallowRef(new Set<number>());
const selectedIncident = shallowRef<DashboardRecord | null>(null);
const closeForm = reactive({
  verdict: 'NFA',
  penaltyValue: '',
  verdictDescription: '',
});
const form = reactive({
  channelId: '',
  championshipSlug: '',
  incidentCategoryId: '',
  stewardRoleIds: [] as string[],
  channelRoleIds: [] as string[],
  addReporterToChannel: false,
  buttonLabel: 'Report Incident',
  buttonColor: 'Red',
  buttonMessage:
    'Click the button below to report an incident. You will be asked to provide details.',
});
const incidentSettingsForm = reactive({
  incidentReminderInterval: '',
});

const colorOptions = ['Blue', 'Grey', 'Green', 'Red', 'Purple', 'Orange', 'Yellow', 'Teal', 'Pink'];
const activeChampionships = computed(() =>
  props.bootstrap.myChampsChampionships.filter(
    (championship) => !isChampionshipCompleted(championship),
  ),
);
const incidentsByChampionship = computed(() => {
  const map = new Map<string, DashboardRecord[]>();

  for (const incident of props.bootstrap.incidents) {
    const championshipSlug = stringValue(incident, 'championshipSlug');
    map.set(championshipSlug, [...(map.get(championshipSlug) ?? []), incident]);
  }

  return map;
});

watch(
  () => props.bootstrap.settings,
  () => {
    incidentSettingsForm.incidentReminderInterval = settingValue('incident-reminder-interval');
  },
  { immediate: true },
);

async function saveIncidentSettings(): Promise<void> {
  savingSettings.value = true;
  settingsStatus.value = '';
  settingsError.value = '';

  try {
    await apiRequest(`/servers/${props.bootstrap.guild.id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        settings: {
          'incident-reminder-interval': incidentSettingsForm.incidentReminderInterval,
        },
      }),
    });
    settingsStatus.value = 'Incident settings saved.';
    emit('refresh');
  } catch (caught) {
    settingsError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    savingSettings.value = false;
  }
}

function resetForm(): void {
  editingButtonId.value = null;
  form.channelId = '';
  form.championshipSlug = '';
  form.incidentCategoryId = '';
  form.stewardRoleIds = [];
  form.channelRoleIds = [];
  form.addReporterToChannel = false;
  form.buttonLabel = 'Report Incident';
  form.buttonColor = 'Red';
  form.buttonMessage =
    'Click the button below to report an incident. You will be asked to provide details.';
}

function editButton(button: DashboardRecord): void {
  editingButtonId.value = button.id;
  form.channelId = stringValue(button, 'channelId');
  form.championshipSlug = stringValue(button, 'championshipSlug');
  form.incidentCategoryId = stringValue(button, 'incidentCategoryId');
  form.stewardRoleIds = parseArray(button.stewardRoleIds);
  form.channelRoleIds = parseArray(button.channelRoleIds);
  form.addReporterToChannel = Boolean(button.addReporterToChannel);
  form.buttonLabel = stringValue(button, 'buttonLabel') || 'Report Incident';
  form.buttonColor = stringValue(button, 'buttonColor') || 'Red';
  form.buttonMessage =
    stringValue(button, 'buttonMessage') ||
    'Click the button below to report an incident. You will be asked to provide details.';
}

async function submit(): Promise<void> {
  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await saveRecord(
      props.bootstrap.guild.id,
      'incident-buttons',
      {
        channelId: form.channelId,
        championshipSlug: form.championshipSlug,
        incidentCategoryId: form.incidentCategoryId,
        stewardRoleIds: form.stewardRoleIds,
        channelRoleIds: form.channelRoleIds,
        addReporterToChannel: form.addReporterToChannel,
        buttonLabel: form.buttonLabel,
        buttonColor: form.buttonColor,
        buttonMessage: form.buttonMessage,
      },
      editingButtonId.value ?? undefined,
    );
    status.value = editingButtonId.value
      ? 'Incident setup updated.'
      : 'Incident setup posted to Discord.';
    resetForm();
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

async function removeButton(button: DashboardRecord): Promise<void> {
  if (!window.confirm(`Delete incident button for ${displayValue(button.championshipSlug)}?`)) {
    return;
  }

  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await deleteRecord(props.bootstrap.guild.id, 'incident-buttons', button.id);
    status.value = 'Incident button deleted.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

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
        body: JSON.stringify(closeForm),
      },
    );
    status.value = response.warning
      ? `Closed with warning: ${response.warning}`
      : 'Incident closed.';
    selectedIncident.value = null;
    closeForm.verdict = 'NFA';
    closeForm.penaltyValue = '';
    closeForm.verdictDescription = '';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

function incidentsForButton(button: DashboardRecord): DashboardRecord[] {
  return incidentsByChampionship.value.get(stringValue(button, 'championshipSlug')) ?? [];
}

function incidentDefendants(incident: DashboardRecord): string {
  const names = Array.isArray(incident.defendantNames)
    ? incident.defendantNames.map(String).filter(Boolean)
    : parseArray(incident.defendants);

  return names.length > 0 ? names.join(', ') : '-';
}

function incidentCommentCount(incident: DashboardRecord): string {
  const value = recordValue(incident, 'commentCount');
  return typeof value === 'number' ? String(value) : '-';
}

function toggleButton(id: number): void {
  const next = new Set(expandedButtonIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expandedButtonIds.value = next;
}

function isButtonExpanded(id: number): boolean {
  return expandedButtonIds.value.has(id);
}

function parseArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function stringValue(record: DashboardRecord, key: string): string {
  const value = recordValue(record, key);
  return value == null ? '' : String(value);
}

function settingValue(key: string): string {
  return props.bootstrap.settings.find((setting) => setting.key === key)?.value ?? '';
}

function isChampionshipCompleted(championship: unknown): boolean {
  const record = championship as Record<string, unknown>;
  const status = String(record.status ?? '').toLowerCase();
  const completedFlags = [record.completed, record.is_completed, record.isCompleted];

  return (
    completedFlags.some((value) => value === true || String(value).toLowerCase() === 'true') ||
    Boolean(
      record.completed_at ||
      record.completedAt ||
      ['completed', 'complete', 'finished', 'archived', 'closed'].includes(status),
    )
  );
}

resetForm();
</script>

<template>
  <section class="grid">
    <form v-if="bootstrap.guild.canEdit" class="panel" @submit.prevent="saveIncidentSettings">
      <div class="panel-header">
        <h2 class="panel-title">Incident Settings</h2>
      </div>
      <div class="panel-body grid">
        <div v-if="settingsStatus" class="status">{{ settingsStatus }}</div>
        <div v-if="settingsError" class="error">{{ settingsError }}</div>

        <div class="form-grid">
          <label class="field">
            <span class="label-row">
              <span class="label">Incident reminder hours</span>
              <HelpTooltip
                text="How often stewards are reminded about open incident tickets. Use 0 or leave blank to disable these reminders."
              />
            </span>
            <input
              v-model="incidentSettingsForm.incidentReminderInterval"
              class="input"
              type="number"
              min="0"
            />
          </label>

          <div class="field full">
            <span class="label-row">
              <span class="label">Incident categories</span>
              <HelpTooltip
                text="Incident categories are configured per incident setup, so each Discord button can create tickets in its own category."
              />
            </span>
            <p class="muted compact-copy">Set the incident category on each incident setup.</p>
          </div>
        </div>

        <div>
          <button class="button" type="submit" :disabled="savingSettings">
            Save incident settings
          </button>
        </div>
      </div>
    </form>

    <form v-if="bootstrap.guild.canEdit" class="panel" @submit.prevent="submit">
      <div class="panel-header">
        <h2 class="panel-title">
          {{ editingButtonId ? 'Edit Incident Setup' : 'New Incident Setup' }}
        </h2>
        <button v-if="editingButtonId" class="button secondary" type="button" @click="resetForm">
          Cancel
        </button>
      </div>
      <div class="panel-body grid">
        <div v-if="status" class="status">{{ status }}</div>
        <div v-if="error" class="error">{{ error }}</div>

        <div class="form-grid">
          <label class="field">
            <span class="label">Button channel</span>
            <GroupedChannelSelect
              v-model="form.channelId"
              :channels="bootstrap.metadata.textChannels"
              :categories="bootstrap.metadata.categories"
              required
            />
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Championship</span>
              <HelpTooltip
                text="The button stores the championship slug, but displays the MyChamps team and championship name here."
              />
            </span>
            <select v-model="form.championshipSlug" class="select" required>
              <option value="">Select championship...</option>
              <option
                v-for="championship in activeChampionships"
                :key="championship.slug"
                :value="championship.slug"
              >
                {{ championship.label }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Incident category</span>
              <HelpTooltip
                text="New incident ticket channels created from this button will be placed in this Discord category."
              />
            </span>
            <select v-model="form.incidentCategoryId" class="select">
              <option value="">No category</option>
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
            <span class="label">Button color</span>
            <select v-model="form.buttonColor" class="select">
              <option v-for="color in colorOptions" :key="color" :value="color">{{ color }}</option>
            </select>
          </label>

          <label class="field">
            <span class="label">Button label</span>
            <input v-model="form.buttonLabel" class="input" required />
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Add reporter to channel</span>
              <HelpTooltip
                text="Allows the reporting user to view the private incident channel after the ticket is created."
              />
            </span>
            <span class="checkbox-row">
              <input v-model="form.addReporterToChannel" type="checkbox" />
              <span class="muted">Grant reporter access</span>
            </span>
          </label>

          <label class="field">
            <span class="label">Steward roles</span>
            <select v-model="form.stewardRoleIds" class="select" multiple>
              <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="label">Extra channel roles</span>
            <select v-model="form.channelRoleIds" class="select" multiple>
              <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
          </label>

          <label class="field full">
            <span class="label">Button message</span>
            <textarea v-model="form.buttonMessage" class="textarea" required />
          </label>
        </div>

        <div>
          <button class="button" type="submit" :disabled="saving">
            {{ editingButtonId ? 'Save incident setup' : 'Create incident setup' }}
          </button>
        </div>
      </div>
    </form>

    <form v-if="selectedIncident" class="panel" @submit.prevent="closeIncident">
      <div class="panel-header">
        <h2 class="panel-title">Close Incident #{{ selectedIncident.id }}</h2>
        <button class="button secondary" type="button" @click="selectedIncident = null">
          Cancel
        </button>
      </div>
      <div class="panel-body form-grid">
        <label class="field">
          <span class="label">Verdict</span>
          <select v-model="closeForm.verdict" class="select">
            <option value="Penalty">Penalty</option>
            <option value="Warning">Warning</option>
            <option value="NFA">No Further Action</option>
          </select>
        </label>
        <label v-if="closeForm.verdict === 'Penalty'" class="field">
          <span class="label">Penalty value</span>
          <input v-model="closeForm.penaltyValue" class="input" />
        </label>
        <label class="field full">
          <span class="label">Description</span>
          <textarea v-model="closeForm.verdictDescription" class="textarea" required />
        </label>
        <div>
          <button class="button" type="submit" :disabled="saving">Close incident</button>
        </div>
      </div>
    </form>

    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Incidents</h2>
        <span class="badge">{{ bootstrap.incidentButtons.length }}</span>
      </div>

      <div v-if="bootstrap.incidentButtons.length === 0" class="empty">
        No incident buttons found.
      </div>

      <div v-else class="record-list">
        <article v-for="button in bootstrap.incidentButtons" :key="button.id" class="record-card">
          <button class="record-summary" type="button" @click="toggleButton(button.id)">
            <span>
              <strong>{{
                displayValue(button.championshipName ?? button.championshipSlug)
              }}</strong>
              <span class="muted"
                >{{ displayValue(button.channelName) }} ·
                {{ displayValue(button.incidentCategoryName) }}</span
              >
            </span>
            <span class="badge">{{ incidentsForButton(button).length }} incidents</span>
          </button>

          <div v-if="isButtonExpanded(button.id)" class="record-detail">
            <div class="actions">
              <button
                v-if="bootstrap.guild.canEdit"
                class="button secondary"
                type="button"
                @click="editButton(button)"
              >
                Edit setup
              </button>
              <button
                v-if="bootstrap.guild.canEdit"
                class="button danger"
                type="button"
                @click="removeButton(button)"
              >
                Delete setup
              </button>
            </div>

            <div v-if="incidentsForButton(button).length === 0" class="empty compact">
              No incidents have been reported from this championship yet.
            </div>

            <div v-else class="nested-list">
              <article
                v-for="incident in incidentsForButton(button)"
                :key="incident.id"
                class="nested-card incident-row"
              >
                <div>
                  <strong>{{ displayValue(incident.incidentNumber ?? incident.id) }}</strong>
                  <div class="muted">
                    {{ formatDate(incident.createdAt) }} · {{ displayValue(incident.channelName) }}
                  </div>
                  <div class="incident-meta">
                    <span>Reported by: {{ displayValue(incident.reportedByName) }}</span>
                    <span>Reported against: {{ incidentDefendants(incident) }}</span>
                    <span>Comments: {{ incidentCommentCount(incident) }}</span>
                  </div>
                </div>
                <div class="actions">
                  <span class="badge">{{ displayValue(incident.status) }}</span>
                  <button
                    class="button secondary"
                    type="button"
                    :disabled="incident.status === 'closed'"
                    @click="selectedIncident = incident"
                  >
                    Close
                  </button>
                </div>
              </article>
            </div>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
