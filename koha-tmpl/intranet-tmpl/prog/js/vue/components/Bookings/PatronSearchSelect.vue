<template>
    <div class="form-group">
        <label for="booking_patron">{{ label }}</label>
        <v-select
            v-model="selectedPatron"
            :options="patronOptions"
            :filterable="false"
            :loading="loading.patrons"
            :placeholder="placeholder"
            label="label"
            :clearable="true"
            :reset-on-blur="false"
            :reset-on-select="false"
            :input-id="'booking_patron'"
            @search="debouncedPatronSearch"
        >
            <template #option="option">
                <span>{{ option.label }}</span>
                <small
                    v-if="option._age != null || option._libraryName"
                    class="patron-option-meta"
                >
                    <span v-if="option._age != null" class="age_years">
                        {{ option._age }} {{ $__("years") }}
                    </span>
                    <span v-if="option._libraryName" class="ac-library">
                        {{ option._libraryName }}
                    </span>
                </small>
            </template>
            <template #no-options>
                <slot name="no-options" :has-searched="hasSearched"
                    >Sorry, no matching options.</slot
                >
            </template>
            <template #spinner>
                <slot name="spinner">Loading...</slot>
            </template>
        </v-select>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import vSelect from "vue-select";
import "vue-select/dist/vue-select.css";
import { processApiError } from "../../utils/apiErrors.js";
import { useBookingStore } from "../../stores/bookings";
import { storeToRefs } from "pinia";
import { debounce } from "../../utils/functions.mjs";
import { PATRON_SEARCH_DEBOUNCE_MS } from "./lib/booking/constants.mjs";
import { managerLogger } from "./lib/booking/logger.mjs";
import { $__ } from "../../i18n";
import type { PatronOption } from "./types/bookings";

const props = withDefaults(
    defineProps<{
        modelValue: PatronOption | null;
        label: string;
        placeholder?: string;
    }>(),
    {
        modelValue: null,
        placeholder: "",
    }
);

const emit = defineEmits<{
    (e: "update:modelValue", value: PatronOption | null): void;
}>();

const store = useBookingStore();
const { loading } = storeToRefs(store);
const patronOptions = ref<PatronOption[]>([]);
const hasSearched = ref(false);

const selectedPatron = computed({
    get: () => props.modelValue,
    set: (value: PatronOption | null) => emit("update:modelValue", value),
});

const onPatronSearch = async (search: string): Promise<void> => {
    if (!search || search.length < 3) {
        hasSearched.value = false;
        patronOptions.value = [];
        return;
    }

    hasSearched.value = true;
    try {
        const data = await store.fetchPatrons(search);
        patronOptions.value = data as PatronOption[];
    } catch (error) {
        const msg = processApiError(error);
        console.error("Error searching patrons:", msg);
        try {
            store.setUiError(msg, "api");
        } catch (e) {
            managerLogger.warn(
                "PatronSearchSelect",
                "Failed to set error in store",
                e
            );
        }
        patronOptions.value = [];
    }
};

const debouncedPatronSearch = debounce(
    onPatronSearch,
    PATRON_SEARCH_DEBOUNCE_MS
);

defineExpose({
    selectedPatron,
    patronOptions,
    loading: computed(() => loading.value.patrons),
    hasSearched,
    debouncedPatronSearch,
});
</script>

<style scoped>
.patron-option-meta {
    margin-left: var(--booking-space-md);
    opacity: 0.75;
}

.patron-option-meta .ac-library {
    margin-left: var(--booking-space-sm);
    padding: var(--booking-space-xs) var(--booking-space-md);
    border-radius: var(--booking-border-radius-sm);
    background-color: var(--booking-neutral-100);
}
</style>
