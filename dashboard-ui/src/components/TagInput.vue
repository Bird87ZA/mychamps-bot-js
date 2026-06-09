<script setup lang="ts">
import { computed, shallowRef } from 'vue';

const model = defineModel<string[]>({ default: () => [] });
const props = defineProps<{
  options?: string[];
  placeholder?: string;
}>();

const draft = shallowRef('');
const suggestions = computed(() => {
  const query = draft.value.trim().toLowerCase();
  const selected = new Set(model.value.map((value) => value.toLowerCase()));

  if (!query) {
    return [];
  }

  return (props.options ?? [])
    .filter((option) => {
      const normalized = option.toLowerCase();
      return normalized.includes(query) && !selected.has(normalized);
    })
    .slice(0, 8);
});

function addDraft(): void {
  const values = draft.value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return;
  }

  addTags(values);
  draft.value = '';
}

function addTags(values: string[]): void {
  const existing = new Set(model.value.map((value) => value.toLowerCase()));
  const additions = values.filter((value) => {
    const key = value.toLowerCase();
    if (existing.has(key)) {
      return false;
    }
    existing.add(key);
    return true;
  });

  if (additions.length > 0) {
    model.value = [...model.value, ...additions];
  }
}

function addSuggestion(option: string): void {
  addTags([option]);
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
  <div class="tag-input-wrap">
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
    <div v-if="suggestions.length > 0" class="tag-suggestions">
      <button
        v-for="option in suggestions"
        :key="option"
        type="button"
        class="tag-suggestion"
        @mousedown.prevent="addSuggestion(option)"
      >
        {{ option }}
      </button>
    </div>
  </div>
</template>
