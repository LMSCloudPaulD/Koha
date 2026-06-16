<template>
    <fieldset class="step-block">
        <legend class="step-header">
            {{ stepNumber }}.
            {{ $__("Select booking period") }}
        </legend>

        <div class="form-group">
            <label for="booking_period">{{ $__("Booking period") }}</label>
            <div class="booking-date-picker">
                <BookingFlatpickr
                    ref="pickerRef"
                    mode="range"
                    :model-value="pickerModelValue"
                    :viewport="initialViewport"
                    :min-date="minDate"
                    :disabled="composedDisabled"
                    :markers-by-date="markersByDate"
                    :marker-renderer="renderBookingMarkers"
                    :class-by-date="classByDate"
                    :range-preview-fn="rangePreviewFn"
                    :allow-input="false"
                    :input-disabled="!calendarEnabled"
                    :placeholder="$__('Booking period')"
                    input-class="booking-flatpickr-input form-control"
                    input-id="booking_period"
                    @update:model-value="store.setSelectedDates"
                    @update:viewport="onUpdateViewport"
                    @day-hover="onDayHover"
                    @select-attempt-blocked="onSelectAttemptBlocked"
                    @ready="onPickerReady"
                />
                <div class="booking-date-picker-append">
                    <button
                        type="button"
                        class="btn btn-outline-secondary"
                        :disabled="!calendarEnabled"
                        :title="$__('Clear selected dates')"
                        @click="clearDateRange"
                    >
                        <i class="fa fa-times" aria-hidden="true"></i>
                        <span class="sr-only">{{
                            $__("Clear selected dates")
                        }}</span>
                    </button>
                </div>
            </div>
        </div>

        <KohaAlert
            v-if="
                dateRangeConstraint &&
                (maxBookingPeriod === null || maxBookingPeriod > 0)
            "
            variant="info"
            extra-class="booking-constraint-info"
        >
            <small>
                <strong>{{ $__("Booking constraint active:") }}</strong>
                {{ constraintHelpText }}
            </small>
        </KohaAlert>

        <div class="calendar-legend" @mouseleave="hideTooltip">
            <span class="booking-marker-dot booking-marker-dot--booked"></span>
            {{ $__("Booked") }}
            <span
                class="booking-marker-dot booking-marker-dot--lead ml-3"
            ></span>
            {{ $__("Lead period") }}
            <span
                class="booking-marker-dot booking-marker-dot--trail ml-3"
            ></span>
            {{ $__("Trail period") }}
            <span
                class="booking-marker-dot booking-marker-dot--checked-out ml-3"
            ></span>
            {{ $__("Checked out") }}
            <span
                class="booking-marker-dot booking-marker-dot--holiday ml-3"
            ></span>
            {{ $__("Closed") }}
            <span
                v-if="dateRangeConstraint && hasSelectedDates"
                class="booking-marker-dot booking-marker-dot--constraint ml-3"
            ></span>
            <span v-if="dateRangeConstraint && hasSelectedDates" class="ml-1">
                {{ $__("Required end date") }}
            </span>
        </div>

        <div v-if="errorMessage" class="alert alert-danger mt-2">
            {{ errorMessage }}
        </div>
    </fieldset>
    <BookingTooltip
        :markers="tooltip.markers"
        :x="tooltip.x"
        :y="tooltip.y"
        :visible="tooltip.visible"
    />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import KohaAlert from "../KohaAlert.vue";
import BookingFlatpickr from "./BookingFlatpickr.vue";
import BookingTooltip from "./BookingTooltip.vue";
import { useBookingStore } from "../../stores/bookings";
import { storeToRefs } from "pinia";
import { $__ } from "../../i18n";
import { debounce } from "../../utils/functions.js";
import {
    HOLIDAY_EXTENSION_DEBOUNCE_MS,
    CLASS_BOOKING_DAY_HOVER_LEAD,
    CLASS_BOOKING_DAY_HOVER_TRAIL,
} from "./lib/booking/constants.js";
import {
    getBookingMarkersForDate,
    aggregateMarkersByType,
    buildMarkerGrid,
} from "./lib/booking/markers.js";
import { getDateFeedbackMessage } from "./lib/ui/hover-feedback.js";
import type { CalendarMarker } from "./types/bookings";

interface TooltipState {
    markers: CalendarMarker[];
    visible: boolean;
    x: number;
    y: number;
}

const props = withDefaults(
    defineProps<{
        stepNumber: number;
        calendarEnabled?: boolean;
        errorMessage?: string;
        hasSelectedDates?: boolean;
    }>(),
    {
        calendarEnabled: true,
        errorMessage: "",
        hasSelectedDates: false,
    }
);

const emit = defineEmits<{
    (e: "clear-dates"): void;
}>();

const store = useBookingStore();
const {
    bookableItems,
    bookingItemId,
    bookingId,
    selectedDateRange,
    circulationRules,
    holidays,
    pickupLibraryId,
    pickerModelValue,
    minDate,
    dateRangeConstraint,
    maxBookingPeriod,
    constraintOptions,
    disabledFn,
    disabledByDate,
    markersByDate,
    classByDate,
    loanBoundaryTimes,
    viewport,
} = storeToRefs(store);
// rangePreviewFn is a plain function returned by the composable, not a
// ref/computed, so storeToRefs would skip it; pull it off the store
// proxy directly. Pinia auto-binds it.
const rangePreviewFn = store.rangePreviewFn;

interface PickerExposed {
    clear: () => void;
    instance: () => unknown;
}
const pickerRef = ref<PickerExposed | null>(null);

const constraintHelpText = computed((): string => {
    if (!dateRangeConstraint.value) return "";
    const period = maxBookingPeriod.value;

    const baseMessages: Record<string, string> = {
        issuelength: period
            ? $__("Booking period limited to checkout length (%s days)").format(
                  period
              )
            : $__("Booking period limited to checkout length"),
        issuelength_with_renewals: period
            ? $__(
                  "Booking period limited to checkout length with renewals (%s days)"
              ).format(period)
            : $__("Booking period limited to checkout length with renewals"),
        default: period
            ? $__(
                  "Booking period limited by circulation rules (%s days)"
              ).format(period)
            : $__("Booking period limited by circulation rules"),
    };

    return baseMessages[dateRangeConstraint.value] || baseMessages.default;
});

const initialViewport = computed(() => {
    const v = pickerModelValue.value;
    const anchor = Array.isArray(v) ? v[0] : v;
    if (anchor instanceof Date) {
        return { year: anchor.getFullYear(), month: anchor.getMonth() };
    }
    return undefined;
});

// BookingFlatpickr accepts a (Date) => DisabledSpec | null function for `:disabled`.
// disabledFn carries the full validation logic (past dates, lead/trail,
// range overlap) but its boolean output loses severity. disabledByDate
// is a Map<YMD, DisabledSpec> that flags holidays as soft when an anchor
// is set so ranges can cross them. Hard validation wins; otherwise we
// surface the Map's severity (typically soft for holiday-with-anchor).
const composedDisabled = computed(() => {
    const fn = disabledFn.value;
    const map = disabledByDate.value;
    return (date: Date) => {
        if (fn(date)) {
            return { reason: $__("Unavailable"), severity: "hard" as const };
        }
        const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return map.get(ymd) ?? null;
    };
});

// Marker DOM rendering is booking-domain-specific (the .booking-marker-grid
// container with per-type dot/count children); BookingFlatpickr stays generic
// and delegates to this consumer-provided renderer.
function renderBookingMarkers(
    dayElem: HTMLElement,
    _markers: unknown,
    date: Date
): void {
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const markersForDots = getBookingMarkersForDate(
        store.unavailableByDate,
        ymd,
        bookableItems.value || []
    );
    if (markersForDots.length === 0) return;
    const aggregated = aggregateMarkersByType(markersForDots);
    const grid = buildMarkerGrid(aggregated);
    if (grid.hasChildNodes()) dayElem.appendChild(grid);
}

const tooltip = reactive<TooltipState>({
    markers: [],
    visible: false,
    x: 0,
    y: 0,
});

// Track the last hovered cell so we can strip lead/trail hover classes
// when the hover moves to a new cell. Mirrors the per-cell mouseout
// behavior the legacy `events.mjs` adapter implemented.
let lastHoverElement: HTMLElement | null = null;

function clearHoverClasses(el: HTMLElement | null): void {
    if (!el) return;
    el.classList.remove(
        CLASS_BOOKING_DAY_HOVER_LEAD,
        CLASS_BOOKING_DAY_HOVER_TRAIL
    );
}

function hideTooltip(): void {
    tooltip.visible = false;
    clearHoverClasses(lastHoverElement);
    lastHoverElement = null;
}

// Hover feedback bar: a contextual <div> appended inside flatpickr's
// calendarContainer that explains why a day is disabled or what the user
// can do next. Reuses the .booking-hover-feedback CSS shipped in
// BookingModal.vue. Hides are deferred one frame so rapid movement
// between adjacent days doesn't flicker.
let feedbackBar: HTMLDivElement | null = null;
let feedbackHideTimer: number | null = null;
let calendarContainer: HTMLElement | null = null;

type FeedbackVariant = "info" | "warning" | "danger";

function ensureFeedbackBar(container: HTMLElement): HTMLDivElement {
    let bar = container.querySelector<HTMLDivElement>(
        ".booking-hover-feedback"
    );
    if (!bar) {
        bar = document.createElement("div");
        bar.className = "booking-hover-feedback";
        bar.setAttribute("role", "status");
        bar.setAttribute("aria-live", "polite");
        container.appendChild(bar);
    }
    return bar;
}

function updateFeedbackBar(
    bar: HTMLDivElement,
    feedback: { message: string; variant: FeedbackVariant } | null
): void {
    if (!feedback) {
        if (feedbackHideTimer == null) {
            feedbackHideTimer = window.setTimeout(() => {
                feedbackHideTimer = null;
                bar.classList.remove(
                    "booking-hover-feedback--visible",
                    "booking-hover-feedback--info",
                    "booking-hover-feedback--warning",
                    "booking-hover-feedback--danger"
                );
            }, 16);
        }
        return;
    }
    if (feedbackHideTimer != null) {
        clearTimeout(feedbackHideTimer);
        feedbackHideTimer = null;
    }
    bar.textContent = feedback.message;
    bar.classList.remove(
        "booking-hover-feedback--info",
        "booking-hover-feedback--warning",
        "booking-hover-feedback--danger"
    );
    bar.classList.add(
        "booking-hover-feedback--visible",
        `booking-hover-feedback--${feedback.variant}`
    );
}

function onCalendarLeave(): void {
    if (feedbackBar) updateFeedbackBar(feedbackBar, null);
}

function onPickerReady(payload: { instance: unknown }): void {
    const inst = payload.instance as { calendarContainer?: HTMLElement };
    if (!inst?.calendarContainer) return;
    calendarContainer = inst.calendarContainer;
    feedbackBar = ensureFeedbackBar(calendarContainer);
    calendarContainer.addEventListener("mouseleave", onCalendarLeave);
}

onBeforeUnmount(() => {
    if (feedbackHideTimer != null) {
        clearTimeout(feedbackHideTimer);
        feedbackHideTimer = null;
    }
    if (calendarContainer) {
        calendarContainer.removeEventListener("mouseleave", onCalendarLeave);
        calendarContainer = null;
    }
    feedbackBar = null;
});

function onDayHover(payload: {
    date: Date;
    ymd: string;
    disabled?: { severity?: "hard" | "soft" };
    element?: HTMLElement | null;
}): void {
    if (lastHoverElement && lastHoverElement !== payload.element) {
        clearHoverClasses(lastHoverElement);
    }
    lastHoverElement = payload.element ?? null;

    const markers = getBookingMarkersForDate(
        store.unavailableByDate,
        payload.ymd,
        bookableItems.value || []
    );

    if (payload.element) {
        const hasLead = markers.some((m: CalendarMarker) => m.type === "lead");
        const hasTrail = markers.some(
            (m: CalendarMarker) => m.type === "trail"
        );
        if (hasLead) {
            payload.element.classList.add(CLASS_BOOKING_DAY_HOVER_LEAD);
        }
        if (hasTrail) {
            payload.element.classList.add(CLASS_BOOKING_DAY_HOVER_TRAIL);
        }
    }

    if (feedbackBar) {
        try {
            const isHardDisabled =
                !!payload.disabled && payload.disabled.severity !== "soft";
            const rules = Array.isArray(circulationRules.value)
                ? circulationRules.value[0] || {}
                : circulationRules.value || {};
            const feedback = getDateFeedbackMessage(payload.date, {
                isDisabled: isHardDisabled,
                selectedDateRange: selectedDateRange.value,
                circulationRules: rules,
                unavailableByDate: store.unavailableByDate,
                holidays: holidays.value || [],
            });
            updateFeedbackBar(feedbackBar, feedback);
        } catch (_e) {
            updateFeedbackBar(feedbackBar, null);
        }
    }

    if (!payload.element || markers.length === 0) {
        tooltip.visible = false;
        return;
    }
    const rect = payload.element.getBoundingClientRect();
    tooltip.markers = markers;
    tooltip.x = rect.right + 8 + window.scrollX;
    tooltip.y = rect.top + rect.height / 2 + window.scrollY;
    tooltip.visible = true;
}

function onUpdateViewport(vp: { year: number; month: number }): void {
    const start = new Date(vp.year, vp.month, 1);
    const end = new Date(vp.year, vp.month + 1, 0);
    store.setViewport({ start, end });
}

function onSelectAttemptBlocked(p: { date: Date; reason: string }): void {
    if (p.reason) store.setUiError(p.reason, "blocked_date");
}

// Push loan-boundary timestamps onto the flatpickr instance. Tests and any
// legacy consumers read fp._loanBoundaryTimes directly; the corresponding
// .booking-loan-boundary class is applied via classByDate in onDayCreate.
watch(
    loanBoundaryTimes,
    times => {
        const fp = pickerRef.value?.instance?.() as
            | { _loanBoundaryTimes?: Set<number> }
            | null
            | undefined;
        if (fp) fp._loanBoundaryTimes = times;
    },
    { immediate: true }
);

const debouncedExtendHolidays = debounce(
    (libraryId: string, visibleStart: Date, visibleEnd: Date) => {
        store.extendHolidaysIfNeeded(libraryId, visibleStart, visibleEnd);
    },
    HOLIDAY_EXTENSION_DEBOUNCE_MS
);

watch(
    () => viewport.value,
    newRange => {
        const libraryId = pickupLibraryId.value;
        if (!libraryId || !newRange?.start || !newRange?.end) return;
        debouncedExtendHolidays(libraryId, newRange.start, newRange.end);
    },
    { deep: true, immediate: true }
);

const clearDateRange = (): void => {
    pickerRef.value?.clear();
    store.setSelectedDates(null);
    hideTooltip();
    emit("clear-dates");
};
</script>

<style scoped>
.form-group {
    margin-bottom: var(--booking-space-lg);
}

.booking-date-picker {
    display: flex;
    align-items: center;
}

:deep(.booking-flatpickr-wrapper) {
    flex: 1;
    margin-right: var(--booking-space-md);
}

:deep(.booking-flatpickr-input) {
    width: 100%;
}

.booking-date-picker-append {
    flex-shrink: 0;
}

.booking-constraint-info {
    margin-top: var(--booking-space-md);
    margin-bottom: var(--booking-space-lg);
}

.calendar-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--booking-space-md);
    font-size: var(--booking-text-sm);
    margin-top: var(--booking-space-lg);
}

.alert {
    padding: calc(var(--booking-space-lg) * 0.75) var(--booking-space-lg);
    border: var(--booking-border-width) solid transparent;
    border-radius: var(--booking-border-radius-sm);
}

.alert-info {
    color: hsl(var(--booking-info-hue), 80%, 20%);
    background-color: hsl(var(--booking-info-hue), 40%, 90%);
    border-color: hsl(var(--booking-info-hue), 40%, 70%);
}

.alert-danger {
    color: hsl(var(--booking-danger-hue), 80%, 20%);
    background-color: hsl(var(--booking-danger-hue), 40%, 90%);
    border-color: hsl(var(--booking-danger-hue), 40%, 70%);
}
</style>
