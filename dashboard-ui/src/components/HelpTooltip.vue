<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<template>
  <span class="help-tooltip">
    <button class="help-trigger" type="button" :aria-label="text">?</button>
    <span class="help-bubble" role="tooltip">{{ text }}</span>
  </span>
</template>
