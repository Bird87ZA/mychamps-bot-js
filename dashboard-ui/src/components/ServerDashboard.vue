<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import AccessRolesPanel from './AccessRolesPanel.vue';
import IncidentsPanel from './IncidentsPanel.vue';
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
  { id: 'schedules', label: 'Schedules' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'randomisers', label: 'Randomisers' },
  { id: 'incident-buttons', label: 'Incident Buttons' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'access', label: 'Access' },
];

const textChannelOptions = computed(() => optionList(props.bootstrap.metadata.textChannels));
const roleOptions = computed(() => optionList(props.bootstrap.metadata.roles));
const categoryOptions = computed(() => optionList(props.bootstrap.metadata.categories));
const scheduleOptions = computed(() =>
  props.bootstrap.schedules.map((schedule) => ({
    value: String(schedule.id),
    label: String(schedule.name ?? schedule.id),
  })),
);
const colorOptions = ['Blue', 'Grey', 'Green', 'Red', 'Purple', 'Orange', 'Yellow', 'Teal', 'Pink']
  .map((color) => ({ value: color, label: color }));

const attendanceFields = computed<FieldConfig[]>(() => [
  { key: 'channelId', label: 'Channel', type: 'select', options: textChannelOptions.value, sourceKey: 'channelId', required: true },
  { key: 'fullTimeRoleId', label: 'Full-time role', type: 'select', options: roleOptions.value, sourceKey: 'fullTime', required: true },
  { key: 'reserveRoleId', label: 'Reserve role', type: 'select', options: roleOptions.value, sourceKey: 'reserve' },
  { key: 'commentatorRoleId', label: 'Commentator role', type: 'select', options: roleOptions.value, sourceKey: 'commentator' },
  { key: 'groups', label: 'Attendance groups', type: 'textarea', sourceKey: 'attendeeGroupNames', placeholder: 'Role or group names separated by commas' },
  { key: 'includeReserveGroup', label: 'Include reserves group', type: 'checkbox', sourceKey: 'reserve' },
  { key: 'includeCommentatorGroup', label: 'Include commentators group', type: 'checkbox', sourceKey: 'commentator' },
]);

const scheduleFields = computed<FieldConfig[]>(() => [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'channelId', label: 'Channel', type: 'select', options: textChannelOptions.value, sourceKey: 'channelId', required: true },
  { key: 'dateLocal', label: 'Event date', type: 'datetime', sourceKey: 'date', required: true },
  { key: 'closingDateLocal', label: 'Closing date', type: 'datetime', sourceKey: 'closingDate' },
  { key: 'image', label: 'Image URL', type: 'text' },
  { key: 'postTimeDaysBefore', label: 'Post days before', type: 'number', sourceKey: 'postTimeDaysBefore' },
  { key: 'botPosted', label: 'Bot posted', type: 'checkbox' },
  { key: 'closed', label: 'Closed', type: 'checkbox' },
]);

const reminderFields = computed<FieldConfig[]>(() => [
  { key: 'scheduleId', label: 'Schedule', type: 'select', options: scheduleOptions.value, required: true },
  { key: 'remindAt', label: 'Reminder time', type: 'datetime', required: true },
  { key: 'reminded', label: 'Already reminded', type: 'checkbox' },
]);

const randomiserFields = computed<FieldConfig[]>(() => [
  { key: 'channelId', label: 'Channel', type: 'select', options: textChannelOptions.value, sourceKey: 'channelId', required: true },
  { key: 'options', label: 'Options', type: 'textarea', placeholder: 'Option A||Option B||Option C', required: true },
  { key: 'repick', label: 'Allow repick', type: 'checkbox' },
  { key: 'frequency', label: 'Frequency days', type: 'number' },
  { key: 'repeat', label: 'Repeats left', type: 'number' },
  { key: 'postAt', label: 'Next post', type: 'datetime', required: true },
  { key: 'message', label: 'Message template', type: 'text' },
]);

const incidentButtonFields = computed<FieldConfig[]>(() => [
  { key: 'channelId', label: 'Button channel', type: 'select', options: textChannelOptions.value, sourceKey: 'channelId', required: true },
  { key: 'championshipSlug', label: 'Championship slug', type: 'text', required: true },
  { key: 'incidentCategoryId', label: 'Incident category', type: 'select', options: categoryOptions.value },
  { key: 'stewardRoleIds', label: 'Steward roles', type: 'multiselect', options: roleOptions.value },
  { key: 'channelRoleIds', label: 'Extra channel roles', type: 'multiselect', options: roleOptions.value },
  { key: 'addReporterToChannel', label: 'Add reporter to channel', type: 'checkbox' },
  { key: 'buttonLabel', label: 'Button label', type: 'text' },
  { key: 'buttonColor', label: 'Button color', type: 'select', options: colorOptions },
  { key: 'buttonMessage', label: 'Button message', type: 'textarea' },
]);

const canEdit = computed(() => props.bootstrap.guild.canEdit);

function optionList(items: Array<{ id: string; name: string }>): FieldOption[] {
  return items.map((item) => ({ value: item.id, label: item.name }));
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <div>
        <button class="button secondary" type="button" @click="emit('back')">Back to servers</button>
        <h1 class="panel-title" style="margin-top: 12px">{{ bootstrap.guild.name }}</h1>
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
      <ResourcePanel
        v-else-if="activeTab === 'attendance'"
        :guild-id="bootstrap.guild.id"
        title="Attendance"
        resource="attendance"
        :items="bootstrap.attendance"
        :fields="attendanceFields"
        :columns="[
          { key: 'channelName', label: 'Channel' },
          { key: 'fullTimeRoleName', label: 'Full-time' },
          { key: 'reserveRoleName', label: 'Reserve' },
          { key: 'commentatorRoleName', label: 'Commentator' },
          { key: 'attendees', label: 'Groups' },
        ]"
        :can-edit="canEdit"
        empty-text="No attendance configurations found."
        @refresh="emit('refresh')"
      />
      <ResourcePanel
        v-else-if="activeTab === 'schedules'"
        :guild-id="bootstrap.guild.id"
        title="Schedule"
        resource="schedules"
        :items="bootstrap.schedules"
        :fields="scheduleFields"
        :columns="[
          { key: 'name', label: 'Name' },
          { key: 'channelName', label: 'Channel' },
          { key: 'date', label: 'Event', format: 'date' },
          { key: 'closingDate', label: 'Closing', format: 'date' },
          { key: 'closed', label: 'Closed' },
          { key: 'reminderCount', label: 'Reminders' },
        ]"
        :can-edit="canEdit"
        empty-text="No schedules found."
        @refresh="emit('refresh')"
      />
      <ResourcePanel
        v-else-if="activeTab === 'reminders'"
        :guild-id="bootstrap.guild.id"
        title="Reminder"
        resource="reminders"
        :items="bootstrap.reminders"
        :fields="reminderFields"
        :columns="[
          { key: 'scheduleName', label: 'Schedule' },
          { key: 'remindAt', label: 'Remind at', format: 'date' },
          { key: 'reminded', label: 'Reminded' },
        ]"
        :can-edit="canEdit"
        empty-text="No reminders found."
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
      <ResourcePanel
        v-else-if="activeTab === 'incident-buttons'"
        :guild-id="bootstrap.guild.id"
        title="Incident Button"
        resource="incident-buttons"
        :items="bootstrap.incidentButtons"
        :fields="incidentButtonFields"
        :columns="[
          { key: 'championshipSlug', label: 'Championship' },
          { key: 'channelName', label: 'Channel' },
          { key: 'incidentCategoryName', label: 'Category' },
          { key: 'buttonLabel', label: 'Label' },
          { key: 'buttonColor', label: 'Color' },
        ]"
        :can-edit="canEdit"
        empty-text="No incident buttons found."
        @refresh="emit('refresh')"
      />
      <IncidentsPanel
        v-else-if="activeTab === 'incidents'"
        :bootstrap="bootstrap"
        @refresh="emit('refresh')"
      />
      <AccessRolesPanel
        v-else
        :bootstrap="bootstrap"
        @refresh="emit('refresh')"
      />
    </div>
  </section>
</template>
