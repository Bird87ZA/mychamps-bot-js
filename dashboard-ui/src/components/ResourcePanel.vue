<script setup lang="ts">
import { computed, reactive, shallowRef } from 'vue';
import { deleteRecord, saveRecord } from '../api';
import { displayValue, formatDate, recordValue, toDatetimeInput } from '../format';
import type { DashboardRecord, FieldConfig } from '../types';

const props = defineProps<{
  guildId: string;
  title: string;
  resource: string;
  items: DashboardRecord[];
  fields: FieldConfig[];
  columns: Array<{ key: string; label: string; format?: 'date' }>;
  canEdit: boolean;
  emptyText: string;
}>();

const emit = defineEmits<{ refresh: [] }>();

const form = reactive<Record<string, unknown>>({});
const editingId = shallowRef<number | null>(null);
const status = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);

const submitLabel = computed(() => (editingId.value ? 'Save changes' : `Create ${props.title}`));

function resetForm(): void {
  editingId.value = null;
  status.value = '';
  error.value = '';
  for (const field of props.fields) {
    form[field.key] = field.type === 'checkbox' ? false : field.type === 'multiselect' ? [] : '';
  }
}

function editItem(item: DashboardRecord): void {
  resetForm();
  editingId.value = item.id;

  for (const field of props.fields) {
    const sourceValue = recordValue(item, field.sourceKey ?? field.key);
    form[field.key] = field.type === 'datetime'
      ? toDatetimeInput(sourceValue)
      : field.type === 'multiselect'
        ? Array.isArray(sourceValue)
          ? sourceValue
          : []
        : field.type === 'textarea' && Array.isArray(sourceValue)
          ? sourceValue.join(', ')
          : field.type === 'checkbox'
            ? Boolean(sourceValue)
            : sourceValue ?? '';
  }
}

async function submit(): Promise<void> {
  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await saveRecord(props.guildId, props.resource, { ...form }, editingId.value ?? undefined);
    resetForm();
    status.value = 'Saved.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

async function removeItem(item: DashboardRecord): Promise<void> {
  if (!window.confirm(`Delete ${props.title.toLowerCase()} #${item.id}?`)) {
    return;
  }

  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await deleteRecord(props.guildId, props.resource, item.id);
    status.value = 'Deleted.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

resetForm();
</script>

<template>
  <section class="grid">
    <form v-if="canEdit" class="panel" @submit.prevent="submit">
      <div class="panel-header">
        <h2 class="panel-title">{{ editingId ? `Edit ${title}` : `New ${title}` }}</h2>
        <button v-if="editingId" class="button secondary" type="button" @click="resetForm">
          Cancel
        </button>
      </div>
      <div class="panel-body grid">
        <div v-if="status" class="status">{{ status }}</div>
        <div v-if="error" class="error">{{ error }}</div>
        <div class="form-grid">
          <label
            v-for="field in fields"
            :key="field.key"
            class="field"
            :class="{ full: field.type === 'textarea' || field.type === 'multiselect' }"
          >
            <span class="label">{{ field.label }}</span>
            <textarea
              v-if="field.type === 'textarea'"
              v-model="form[field.key]"
              class="textarea"
              :placeholder="field.placeholder"
            />
            <select
              v-else-if="field.type === 'select'"
              v-model="form[field.key]"
              class="select"
              :required="field.required"
            >
              <option value="">Select...</option>
              <option v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <select
              v-else-if="field.type === 'multiselect'"
              v-model="form[field.key]"
              class="select"
              multiple
            >
              <option v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <span v-else-if="field.type === 'checkbox'" class="checkbox-row">
              <input v-model="form[field.key]" type="checkbox" />
            </span>
            <input
              v-else
              v-model="form[field.key]"
              class="input"
              :type="field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : 'text'"
              :placeholder="field.placeholder"
              :required="field.required"
            />
          </label>
        </div>
        <div>
          <button class="button" type="submit" :disabled="saving">{{ submitLabel }}</button>
        </div>
      </div>
    </form>

    <div class="panel">
      <div class="panel-header">
        <h2 class="panel-title">{{ title }}</h2>
        <span class="badge">{{ items.length }}</span>
      </div>
      <div v-if="items.length === 0" class="empty">{{ emptyText }}</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column.key">{{ column.label }}</th>
              <th v-if="canEdit">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id">
              <td v-for="column in columns" :key="column.key">
                {{ column.format === 'date' ? formatDate(recordValue(item, column.key)) : displayValue(recordValue(item, column.key)) }}
              </td>
              <td v-if="canEdit">
                <div class="actions">
                  <button class="button secondary" type="button" @click="editItem(item)">Edit</button>
                  <button class="button danger" type="button" @click="removeItem(item)">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
