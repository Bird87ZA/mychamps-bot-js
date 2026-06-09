<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue';
import { createAttendanceSchedule, deleteRecord, saveRecord } from '../api';
import { displayValue, formatDate, recordValue, toDatetimeInput } from '../format';
import GroupedChannelSelect from './GroupedChannelSelect.vue';
import HelpTooltip from './HelpTooltip.vue';
import TagInput from './TagInput.vue';
import type { DashboardBootstrap, DashboardRecord } from '../types';

const props = defineProps<{ bootstrap: DashboardBootstrap }>();
const emit = defineEmits<{ refresh: [] }>();

const status = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);
const editingAttendanceId = shallowRef<number | null>(null);
const editingScheduleId = shallowRef<number | null>(null);
const expandedAttendanceIds = shallowRef(new Set<number>());
const expandedScheduleIds = shallowRef(new Set<number>());

const attendanceForm = reactive({
  channelId: '',
  fullTimeRoleId: '',
  reserveRoleId: '',
  commentatorRoleId: '',
  groups: [] as string[],
  includeReserveGroup: true,
  includeCommentatorGroup: true,
});
const scheduleForm = reactive({
  attendanceId: null as number | null,
  name: '',
  dateLocal: '',
  closingDateLocal: '',
  image: '',
  postTimeDaysBefore: '',
});

const defaultPostTime = computed(() => settingValue('post-time') || '6');
const excludedAttendanceChannelIds = computed(() => {
  const excluded = new Set(
    props.bootstrap.attendance
      .map((attendance) => stringValue(attendance, 'channelId'))
      .filter(Boolean),
  );

  if (editingAttendanceId.value && attendanceForm.channelId) {
    excluded.delete(attendanceForm.channelId);
  }

  return Array.from(excluded);
});
const schedulesByChannel = computed(() => {
  const map = new Map<string, DashboardRecord[]>();

  for (const schedule of props.bootstrap.schedules) {
    const channelId = stringValue(schedule, 'channelId');
    map.set(channelId, [...(map.get(channelId) ?? []), schedule]);
  }

  return map;
});
const remindersBySchedule = computed(() => {
  const map = new Map<string, DashboardRecord[]>();

  for (const reminder of props.bootstrap.reminders) {
    const scheduleId = stringValue(reminder, 'scheduleId');
    map.set(scheduleId, [...(map.get(scheduleId) ?? []), reminder]);
  }

  return map;
});

function resetAttendanceForm(): void {
  editingAttendanceId.value = null;
  attendanceForm.channelId = '';
  attendanceForm.fullTimeRoleId = '';
  attendanceForm.reserveRoleId = '';
  attendanceForm.commentatorRoleId = '';
  attendanceForm.groups = [];
  attendanceForm.includeReserveGroup = true;
  attendanceForm.includeCommentatorGroup = true;
  resetScheduleForm();
}

function resetScheduleForm(): void {
  editingScheduleId.value = null;
  scheduleForm.attendanceId = null;
  scheduleForm.name = '';
  scheduleForm.dateLocal = '';
  scheduleForm.closingDateLocal = '';
  scheduleForm.image = '';
  scheduleForm.postTimeDaysBefore = defaultPostTime.value;
}

function editAttendance(attendance: DashboardRecord): void {
  editingAttendanceId.value = attendance.id;
  attendanceForm.channelId = stringValue(attendance, 'channelId');
  attendanceForm.fullTimeRoleId = stringValue(attendance, 'fullTime');
  attendanceForm.reserveRoleId = stringValue(attendance, 'reserve');
  attendanceForm.commentatorRoleId = stringValue(attendance, 'commentator');
  attendanceForm.groups = Array.isArray(attendance.attendeeGroupNames)
    ? attendance.attendeeGroupNames.map(String)
    : [];
  attendanceForm.includeReserveGroup = hasAttendeeGroup(attendance, 'Reserves');
  attendanceForm.includeCommentatorGroup = hasAttendeeGroup(attendance, 'Commentators');
}

async function submitAttendance(): Promise<void> {
  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    const attendancePayload = {
      channelId: attendanceForm.channelId,
      fullTimeRoleId: attendanceForm.fullTimeRoleId,
      reserveRoleId: attendanceForm.reserveRoleId,
      commentatorRoleId: attendanceForm.commentatorRoleId,
      groups: attendanceForm.groups,
      includeReserveGroup: attendanceForm.includeReserveGroup,
      includeCommentatorGroup: attendanceForm.includeCommentatorGroup,
    };

    if (editingAttendanceId.value) {
      await saveRecord(
        props.bootstrap.guild.id,
        'attendance',
        attendancePayload,
        editingAttendanceId.value,
      );
      status.value = 'Attendance updated.';
    } else {
      await createAttendanceSchedule(props.bootstrap.guild.id, {
        attendance: attendancePayload,
        schedule: {
          name: scheduleForm.name,
          channelId: attendanceForm.channelId,
          dateLocal: scheduleForm.dateLocal,
          closingDateLocal: scheduleForm.closingDateLocal,
          image: scheduleForm.image,
          postTimeDaysBefore: scheduleForm.postTimeDaysBefore || defaultPostTime.value,
        },
      });
      status.value = 'Attendance and round created.';
    }

    resetAttendanceForm();
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

async function removeAttendance(attendance: DashboardRecord): Promise<void> {
  if (!window.confirm(`Delete attendance for ${displayValue(attendance.channelName)}?`)) {
    return;
  }

  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await deleteRecord(props.bootstrap.guild.id, 'attendance', attendance.id);
    status.value = 'Attendance deleted.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

function startAddSchedule(attendance: DashboardRecord): void {
  editingScheduleId.value = null;
  scheduleForm.attendanceId = attendance.id;
  scheduleForm.name = '';
  scheduleForm.dateLocal = '';
  scheduleForm.closingDateLocal = '';
  scheduleForm.image = '';
  scheduleForm.postTimeDaysBefore = defaultPostTime.value;
}

function startEditSchedule(attendance: DashboardRecord, schedule: DashboardRecord): void {
  editingScheduleId.value = schedule.id;
  scheduleForm.attendanceId = attendance.id;
  scheduleForm.name = stringValue(schedule, 'name');
  scheduleForm.dateLocal = toDatetimeInput(recordValue(schedule, 'date'));
  scheduleForm.closingDateLocal = toDatetimeInput(recordValue(schedule, 'closingDate'));
  scheduleForm.image = stringValue(schedule, 'image');
  scheduleForm.postTimeDaysBefore =
    stringValue(schedule, 'postTimeDaysBefore') || defaultPostTime.value;
}

async function submitSchedule(attendance: DashboardRecord): Promise<void> {
  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await saveRecord(
      props.bootstrap.guild.id,
      'schedules',
      {
        name: scheduleForm.name,
        channelId: stringValue(attendance, 'channelId'),
        dateLocal: scheduleForm.dateLocal,
        closingDateLocal: scheduleForm.closingDateLocal,
        image: scheduleForm.image,
        postTimeDaysBefore: scheduleForm.postTimeDaysBefore || defaultPostTime.value,
      },
      editingScheduleId.value ?? undefined,
    );
    status.value = editingScheduleId.value ? 'Round updated.' : 'Round added.';
    resetScheduleForm();
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

async function removeSchedule(schedule: DashboardRecord): Promise<void> {
  if (!window.confirm(`Delete ${displayValue(schedule.name)} and its reminders?`)) {
    return;
  }

  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await deleteRecord(props.bootstrap.guild.id, 'schedules', schedule.id);
    status.value = 'Round deleted.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

function linkedSchedules(attendance: DashboardRecord): DashboardRecord[] {
  return schedulesByChannel.value.get(stringValue(attendance, 'channelId')) ?? [];
}

function linkedReminders(schedule: DashboardRecord): DashboardRecord[] {
  return remindersBySchedule.value.get(String(schedule.id)) ?? [];
}

function toggleAttendance(id: number): void {
  const next = new Set(expandedAttendanceIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expandedAttendanceIds.value = next;
}

function toggleSchedule(id: number): void {
  const next = new Set(expandedScheduleIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  expandedScheduleIds.value = next;
}

function isAttendanceExpanded(id: number): boolean {
  return expandedAttendanceIds.value.has(id);
}

function isScheduleExpanded(id: number): boolean {
  return expandedScheduleIds.value.has(id);
}

function settingValue(key: string): string {
  return props.bootstrap.settings.find((setting) => setting.key === key)?.value ?? '';
}

function stringValue(record: DashboardRecord, key: string): string {
  const value = recordValue(record, key);
  return value == null ? '' : String(value);
}

function hasAttendeeGroup(attendance: DashboardRecord, group: string): boolean {
  const attendees = attendance.attendees;
  return Boolean(attendees && typeof attendees === 'object' && group in attendees);
}

resetAttendanceForm();
</script>

<template>
  <section class="grid">
    <form v-if="bootstrap.guild.canEdit" class="panel" @submit.prevent="submitAttendance">
      <div class="panel-header">
        <h2 class="panel-title">
          {{ editingAttendanceId ? 'Edit Attendance' : 'New Attendance & Round' }}
        </h2>
        <button
          v-if="editingAttendanceId"
          class="button secondary"
          type="button"
          @click="resetAttendanceForm"
        >
          Cancel
        </button>
      </div>
      <div class="panel-body grid">
        <div v-if="status" class="status">{{ status }}</div>
        <div v-if="error" class="error">{{ error }}</div>

        <div class="form-grid">
          <label class="field">
            <span class="label">Attendance channel</span>
            <GroupedChannelSelect
              v-model="attendanceForm.channelId"
              :channels="bootstrap.metadata.textChannels"
              :categories="bootstrap.metadata.categories"
              :exclude-ids="excludedAttendanceChannelIds"
              required
            />
          </label>

          <label class="field">
            <span class="label">Full-time role</span>
            <select v-model="attendanceForm.fullTimeRoleId" class="select" required>
              <option value="">Select role...</option>
              <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="label">Reserve role</span>
            <select v-model="attendanceForm.reserveRoleId" class="select">
              <option value="">No reserve role</option>
              <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span class="label">Commentator role</span>
            <select v-model="attendanceForm.commentatorRoleId" class="select">
              <option value="">No commentator role</option>
              <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
                {{ role.name }}
              </option>
            </select>
          </label>

          <label class="field full">
            <span class="label">Attendance groups</span>
            <TagInput
              v-model="attendanceForm.groups"
              placeholder="Type a group name and press Enter"
            />
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Include reserves group</span>
              <HelpTooltip
                text="Adds a separate Reserves attendance option even when reserves are not full-time drivers."
              />
            </span>
            <span class="checkbox-row">
              <input v-model="attendanceForm.includeReserveGroup" type="checkbox" />
              <span class="muted">Show Reserves</span>
            </span>
          </label>

          <label class="field">
            <span class="label-row">
              <span class="label">Include commentators group</span>
              <HelpTooltip
                text="Adds a Commentators attendance option for broadcasters or stewards who need a separate response group."
              />
            </span>
            <span class="checkbox-row">
              <input v-model="attendanceForm.includeCommentatorGroup" type="checkbox" />
              <span class="muted">Show Commentators</span>
            </span>
          </label>

          <template v-if="!editingAttendanceId">
            <label class="field">
              <span class="label">Round Name</span>
              <input v-model="scheduleForm.name" class="input" required />
            </label>

            <label class="field">
              <span class="label">Event date</span>
              <input
                v-model="scheduleForm.dateLocal"
                class="input"
                type="datetime-local"
                required
              />
            </label>

            <label class="field">
              <span class="label">Closing date</span>
              <input v-model="scheduleForm.closingDateLocal" class="input" type="datetime-local" />
            </label>

            <label class="field">
              <span class="label">Post days before</span>
              <input
                v-model="scheduleForm.postTimeDaysBefore"
                class="input"
                type="number"
                min="0"
              />
            </label>

            <label class="field full">
              <span class="label">Image URL</span>
              <input v-model="scheduleForm.image" class="input" />
            </label>
          </template>
        </div>

        <div>
          <button class="button" type="submit" :disabled="saving">
            {{ editingAttendanceId ? 'Save attendance' : 'Create attendance & round' }}
          </button>
        </div>
      </div>
    </form>

    <section class="panel">
      <div class="panel-header">
        <h2 class="panel-title">Attendance</h2>
        <span class="badge">{{ bootstrap.attendance.length }}</span>
      </div>

      <div v-if="bootstrap.attendance.length === 0" class="empty">
        No attendance configurations found.
      </div>

      <div v-else class="record-list">
        <article
          v-for="attendance in bootstrap.attendance"
          :key="attendance.id"
          class="record-card"
        >
          <button class="record-summary" type="button" @click="toggleAttendance(attendance.id)">
            <span>
              <strong>{{ displayValue(attendance.channelName) }}</strong>
              <span class="muted">Full-time: {{ displayValue(attendance.fullTimeRoleName) }}</span>
            </span>
            <span class="badge">{{ linkedSchedules(attendance).length }} rounds</span>
          </button>

          <div v-if="isAttendanceExpanded(attendance.id)" class="record-detail">
            <div class="actions">
              <button
                v-if="bootstrap.guild.canEdit"
                class="button secondary"
                type="button"
                @click="editAttendance(attendance)"
              >
                Edit attendance
              </button>
              <button
                v-if="bootstrap.guild.canEdit"
                class="button danger"
                type="button"
                @click="removeAttendance(attendance)"
              >
                Delete attendance
              </button>
              <button
                v-if="bootstrap.guild.canEdit"
                class="button secondary"
                type="button"
                @click="startAddSchedule(attendance)"
              >
                Add round
              </button>
            </div>

            <form
              v-if="scheduleForm.attendanceId === attendance.id"
              class="nested-form"
              @submit.prevent="submitSchedule(attendance)"
            >
              <div class="form-grid">
                <label class="field">
                  <span class="label">Round Name</span>
                  <input v-model="scheduleForm.name" class="input" required />
                </label>
                <label class="field">
                  <span class="label">Event date</span>
                  <input
                    v-model="scheduleForm.dateLocal"
                    class="input"
                    type="datetime-local"
                    required
                  />
                </label>
                <label class="field">
                  <span class="label">Closing date</span>
                  <input
                    v-model="scheduleForm.closingDateLocal"
                    class="input"
                    type="datetime-local"
                  />
                </label>
                <label class="field">
                  <span class="label">Post days before</span>
                  <input
                    v-model="scheduleForm.postTimeDaysBefore"
                    class="input"
                    type="number"
                    min="0"
                  />
                </label>
                <label class="field full">
                  <span class="label">Image URL</span>
                  <input v-model="scheduleForm.image" class="input" />
                </label>
              </div>
              <div class="actions">
                <button class="button" type="submit" :disabled="saving">
                  {{ editingScheduleId ? 'Save round' : 'Add round' }}
                </button>
                <button class="button secondary" type="button" @click="resetScheduleForm">
                  Cancel
                </button>
              </div>
            </form>

            <div v-if="linkedSchedules(attendance).length === 0" class="empty compact">
              No rounds use this attendance channel yet.
            </div>

            <div v-else class="nested-list">
              <article
                v-for="schedule in linkedSchedules(attendance)"
                :key="schedule.id"
                class="nested-card"
              >
                <button
                  class="record-summary nested"
                  type="button"
                  @click="toggleSchedule(schedule.id)"
                >
                  <span>
                    <strong>{{ displayValue(schedule.name) }}</strong>
                    <span class="muted">{{ formatDate(schedule.date) }}</span>
                  </span>
                  <span class="badge">{{ linkedReminders(schedule).length }} reminders</span>
                </button>

                <div v-if="isScheduleExpanded(schedule.id)" class="record-detail">
                  <div class="actions">
                    <button
                      v-if="bootstrap.guild.canEdit"
                      class="button secondary"
                      type="button"
                      @click="startEditSchedule(attendance, schedule)"
                    >
                      Edit round
                    </button>
                    <button
                      v-if="bootstrap.guild.canEdit"
                      class="button danger"
                      type="button"
                      @click="removeSchedule(schedule)"
                    >
                      Delete round
                    </button>
                  </div>
                  <div v-if="linkedReminders(schedule).length === 0" class="empty compact">
                    No generated reminders for this round.
                  </div>
                  <ul v-else class="reminder-list">
                    <li v-for="reminder in linkedReminders(schedule)" :key="reminder.id">
                      <span>{{ formatDate(reminder.remindAt) }}</span>
                      <span class="badge">{{ reminder.reminded ? 'Sent' : 'Pending' }}</span>
                    </li>
                  </ul>
                </div>
              </article>
            </div>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
