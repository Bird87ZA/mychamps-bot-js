<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import AccessRolesPanel from './AccessRolesPanel.vue';
import AttendanceSchedulePanel from './AttendanceSchedulePanel.vue';
import IncidentButtonsPanel from './IncidentButtonsPanel.vue';
import ResourcePanel from './ResourcePanel.vue';
import SettingsPanel from './SettingsPanel.vue';
import type { DashboardBootstrap, FieldConfig, FieldOption } from '../types';

const props = defineProps<{
  bootstrap: DashboardBootstrap;
  loading: boolean;
}>();

const emit = defineEmits<{
  back: [];
  refresh: [];
}>();

const activeTab = shallowRef('settings');
const tabs = [
  { id: 'settings', label: 'Settings' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'randomisers', label: 'Randomisers' },
  { id: 'incident-buttons', label: 'Incident Buttons' },
  { id: 'access', label: 'Access' },
];

const textChannelOptions = computed(() => optionList(props.bootstrap.metadata.textChannels));
const canEdit = computed(() => props.bootstrap.guild.canEdit);
const randomiserFields = computed<FieldConfig[]>(() => [
  {
    key: 'channelId',
    label: 'Channel',
    type: 'select',
    options: textChannelOptions.value,
    sourceKey: 'channelId',
    required: true,
  },
  {
    key: 'options',
    label: 'Options',
    type: 'textarea',
    placeholder: 'Option A||Option B||Option C',
    required: true,
  },
  { key: 'repick', label: 'Allow repick', type: 'checkbox' },
  { key: 'frequency', label: 'Frequency days', type: 'number' },
  { key: 'repeat', label: 'Repeats left', type: 'number' },
  { key: 'postAt', label: 'Next post', type: 'datetime', required: true },
  { key: 'message', label: 'Message template', type: 'text' },
]);

function optionList(items: Array<{ id: string; name: string }>): FieldOption[] {
  return items.map((item) => ({ value: item.id, label: item.name }));
}
</script>

<template>
  <section class="panel dashboard-panel">
    <div class="panel-header dashboard-heading">
      <div>
        <button class="button secondary" type="button" @click="emit('back')">
          Back to servers
        </button>
        <h1 class="panel-title dashboard-title">{{ bootstrap.guild.name }}</h1>
      </div>
      <button class="button secondary" type="button" :disabled="loading" @click="emit('refresh')">
        Refresh
      </button>
    </div>

    <nav class="tabs" aria-label="Server dashboard sections">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTab === tab.id }"
        type="button"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div class="panel-body">
      <SettingsPanel
        v-if="activeTab === 'settings'"
        :bootstrap="bootstrap"
        @refresh="emit('refresh')"
      />
      <AttendanceSchedulePanel
        v-else-if="activeTab === 'attendance'"
        :bootstrap="bootstrap"
        @refresh="emit('refresh')"
      />
      <ResourcePanel
        v-else-if="activeTab === 'randomisers'"
        :guild-id="bootstrap.guild.id"
        title="Randomiser"
        resource="randomisers"
        :items="bootstrap.randomisers"
        :fields="randomiserFields"
        :columns="[
          { key: 'channelName', label: 'Channel' },
          { key: 'options', label: 'Options' },
          { key: 'repick', label: 'Repick' },
          { key: 'frequency', label: 'Frequency' },
          { key: 'repeat', label: 'Repeats' },
          { key: 'postAt', label: 'Next post', format: 'date' },
        ]"
        :can-edit="canEdit"
        empty-text="No randomisers found."
        @refresh="emit('refresh')"
      />
      <IncidentButtonsPanel
        v-else-if="activeTab === 'incident-buttons'"
        :bootstrap="bootstrap"
        @refresh="emit('refresh')"
      />
      <AccessRolesPanel v-else :bootstrap="bootstrap" @refresh="emit('refresh')" />
    </div>
  </section>
</template>
