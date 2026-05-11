<template>
    <fieldset class="step-block">
        <legend class="step-header">
            {{ stepNumber }}.
            {{ $__("Select Patron") }}
        </legend>
        <PatronSearchSelect
            v-model="selectedPatron"
            :label="$__('Patron')"
            :placeholder="$__('Search for a patron')"
        >
            <template #no-options="{ hasSearched }">
                {{
                    hasSearched
                        ? $__("No patrons found.")
                        : $__("Type to search for patrons.")
                }}
            </template>
            <template #spinner>
                <span class="sr-only">{{ $__("Searching...") }}</span>
            </template>
        </PatronSearchSelect>
    </fieldset>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PatronSearchSelect from "./PatronSearchSelect.vue";
import type { PatronOption } from "./types/bookings";

const props = defineProps<{
    stepNumber: number;
    modelValue: PatronOption | null;
}>();

const emit = defineEmits<{
    (e: "update:modelValue", value: PatronOption | null): void;
}>();

const selectedPatron = computed({
    get: () => props.modelValue,
    set: (value: PatronOption | null) => emit("update:modelValue", value),
});
</script>
