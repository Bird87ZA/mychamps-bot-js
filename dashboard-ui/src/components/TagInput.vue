<script setup lang="ts">
import { shallowRef } from 'vue';

const model = defineModel<string[]>({ default: () => [] });
const props = defineProps<{
  placeholder?: string;
}>();

const draft = shallowRef('');

function addDraft(): void {
  const values = draft.value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return;
  }

  const existing = new Set(model.value.map((value) => value.toLowerCase()));
  model.value = [
    ...model.value,
    ...values.filter((value) => {
      const key = value.toLowerCase();
      if (existing.has(key)) {
        return false;
      }
      existing.add(key);
      return true;
    }),
  ];
  draft.value = '';
}

function removeTag(tag: string): void {
  model.value = model.value.filter((value) => value !== tag);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    addDraft();
    return;
  }

  if (event.key === 'Backspace' && !draft.value && model.value.length > 0) {
    model.value = model.value.slice(0, -1);
  }
}
</script>

<template>
  <div class="tag-input">
    <span v-for="tag in model" :key="tag" class="tag-pill">
      {{ tag }}
      <button
        type="button"
        class="tag-remove"
        :aria-label="`Remove ${tag}`"
        @click="removeTag(tag)"
      >
        x
      </button>
    </span>
    <input
      v-model="draft"
      class="tag-field"
      :placeholder="model.length ? '' : props.placeholder"
      @keydown="handleKeydown"
      @blur="addDraft"
    />
  </div>
</template>
