<template>
    <fieldset class="step-block">
        <legend class="step-header">
            {{ stepNumber }}.
            {{
                showItemDetailsSelects
                    ? $__("Select pickup location and item type or item")
                    : showPickupLocationSelect
                      ? $__("Select pickup location")
                      : ""
            }}
        </legend>

        <div
            v-if="showPickupLocationSelect || showItemDetailsSelects"
            class="form-group"
        >
            <label for="pickup_library_id">{{ $__("Pickup location") }}</label>
            <v-select
                v-model="selectedPickupLibraryId"
                :placeholder="$__('Select a pickup location')"
                :options="constrainedPickupLocations"
                label="name"
                :reduce="(l: PickupLocation) => l.library_id"
                :loading="loading.pickupLocations"
                :clearable="true"
                :disabled="selectsDisabled"
                :input-id="'pickup_library_id'"
            >
                <template #no-options>
                    {{ $__("No pickup locations available.") }}
                </template>
                <template #spinner>
                    <span class="sr-only">{{ $__("Loading...") }}</span>
                </template>
            </v-select>
            <span
                v-if="
                    constrainedFlags.pickupLocations &&
                    (showPickupLocationSelect || showItemDetailsSelects)
                "
                class="badge badge-warning ml-2"
            >
                {{ $__("Options updated") }}
                <span class="ml-1"
                    >({{ pickupLocationsTotal - pickupLocationsFilteredOut }}/{{
                        pickupLocationsTotal
                    }})</span
                >
            </span>
        </div>

        <div v-if="showItemDetailsSelects" class="form-group">
            <label for="booking_itemtype">{{ $__("Item type") }}</label>
            <v-select
                v-model="selectedItemtypeId"
                :options="constrainedItemTypes"
                label="description"
                :reduce="(t: ItemType) => t.item_type_id"
                :clearable="true"
                :disabled="selectsDisabled"
                :input-id="'booking_itemtype'"
            >
                <template #no-options>
                    {{ $__("No item types available.") }}
                </template>
            </v-select>
            <span
                v-if="constrainedFlags.itemTypes"
                class="badge badge-warning ml-2"
                >{{ $__("Options updated") }}</span
            >
        </div>

        <div v-if="showItemDetailsSelects" class="form-group">
            <label for="booking_item_id">{{ $__("Item") }}</label>
            <v-select
                v-model="selectedItemId"
                :placeholder="$__('Any item')"
                :options="constrainedBookableItems"
                label="external_id"
                :reduce="(i: BookableItem) => i.item_id"
                :clearable="true"
                :loading="loading.bookableItems"
                :disabled="selectsDisabled"
                :input-id="'booking_item_id'"
            >
                <template #no-options>
                    {{ $__("No items available.") }}
                </template>
                <template #spinner>
                    <span class="sr-only">{{ $__("Loading...") }}</span>
                </template>
            </v-select>
            <span
                v-if="constrainedFlags.bookableItems"
                class="badge badge-warning ml-2"
            >
                {{ $__("Options updated") }}
                <span class="ml-1"
                    >({{ bookableItemsTotal - bookableItemsFilteredOut }}/{{
                        bookableItemsTotal
                    }})</span
                >
            </span>
        </div>
    </fieldset>
</template>

<script setup lang="ts">
import { computed } from "vue";
import vSelect from "vue-select";
import { useBookingStore } from "../../stores/bookings";
import { storeToRefs } from "pinia";
import type {
    BookableItem,
    PickupLocation,
    PatronOption,
    Id,
    ItemType,
} from "./types/bookings";

const props = withDefaults(
    defineProps<{
        stepNumber: number;
        showItemDetailsSelects?: boolean;
        showPickupLocationSelect?: boolean;
        selectedPatron?: PatronOption | null;
        patronRequired?: boolean;
        detailsEnabled?: boolean;
        pickupLibraryId?: string | null;
        itemtypeId?: Id | null;
        itemId?: Id | null;
    }>(),
    {
        showItemDetailsSelects: false,
        showPickupLocationSelect: false,
        selectedPatron: null,
        patronRequired: false,
        detailsEnabled: true,
        pickupLibraryId: null,
        itemtypeId: null,
        itemId: null,
    }
);

const emit = defineEmits<{
    (e: "update:pickup-library-id", value: string | null): void;
    (e: "update:itemtype-id", value: Id | null): void;
    (e: "update:item-id", value: Id | null): void;
}>();

const store = useBookingStore();
const {
    loading,
    constrainedPickupLocations,
    constrainedItemTypes,
    constrainedBookableItems,
    constrainedFlags,
    pickupLocationsTotal,
    pickupLocationsFilteredOut,
    bookableItemsTotal,
    bookableItemsFilteredOut,
} = storeToRefs(store);

const selectedPickupLibraryId = computed({
    get: () => props.pickupLibraryId,
    set: (value: string | null) => emit("update:pickup-library-id", value),
});

const selectedItemtypeId = computed({
    get: () => props.itemtypeId,
    set: (value: Id | null) => emit("update:itemtype-id", value),
});

const selectedItemId = computed({
    get: () => props.itemId,
    set: (value: Id | null) => emit("update:item-id", value),
});

const selectsDisabled = computed(
    () =>
        !props.detailsEnabled || (!props.selectedPatron && props.patronRequired)
);
</script>

<style scoped>
.form-group {
    margin-bottom: var(--booking-space-lg);
}

.badge {
    font-size: var(--booking-text-xs);
}

.badge-warning {
    background-color: var(--booking-warning-bg);
    color: var(--booking-neutral-600);
}
</style>
