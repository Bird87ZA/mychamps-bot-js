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
          <svg
            class="brand-mark"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 164 164"
            aria-hidden="true"
          >
            <path
              d="M0,40.539H52.517L64.494,57.124s7.3,10.135,19.348,10.135h26.719L91.214,39.618H53.438S38.268,12.9,22.112,12.9H0v27.64ZM12.9,78.315H71.865l12.9,17.506S93.177,107.8,105.955,107.8H136.36L114.247,76.472H71.865S54.131,46.989,37.775,46.989H12.9V78.315Zm18.427,40.539H94.9l13.82,19.348s9.032,12.9,23.034,12.9H164l-23.955-34.09H94.9S75.714,85.685,59.888,85.685H31.326v33.169Z"
            />
          </svg>
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
          <p class="muted">
            Sign in with Discord to manage servers where you can configure MyChamps Bot.
          </p>
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
