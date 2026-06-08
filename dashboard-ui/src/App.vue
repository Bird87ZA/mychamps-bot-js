<script setup lang="ts">
import { onMounted } from 'vue';
import { dashboardUrl } from './api';
import ServerList from './components/ServerList.vue';
import ServerDashboard from './components/ServerDashboard.vue';
import { useDashboard } from './composables/useDashboard';

const dashboard = useDashboard();

onMounted(() => {
  dashboard.initialize();
});

async function refreshAll() {
  await dashboard.loadServers();
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <div class="brand-mark">MC</div>
          <div>MyChamps Bot</div>
        </div>
        <div v-if="dashboard.user.value" class="user-chip">
          <img
            v-if="dashboard.user.value.avatarUrl"
            class="avatar"
            :src="dashboard.user.value.avatarUrl"
            :alt="dashboard.user.value.displayName"
          />
          <span>{{ dashboard.user.value.displayName }}</span>
          <button class="button secondary" type="button" @click="dashboard.logout">Logout</button>
        </div>
      </div>
    </header>

    <main class="main">
      <div v-if="dashboard.error.value" class="error">{{ dashboard.error.value }}</div>

      <section v-if="dashboard.loading.value && !dashboard.bootstrap.value" class="panel">
        <div class="panel-body muted">Loading dashboard...</div>
      </section>

      <section v-else-if="!dashboard.authenticated.value" class="panel">
        <div class="panel-header">
          <h1 class="panel-title">Discord Login</h1>
        </div>
        <div class="panel-body grid">
          <p class="muted">Sign in with Discord to manage servers where you can configure MyChamps Bot.</p>
          <div>
            <a class="button" :href="dashboardUrl('/auth/discord')">Continue with Discord</a>
          </div>
        </div>
      </section>

      <ServerList
        v-else-if="!dashboard.selectedGuildId.value || !dashboard.bootstrap.value"
        :manageable-servers="dashboard.manageableServers.value"
        :other-servers="dashboard.otherServers.value"
        :loading="dashboard.loading.value"
        @select-server="dashboard.selectServer"
        @refresh="refreshAll"
      />

      <ServerDashboard
        v-else
        :bootstrap="dashboard.bootstrap.value"
        :loading="dashboard.loading.value"
        @back="
          dashboard.selectedGuildId.value = '';
          dashboard.bootstrap.value = null;
          history.pushState({}, '', dashboardUrl('/'));
        "
        @refresh="dashboard.loadBootstrap"
      />
    </main>
  </div>
</template>
