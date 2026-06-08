<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { apiRequest } from '../api';
import type { DashboardBootstrap } from '../types';

const props = defineProps<{ bootstrap: DashboardBootstrap }>();
const emit = defineEmits<{ refresh: [] }>();

const selectedRoleIds = shallowRef(props.bootstrap.accessRoles.map((role) => String(role.roleId)));
const status = shallowRef('');
const error = shallowRef('');
const saving = shallowRef(false);

const selectedNames = computed(() =>
  props.bootstrap.accessRoles.map((role) => String(role.roleName ?? role.roleId)),
);

watch(
  () => props.bootstrap.accessRoles,
  () => {
    selectedRoleIds.value = props.bootstrap.accessRoles.map((role) => String(role.roleId));
  },
  { immediate: true },
);

async function save(): Promise<void> {
  saving.value = true;
  status.value = '';
  error.value = '';

  try {
    await apiRequest(`/servers/${props.bootstrap.guild.id}/access-roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleIds: selectedRoleIds.value }),
    });
    status.value = 'Access roles saved.';
    emit('refresh');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2 class="panel-title">Dashboard Access</h2>
      <span class="badge">{{ bootstrap.accessRoles.length }}</span>
    </div>
    <div class="panel-body grid">
      <div v-if="status" class="status">{{ status }}</div>
      <div v-if="error" class="error">{{ error }}</div>

      <div>
        <div class="label">Current roles</div>
        <p class="muted">{{ selectedNames.length ? selectedNames.join(', ') : 'Manage Server only' }}</p>
      </div>

      <form v-if="bootstrap.guild.canManage" class="grid" @submit.prevent="save">
        <label class="field">
          <span class="label">Roles that can edit this dashboard</span>
          <select v-model="selectedRoleIds" class="select" multiple>
            <option v-for="role in bootstrap.metadata.roles" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
        </label>
        <div>
          <button class="button" type="submit" :disabled="saving">Save access roles</button>
        </div>
      </form>

      <p v-else class="muted">Only members with Discord Manage Server can change dashboard access.</p>
    </div>
  </section>
</template>
