<script setup lang="ts">
import { computed } from 'vue';
import type { DiscordChannelOption } from '../types';

const model = defineModel<string>({ default: '' });
const props = defineProps<{
  channels: DiscordChannelOption[];
  categories: DiscordChannelOption[];
  excludeIds?: string[];
  required?: boolean;
}>();

const categoryNames = computed(
  () => new Map(props.categories.map((category) => [category.id, category.name])),
);
const visibleChannels = computed(() => {
  const excluded = new Set(props.excludeIds ?? []);
  return props.channels.filter(
    (channel) => !excluded.has(channel.id) || channel.id === model.value,
  );
});
const groupedChannels = computed(() => {
  const groups = new Map<string, DiscordChannelOption[]>();

  for (const channel of visibleChannels.value) {
    const key = channel.parentId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), channel]);
  }

  return Array.from(groups.entries())
    .map(([categoryId, channels]) => ({
      categoryId,
      label: categoryId
        ? (categoryNames.value.get(categoryId) ?? 'Unknown Category')
        : 'No Category',
      channels: channels.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.categoryId === '') {
        return 1;
      }
      if (b.categoryId === '') {
        return -1;
      }

      return a.label.localeCompare(b.label);
    });
});
</script>

<template>
  <select v-model="model" class="select" :required="required">
    <option value="">Select channel...</option>
    <optgroup v-for="group in groupedChannels" :key="group.categoryId" :label="group.label">
      <option v-for="channel in group.channels" :key="channel.id" :value="channel.id">
        #{{ channel.name }}
      </option>
    </optgroup>
  </select>
</template>
