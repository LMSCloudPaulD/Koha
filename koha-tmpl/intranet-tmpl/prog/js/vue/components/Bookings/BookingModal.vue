<template>
    <div ref="modalElement" class="modal fade" tabindex="-1" role="dialog">
        <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h1 class="modal-title fs-5">
                        {{ modalTitle }}
                    </h1>
                    <button
                        type="button"
                        class="btn-close"
                        aria-label="Close"
                        @click="handleClose"
                    ></button>
                </div>
                <div class="modal-body booking-modal-body">
                    <form
                        id="form-booking"
                        :action="submitUrl"
                        method="post"
                        @submit.prevent="handleSubmit"
                    >
                        <KohaAlert
                            :show="showCapacityWarning"
                            variant="warning"
                            :message="zeroCapacityMessage"
                        />
                        <BookingPatronStep
                            v-if="showPatronSelect"
                            v-model="bookingPatron"
                            :step-number="stepNumber.patron"
                        />
                        <hr
                            v-if="
                                showPatronSelect ||
                                showItemDetailsSelects ||
                                showPickupLocationSelect
                            "
                        />
                        <BookingDetailsStep
                            v-if="
                                showItemDetailsSelects ||
                                showPickupLocationSelect
                            "
                            :step-number="stepNumber.details"
                            :details-enabled="readiness.dataReady"
                            :show-item-details-selects="showItemDetailsSelects"
                            :show-pickup-location-select="
                                showPickupLocationSelect
                            "
                            :selected-patron="bookingPatron"
                            :patron-required="showPatronSelect"
                            v-model:pickup-library-id="pickupLibraryId"
                            v-model:itemtype-id="bookingItemtypeId"
                            v-model:item-id="bookingItemId"
                        />
                        <hr
                            v-if="
                                showItemDetailsSelects ||
                                showPickupLocationSelect
                            "
                        />
                        <BookingPeriodStep
                            :step-number="stepNumber.period"
                            :calendar-enabled="readiness.isCalendarReady"
                            :error-message="store.uiError.message"
                            :has-selected-dates="selectedDateRange?.length > 0"
                            @clear-dates="clearDateRange"
                        />
                    </form>
                </div>
                <div class="modal-footer">
                    <div class="d-flex gap-2">
                        <button
                            class="btn btn-primary"
                            :disabled="loading.submit || !isSubmitReady"
                            type="submit"
                            form="form-booking"
                        >
                            {{ submitLabel }}
                        </button>
                        <button
                            class="btn btn-secondary ml-2"
                            @click.prevent="handleClose"
                        >
                            {{ $__("Cancel") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { BookingDate } from "./lib/booking/BookingDate.js";
import {
    computed,
    inject,
    ref,
    reactive,
    watch,
    watchEffect,
    onMounted,
    onUnmounted,
} from "vue";
import BookingPatronStep from "./BookingPatronStep.vue";
import BookingDetailsStep from "./BookingDetailsStep.vue";
import BookingPeriodStep from "./BookingPeriodStep.vue";
import { $__ } from "../../i18n";
import { processApiError } from "../../utils/apiErrors.js";
import { storeToRefs } from "pinia";
import { useBookingStore } from "../../stores/bookings";
import { updateExternalDependents } from "./lib/adapters/external-dependents.js";
import { Modal } from "bootstrap";
import { appendHiddenInputs } from "./lib/adapters/form.js";
import { calculateStepNumbers } from "./lib/ui/steps.js";
import { normalizeIdType } from "./lib/booking/id-utils.js";
import KohaAlert from "../KohaAlert.vue";
import type { Id, CirculationRule } from "./types/bookings";

type DateRangeConstraintType =
    | "issuelength"
    | "issuelength_with_renewals"
    | "custom"
    | null;
type SubmitType = "api" | "form-submission";

const props = withDefaults(
    defineProps<{
        open?: boolean;
        size?: string;
        title?: string;
        biblionumber: string | number;
        bookingId?: Id | null;
        itemId?: Id | null;
        patronId?: Id | null;
        pickupLibraryId?: string | null;
        startDate?: string | null;
        endDate?: string | null;
        itemtypeId?: Id | null;
        showPatronSelect?: boolean;
        showItemDetailsSelects?: boolean;
        showPickupLocationSelect?: boolean;
        submitType?: SubmitType;
        submitUrl?: string;
        dateRangeConstraint?: DateRangeConstraintType;
        customDateRangeFormula?:
            | ((rules: CirculationRule) => number | null)
            | null;
        opacDefaultBookingLibraryEnabled?: boolean | string | null;
        opacDefaultBookingLibrary?: string | null;
    }>(),
    {
        open: false,
        size: "lg",
        title: "",
        bookingId: null,
        itemId: null,
        patronId: null,
        pickupLibraryId: null,
        startDate: null,
        endDate: null,
        itemtypeId: null,
        showPatronSelect: false,
        showItemDetailsSelects: false,
        showPickupLocationSelect: false,
        submitType: "api",
        submitUrl: "",
        dateRangeConstraint: null,
        customDateRangeFormula: null,
        opacDefaultBookingLibraryEnabled: null,
        opacDefaultBookingLibrary: null,
    }
);

const emit = defineEmits<{
    (e: "close"): void;
}>();

type BookingStore = ReturnType<typeof useBookingStore>;
const store = inject<BookingStore>("bookingStore") as BookingStore;

// Hand the modal-level constraint configuration to the store so the
// availability section can compute maxBookingPeriod / constraintOptions
// and feed them into the calendar maps without each child step having
// to thread the props through. Wrapped in watchEffect so prop changes
// propagate (rare in practice for these stable, mount-time inputs,
// but cheap to do correctly).
watchEffect(() => {
    store.configureConstraints({
        dateRangeConstraint: props.dateRangeConstraint,
        customDateRangeFormula: props.customDateRangeFormula,
    });
});

// External inputs the auto-react watchers in the effects section
// depend on. Captured once via a configure call so the store stays
// self-driving once the modal is mounted.
watchEffect(() => {
    store.configureExternalInputs({
        biblionumber: props.biblionumber,
        opacDefaultBookingLibraryEnabled:
            props.opacDefaultBookingLibraryEnabled,
        opacDefaultBookingLibrary: props.opacDefaultBookingLibrary,
    });
});

const modalElement = ref<HTMLElement | null>(null);
let bsModal: InstanceType<typeof Modal> | null = null;

const {
    bookingId,
    bookingItemId,
    bookingPatron,
    bookingItemtypeId,
    pickupLibraryId,
    selectedDateRange,
    bookableItems,
    loading,
} = storeToRefs(store);

const modalState = reactive({
    isOpen: props.open,
});

const modalTitle = computed(
    () =>
        props.title ||
        (bookingId.value ? $__("Edit booking") : $__("Place booking"))
);

const showPickupLocationSelect = computed(() => {
    if (props.opacDefaultBookingLibraryEnabled !== null) {
        const enabled =
            props.opacDefaultBookingLibraryEnabled === true ||
            String(props.opacDefaultBookingLibraryEnabled) === "1";
        return !enabled;
    }
    return props.showPickupLocationSelect;
});

// Hand the modal-level UI flags to the store; the validation
// section's canSubmit / capacity-guard getters read them.
watchEffect(() => {
    store.configureUi({
        showPatronSelect: props.showPatronSelect,
        showItemDetailsSelects: props.showItemDetailsSelects,
        showPickupLocationSelect: showPickupLocationSelect.value,
    });
});

const { zeroCapacityMessage, showCapacityWarning, readiness, isSubmitReady } =
    storeToRefs(store);

const stepNumber = computed(() => {
    return calculateStepNumbers(
        props.showPatronSelect,
        props.showItemDetailsSelects,
        showPickupLocationSelect.value
    );
});

const submitLabel = computed(() =>
    bookingId.value ? $__("Update booking") : $__("Place booking")
);

const isFormSubmission = computed(() => props.submitType === "form-submission");

watch(
    () => props.open,
    val => {
        if (val) {
            resetModalState();
            bsModal?.show();
        }
    }
);

watch(
    () => modalState.isOpen,
    async open => {
        if (!open) {
            return;
        }

        const biblionumber = props.biblionumber;
        if (!biblionumber) return;

        bookingId.value = props.bookingId;

        // Restore the booking's pickup library before any fetch resolves:
        // the default-library watcher only assigns when none is set, so
        // seeding it here keeps an edited booking's pickup location from
        // being silently replaced by the patron's home library.
        if (props.pickupLibraryId) {
            pickupLibraryId.value = props.pickupLibraryId;
        }

        try {
            await Promise.all([
                store.fetchBookableItems(biblionumber),
                store.fetchBookings(biblionumber),
                store.fetchCheckouts(biblionumber),
            ]);

            store.deriveItemTypesFromBookableItems();

            if (props.patronId) {
                const patron = await store.fetchPatron(props.patronId);
                await store.fetchPickupLocations(biblionumber, props.patronId);

                bookingPatron.value = patron;
            }

            bookingItemId.value =
                props.itemId != null
                    ? normalizeIdType(
                          bookableItems.value?.[0]?.item_id,
                          props.itemId
                      )
                    : null;
            if (props.itemtypeId) {
                bookingItemtypeId.value = props.itemtypeId;
            }

            if (props.startDate && props.endDate) {
                selectedDateRange.value = [
                    BookingDate.from(props.startDate).toISO(),
                    BookingDate.from(props.endDate).toISO(),
                ];
            }
        } catch (error) {
            console.error("Error initializing booking modal:", error);
            store.setUiError(processApiError(error), "api");
        }
    }
);

function clearErrors() {
    store.clearAllErrors();
}

function resetModalState() {
    bookingPatron.value = null;
    pickupLibraryId.value = null;
    bookingItemtypeId.value = null;
    bookingItemId.value = null;
    selectedDateRange.value = [];
    clearErrors();
}

function clearDateRange() {
    selectedDateRange.value = [];
    clearErrors();
}

function handleClose() {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
    bsModal?.hide();
}

async function handleSubmit(event: Event) {
    const selectedDates = selectedDateRange.value;

    if (!selectedDates || selectedDates.length === 0) {
        store.setUiError(
            $__("Please select a valid date range"),
            "invalid_date_range"
        );
        return;
    }

    // Match upstream behavior: start date at start of day, end date at end of day
    const start = selectedDates[0];
    const endDateRaw =
        selectedDates.length >= 2 ? selectedDates[1] : selectedDates[0];
    // Apply endOf("day") to end date to match upstream storage format (23:59:59)
    const end = BookingDate.from(endDateRaw, { preserveTime: true })
        .toDayjs()
        .endOf("day")
        .toISOString();
    const bookingData: Record<string, unknown> = {
        booking_id: props.bookingId ?? undefined,
        start_date: start,
        end_date: end,
        pickup_library_id: pickupLibraryId.value,
        biblio_id: props.biblionumber,
        patron_id: bookingPatron.value?.patron_id,
    };

    const itemAssignment = store.resolveItemForPeriod({
        start,
        end,
        bookingId: props.bookingId,
    });
    if (!itemAssignment.ok) return;
    if (itemAssignment.item_id != null) {
        bookingData.item_id = itemAssignment.item_id;
    } else {
        bookingData.itemtype_id = itemAssignment.itemtype_id;
    }

    if (isFormSubmission.value) {
        const form = event.target as HTMLFormElement;
        const csrfToken = document.querySelector(
            '[name="csrf_token"]'
        ) as HTMLInputElement | null;

        appendHiddenInputs(form, [
            ...Object.entries(bookingData),
            [csrfToken?.name, csrfToken?.value],
            ["op", "cud-add"],
        ]);
        form.submit();
        return;
    }

    try {
        const result = await store.saveOrUpdateBooking(bookingData);
        updateExternalDependents(
            result,
            bookingPatron.value,
            !!props.bookingId
        );
        handleClose();
    } catch (errorObj) {
        store.setUiError(processApiError(errorObj), "api");
    }
}

onMounted(() => {
    if (modalElement.value) {
        bsModal = new Modal(modalElement.value, {
            backdrop: "static",
            keyboard: false,
        });
        modalElement.value.addEventListener("hidden.bs.modal", () => {
            modalState.isOpen = false;
            emit("close");
            resetModalState();
        });
        modalElement.value.addEventListener("shown.bs.modal", () => {
            modalState.isOpen = true;
        });
    }
});

onUnmounted(() => {
    bsModal?.dispose();
});
</script>

<style>
/* Design System: CSS Custom Properties */
:root {
    /* Success colors for constraint highlighting */
    --booking-success-hue: 134;
    --booking-success-bg: hsl(var(--booking-success-hue), 40%, 90%);
    --booking-success-bg-hover: hsl(var(--booking-success-hue), 35%, 85%);
    --booking-success-border: hsl(var(--booking-success-hue), 70%, 40%);
    --booking-success-border-hover: hsl(var(--booking-success-hue), 75%, 30%);
    --booking-success-text: hsl(var(--booking-success-hue), 80%, 20%);
    --booking-constraint-marker: hsl(var(--booking-success-hue), 61%, 41%);

    /* Border width */
    --booking-border-width: 1px;

    /* Booking markers */
    --booking-marker-size: max(4px, 0.25em);
    --booking-marker-grid-gap: 0.25rem;
    --booking-marker-grid-offset: -0.75rem;

    /* Color hues */
    --booking-warning-hue: 45;
    --booking-danger-hue: 354;
    --booking-info-hue: 195;
    --booking-neutral-hue: 210;
    --booking-holiday-hue: 0;

    /* Colors derived from hues */
    --booking-warning-bg: hsl(var(--booking-warning-hue), 100%, 85%);
    --booking-warning-bg-hover: hsl(var(--booking-warning-hue), 100%, 70%);
    --booking-neutral-100: hsl(var(--booking-neutral-hue), 15%, 92%);
    --booking-neutral-300: hsl(var(--booking-neutral-hue), 15%, 75%);
    --booking-neutral-500: hsl(var(--booking-neutral-hue), 10%, 55%);
    --booking-neutral-600: hsl(var(--booking-neutral-hue), 10%, 45%);
    --booking-holiday-bg: hsl(var(--booking-holiday-hue), 0%, 85%);
    --booking-holiday-text: hsl(var(--booking-holiday-hue), 0%, 40%);

    /* Spacing Scale */
    --booking-space-xs: 0.125rem;
    --booking-space-sm: 0.25rem; /* 4px */
    --booking-space-md: 0.5rem; /* 8px */
    --booking-space-lg: 1rem; /* 16px */
    --booking-space-xl: 1.5rem; /* 24px */
    --booking-space-2xl: 2rem; /* 32px */

    /* Typography Scale */
    --booking-text-xs: 0.7rem;
    --booking-text-sm: 0.8125rem;
    --booking-text-base: 1rem;
    --booking-text-lg: 1.1rem;
    --booking-text-xl: 1.3rem;
    --booking-text-2xl: 2rem;

    /* Border radius */
    --booking-border-radius-sm: 0.25rem;
    --booking-border-radius-md: 0.5rem;
    --booking-border-radius-full: 50%;

    /* Layout */
    --booking-modal-max-height: calc(100vh - var(--booking-space-2xl));
    --booking-input-min-width: 15rem;

    /* Animation */
    --booking-transition-fast: 0.15s ease-in-out;
}

/* Constraint Highlighting Component */
.flatpickr-calendar .booking-constrained-range-marker {
    background-color: var(--booking-success-bg) !important;
    border: var(--booking-border-width) solid var(--booking-success-border) !important;
    color: var(--booking-success-text) !important;
}

.flatpickr-calendar .flatpickr-day.booking-constrained-range-marker {
    background-color: var(--booking-success-bg) !important;
    border-color: var(--booking-success-border) !important;
    color: var(--booking-success-text) !important;
}

.flatpickr-calendar .flatpickr-day.booking-constrained-range-marker:hover {
    background-color: var(--booking-success-bg-hover) !important;
    border-color: var(--booking-success-border-hover) !important;
}

/* End Date Only Mode - Blocked Intermediate Dates */
.flatpickr-calendar .flatpickr-day.booking-intermediate-blocked {
    background-color: hsl(var(--booking-success-hue), 40%, 90%) !important;
    border-color: hsl(var(--booking-success-hue), 40%, 70%) !important;
    color: hsl(var(--booking-success-hue), 40%, 50%) !important;
    cursor: not-allowed !important;
    opacity: 0.7 !important;
}

/* Bold styling for end of loan and renewal period boundaries */
.flatpickr-calendar .flatpickr-day.booking-loan-boundary {
    font-weight: 700 !important;
}
.flatpickr-calendar .flatpickr-day.booking-intermediate-blocked:hover {
    background-color: hsl(var(--booking-success-hue), 40%, 85%) !important;
    border-color: hsl(var(--booking-success-hue), 40%, 60%) !important;
}

.booking-modal-body {
    padding: var(--booking-space-xl);
    overflow-y: auto;
    flex: 1 1 auto;
}

/* Form & Layout Components */
.booking-extended-attributes {
    list-style: none;
    padding: 0;
    margin: 0;
}

.booking-modal-body .step-block {
    margin-bottom: var(--booking-space-lg);
}

.booking-modal-body .step-header {
    font-weight: 600;
    font-size: var(--booking-text-lg);
    margin-bottom: calc(var(--booking-space-lg) * 0.75);
    color: var(--booking-neutral-600);
}

.booking-modal-body hr {
    border: none;
    border-top: var(--booking-border-width) solid var(--booking-neutral-100);
    margin: var(--booking-space-2xl) 0;
}

/* Input Components */
.booking-flatpickr-input,
.flatpickr-input.booking-flatpickr-input {
    min-width: var(--booking-input-min-width);
    padding: calc(var(--booking-space-md) - var(--booking-space-xs))
        calc(var(--booking-space-md) + var(--booking-space-sm));
    border: var(--booking-border-width) solid var(--booking-neutral-300);
    border-radius: var(--booking-border-radius-sm);
    font-size: var(--booking-text-base);
    transition:
        border-color var(--booking-transition-fast),
        box-shadow var(--booking-transition-fast);
}

/* Calendar Legend Component */
.booking-modal-body .calendar-legend {
    margin-top: var(--booking-space-lg);
    margin-bottom: var(--booking-space-lg);
    font-size: var(--booking-text-sm);
    display: flex;
    align-items: center;
}

.booking-modal-body .calendar-legend .booking-marker-dot {
    width: calc(var(--booking-marker-size) * 2) !important;
    height: calc(var(--booking-marker-size) * 2) !important;
    margin-right: calc(var(--booking-space-sm) * 1.5);
    border: var(--booking-border-width) solid hsla(0, 0%, 0%, 0.15);
}

.booking-modal-body .calendar-legend .ml-3 {
    margin-left: var(--booking-space-lg);
}

/* === Date Picker & Marker System === */

.booking-date-picker {
    display: flex;
    align-items: stretch;
    width: 100%;
}

.booking-date-picker > .form-control {
    flex: 1 1 auto;
    min-width: 0;
    margin-bottom: 0;
}

.booking-date-picker-append {
    display: flex;
    margin-left: -1px;
}

.booking-date-picker-append .btn {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}

.booking-date-picker > .form-control:not(:last-child) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
}

/* External Library Integration */
.booking-modal-body .vs__selected {
    font-size: var(--vs-font-size);
    line-height: var(--vs-line-height);
}

.booking-constraint-info {
    margin-top: var(--booking-space-lg);
    margin-bottom: var(--booking-space-lg);
}

/* Booking Status Marker System */
.booking-marker-grid {
    position: relative;
    top: var(--booking-marker-grid-offset);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--booking-marker-grid-gap);
    width: fit-content;
    max-width: 90%;
    margin-left: auto;
    margin-right: auto;
    line-height: normal;
}

.booking-marker-item {
    display: inline-flex;
    align-items: center;
}

.booking-marker-dot {
    display: inline-block;
    width: var(--booking-marker-size);
    height: var(--booking-marker-size);
    border-radius: var(--booking-border-radius-full);
    vertical-align: middle;
}

.booking-marker-count {
    font-size: var(--booking-text-xs);
    margin-left: var(--booking-space-xs);
    line-height: 1;
    font-weight: normal;
    color: var(--booking-neutral-600);
}

/* Status Indicator Colors */
.booking-marker-dot--booked {
    background: var(--booking-warning-bg);
}

.booking-marker-dot--checked-out {
    background: hsl(var(--booking-danger-hue), 60%, 85%);
}

.booking-marker-dot--lead {
    background: hsl(var(--booking-info-hue), 60%, 85%);
}

.booking-marker-dot--trail {
    background: var(--booking-warning-bg);
}

.booking-marker-dot--holiday {
    background: var(--booking-holiday-bg);
}

.booking-marker-dot--constraint {
    background: var(--booking-constraint-marker);
}

/* Hover States with Transparency */
.flatpickr-day.booking-day--hover-lead {
    background-color: hsl(var(--booking-info-hue), 60%, 85%, 0.2) !important;
}

.flatpickr-day.booking-day--hover-trail {
    background-color: hsl(
        var(--booking-warning-hue),
        100%,
        70%,
        0.2
    ) !important;
}

/* Hover feedback status bar (inside flatpickr calendarContainer) */
.booking-hover-feedback {
    padding: 0 0.75rem;
    max-height: 0;
    min-height: 0;
    opacity: 0;
    overflow: hidden;
    margin-top: 0;
    margin-bottom: 0;
    border-radius: 0 0 var(--booking-border-radius-sm)
        var(--booking-border-radius-sm);
    font-size: var(--booking-text-sm);
    text-align: center;
    transition:
        max-height 100ms ease,
        opacity 100ms ease,
        padding 100ms ease,
        margin-top 100ms ease,
        background-color 100ms ease,
        color 100ms ease;
}

.booking-hover-feedback--visible {
    padding: 0.5rem 0.75rem;
    margin-top: 0.5rem;
    min-height: 1.25rem;
    max-height: 10em;
    opacity: 1;
}

.booking-hover-feedback--info {
    color: hsl(var(--booking-info-hue), 80%, 20%);
    background-color: hsl(var(--booking-info-hue), 40%, 93%);
}

.booking-hover-feedback--danger {
    color: hsl(var(--booking-danger-hue), 80%, 20%);
    background-color: hsl(var(--booking-danger-hue), 40%, 93%);
}

.booking-hover-feedback--warning {
    color: hsl(var(--booking-warning-hue), 80%, 20%);
    background-color: hsl(var(--booking-warning-hue), 100%, 93%);
}
</style>
