<template>
    <div class="booking-flatpickr-wrapper" :class="{ 'is-inline': inline }">
        <input
            ref="inputRef"
            :id="inputId || undefined"
            type="text"
            :class="inputClass"
            :placeholder="placeholder"
            :required="required"
            :disabled="inputDisabled"
            :readonly="!allowInput && !inline"
        />
        <button
            v-if="clearable && hasValue && !inline"
            type="button"
            class="booking-flatpickr-clear"
            :aria-label="$__ ? $__('Clear date') : 'Clear date'"
            @click.prevent="clear"
        >
            <span aria-hidden="true">&times;</span>
        </button>
    </div>
</template>

<script setup lang="ts">
import {
    ref,
    shallowRef,
    computed,
    watch,
    onMounted,
    onBeforeUnmount,
    nextTick,
} from "vue";
import flatpickr from "flatpickr";
import type { Instance, DayElement } from "flatpickr/dist/types/instance";
import type { Options, Plugin } from "flatpickr/dist/types/options";

type YMD = string;

export interface DisabledSpec {
    reason: string;
    severity?: "hard" | "soft";
}

export interface Marker {
    kind: string;
    className?: string;
    label?: string;
    tooltip?: string;
}

export interface RangePreviewStatus {
    status: "valid" | "warn" | "invalid";
    message?: string;
    classByDate?: Map<YMD, string>;
}

export type Mode = "single" | "range" | "multiple" | "datetime" | "time";
export type DisabledInput =
    | Map<YMD, DisabledSpec>
    | ((date: Date) => DisabledSpec | null);
export type SelectedValue = Date | [Date, Date] | Date[] | null;
export type RangeState =
    | "idle"
    | "picking-end"
    | "committed"
    | "externally-set";

interface Viewport {
    year: number;
    month: number;
}

const props = withDefaults(
    defineProps<{
        mode?: Mode;
        modelValue?: SelectedValue | string | string[];
        viewport?: Viewport | null;
        minDate?: Date | string | null;
        maxDate?: Date | string | null;
        disabled?: DisabledInput;
        markersByDate?: Map<YMD, Marker[]>;
        markerRenderer?: (
            dayElem: HTMLElement,
            markers: Marker[],
            date: Date
        ) => void;
        classByDate?: Map<YMD, string>;
        rangePreviewFn?: (anchor: Date, hover: Date) => RangePreviewStatus;
        displayFormat?: string;
        submitFormat?: string;
        locale?: object;
        inline?: boolean;
        allowInput?: boolean;
        clearable?: boolean;
        plugins?: Plugin[];
        required?: boolean;
        inputDisabled?: boolean;
        placeholder?: string;
        inputClass?: string;
        inputId?: string;
    }>(),
    {
        mode: "single",
        modelValue: null,
        viewport: null,
        minDate: null,
        maxDate: null,
        disabled: () => new Map(),
        markersByDate: () => new Map(),
        markerRenderer: undefined,
        classByDate: () => new Map(),
        rangePreviewFn: undefined,
        displayFormat: undefined,
        submitFormat: "Y-m-d",
        locale: undefined,
        inline: false,
        allowInput: true,
        clearable: false,
        plugins: () => [],
        required: false,
        inputDisabled: false,
        placeholder: "",
        inputClass: "",
        inputId: "",
    }
);

const emit = defineEmits<{
    (e: "update:modelValue", v: SelectedValue): void;
    (e: "update:viewport", v: Viewport): void;
    (
        e: "day-hover",
        p: {
            date: Date;
            ymd: YMD;
            disabled?: DisabledSpec;
            element?: HTMLElement | null;
        }
    ): void;
    (
        e: "range-preview",
        p: { anchor: Date; hover: Date; status: RangePreviewStatus }
    ): void;
    (e: "select-attempt-blocked", p: { date: Date; reason: string }): void;
    (
        e: "ready",
        p: {
            instance: Instance;
            inputElement: HTMLElement;
            altInputElement: HTMLInputElement | null;
        }
    ): void;
    (e: "range-state-change", state: RangeState, anchor: Date | null): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const fpInstance = shallowRef<Instance | null>(null);

const rangeState = ref<RangeState>("idle");
const rangeAnchor = ref<Date | null>(null);

let hoverRafScheduled = false;
let latestHoverDate: Date | null = null;
let latestHoverElement: HTMLElement | null = null;

// Resolve the Koha-configured display format. The intranet bootstrap sets
// window.flatpickr_dateformat_string from the dateformat syspref; fall back
// to ISO if the page hasn't set one (e.g., test harness).
function getKohaDateFormat(): string {
    const fmt = (window as Window & { flatpickr_dateformat_string?: string })
        .flatpickr_dateformat_string;
    return typeof fmt === "string" && fmt ? fmt : "Y-m-d";
}

// Best-effort dynamic load of the flatpickr l10n bundle for the current
// HTML lang attribute. Each l10n module registers itself on
// window.flatpickr.l10ns[<code>] as a side effect, so we read it back
// after the import resolves. Returns undefined for English or on failure
// so flatpickr falls back to its built-in English locale.
let kohaLocalePromise: Promise<object | undefined> | null = null;
function loadKohaLocale(): Promise<object | undefined> {
    if (kohaLocalePromise) return kohaLocalePromise;
    kohaLocalePromise = (async () => {
        const lang = (document.documentElement.lang || "en")
            .toLowerCase()
            .split("-")[0];
        if (!lang || lang === "en") return undefined;
        try {
            await import(
                /* webpackChunkName: "flatpickr-l10n-[request]" */
                `flatpickr/dist/l10n/${lang}.js`
            );
        } catch {
            return undefined;
        }
        type FpGlobal = { l10ns?: Record<string, object> };
        const fp = (window as Window & { flatpickr?: FpGlobal }).flatpickr;
        return fp?.l10ns?.[lang];
    })();
    return kohaLocalePromise;
}

function ymdKey(d: Date): YMD {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

const hasValue = computed<boolean>(() => {
    const v = props.modelValue;
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0 && v[0] != null;
    return true;
});

function isSoftDisabled(date: Date): DisabledSpec | null {
    const d = props.disabled;
    if (typeof d === "function") {
        const spec = d(date);
        return spec && spec.severity === "soft" ? spec : null;
    }
    if (d instanceof Map) {
        const spec = d.get(ymdKey(date));
        return spec && spec.severity === "soft" ? spec : null;
    }
    return null;
}

function disabledSpecFor(date: Date): DisabledSpec | null {
    const d = props.disabled;
    if (typeof d === "function") return d(date);
    if (d instanceof Map) return d.get(ymdKey(date)) ?? null;
    return null;
}

const hardDisableConfig = computed<Options["disable"] | undefined>(() => {
    const d = props.disabled;
    if (typeof d === "function") {
        return [
            (date: Date) => {
                const spec = d(date);
                return !!spec && spec.severity !== "soft";
            },
        ];
    }
    if (d instanceof Map) {
        const hardSet = new Set<YMD>();
        d.forEach((spec, key) => {
            if (spec.severity !== "soft") hardSet.add(key);
        });
        if (hardSet.size === 0) return undefined;
        return [(date: Date) => hardSet.has(ymdKey(date))];
    }
    return undefined;
});

function onDayCreate(
    _selectedDates: Date[],
    _dateStr: string,
    _instance: Instance,
    dayElem: DayElement
): void {
    if (!dayElem.dateObj) return;
    const date = dayElem.dateObj;
    const key = ymdKey(date);

    const soft = isSoftDisabled(date);
    if (soft) {
        dayElem.classList.add("booking-fp-soft-disabled");
        dayElem.setAttribute(
            "data-booking-fp-disabled-reason",
            soft.reason || ""
        );
        // flatpickr binds `click` on daysContainer to run selectDate. A
        // capture-phase listener on the day itself runs first and blocks
        // it, preserving the day's enabled-for-range-validation status.
        dayElem.addEventListener(
            "click",
            (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                (
                    e as Event & {
                        stopImmediatePropagation: () => void;
                    }
                ).stopImmediatePropagation();
                emit("select-attempt-blocked", {
                    date,
                    reason: soft.reason,
                });
            },
            { capture: true }
        );
    }

    const cls = props.classByDate?.get(key);
    if (cls) {
        cls.split(/\s+/).forEach(c => {
            if (c) dayElem.classList.add(c);
        });
    }

    const markers = props.markersByDate?.get(key);
    if (markers && markers.length > 0) {
        markers.forEach(m => {
            if (m.className) dayElem.classList.add(m.className);
            if (m.tooltip) dayElem.setAttribute("title", m.tooltip);
        });
        if (props.markerRenderer) {
            props.markerRenderer(dayElem as HTMLElement, markers, date);
        } else {
            const badge = document.createElement("span");
            badge.className = "booking-fp-marker-badge";
            badge.setAttribute("aria-hidden", "true");
            dayElem.appendChild(badge);
        }
    }
}

function onCalendarMouseOver(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target?.classList.contains("flatpickr-day")) return;
    const dayEl = target as DayElement;
    if (!dayEl.dateObj) return;

    latestHoverDate = dayEl.dateObj;
    latestHoverElement = dayEl as HTMLElement;
    if (hoverRafScheduled) return;
    hoverRafScheduled = true;
    requestAnimationFrame(() => {
        hoverRafScheduled = false;
        if (!latestHoverDate || !fpInstance.value) return;

        const hover = latestHoverDate;
        const spec = disabledSpecFor(hover);
        emit("day-hover", {
            date: hover,
            ymd: ymdKey(hover),
            disabled: spec ?? undefined,
            element: latestHoverElement,
        });

        if (
            props.mode === "range" &&
            rangeState.value === "picking-end" &&
            rangeAnchor.value &&
            props.rangePreviewFn
        ) {
            const status = props.rangePreviewFn(rangeAnchor.value, hover);
            emit("range-preview", {
                anchor: rangeAnchor.value,
                hover,
                status,
            });
        }
    });
}

function setRangeState(next: RangeState): void {
    if (rangeState.value === next) return;
    rangeState.value = next;
    emit("range-state-change", next, rangeAnchor.value);
}

function flatpickrModeFor(m: Mode): Options["mode"] {
    if (m === "datetime" || m === "time" || m === "single") return "single";
    return m;
}

function buildConfig(localeOverride?: object): Partial<Options> {
    // Date-format default: prefer the explicit prop; fall back to the Koha
    // syspref (Y-m-d if neither is set). displayFormat defaults to the
    // resolved submit format so the input shows the localized form.
    const submitFmt = props.submitFormat ?? getKohaDateFormat();
    const displayFmt = props.displayFormat ?? submitFmt;

    const cfg: Partial<Options> = {
        mode: flatpickrModeFor(props.mode),
        inline: props.inline,
        allowInput: props.allowInput,
        dateFormat: submitFmt,
        altInput: !!(displayFmt && displayFmt !== submitFmt),
        altFormat: displayFmt,
        disable: hardDisableConfig.value ?? [],
        plugins: props.plugins,
        enableTime: props.mode === "datetime" || props.mode === "time",
        noCalendar: props.mode === "time",
        onChange: handleChange,
        onReady: handleReady,
        onMonthChange: handleMonthChange,
        onYearChange: handleMonthChange,
        onDayCreate,
    };
    if (props.minDate != null) cfg.minDate = props.minDate;
    if (props.maxDate != null) cfg.maxDate = props.maxDate;
    const locale = props.locale ?? localeOverride;
    if (locale) cfg.locale = locale as Options["locale"];
    return cfg;
}

function handleReady(_d: Date[], _s: string, fp: Instance): void {
    const cal = fp.calendarContainer;
    if (cal) {
        cal.addEventListener("mouseover", onCalendarMouseOver);
    }
    emit("ready", {
        instance: fp,
        inputElement: inputRef.value as HTMLElement,
        altInputElement: fp.altInput ?? null,
    });
}

function handleChange(
    selectedDates: Date[],
    _dateStr: string,
    fp: Instance
): void {
    if (props.mode === "range") {
        if (selectedDates.length === 0) {
            rangeAnchor.value = null;
            setRangeState("idle");
        } else if (selectedDates.length === 1) {
            rangeAnchor.value = selectedDates[0];
            setRangeState("picking-end");
        } else {
            rangeAnchor.value = null;
            setRangeState("committed");
        }
    }
    emit("update:modelValue", normalizeOutput(selectedDates));
    emit("update:viewport", {
        year: fp.currentYear,
        month: fp.currentMonth,
    });
}

function handleMonthChange(_d: Date[], _s: string, fp: Instance): void {
    emit("update:viewport", {
        year: fp.currentYear,
        month: fp.currentMonth,
    });
}

function normalizeOutput(dates: Date[]): SelectedValue {
    if (dates.length === 0) return null;
    if (
        props.mode === "single" ||
        props.mode === "datetime" ||
        props.mode === "time"
    ) {
        return dates[0];
    }
    if (props.mode === "range") {
        if (dates.length === 0) return null;
        // Anchor-only state (one date picked, awaiting end). Emitting a
        // single-element array lets the parent track the anchor; emitting
        // null here would clear the parent's range and break anchor-aware
        // logic (lead/trail/maxPeriod evaluation in createDisableFunction).
        if (dates.length === 1) return [dates[0]];
        return [dates[0], dates[1]] as [Date, Date];
    }
    if (props.mode === "multiple") return [...dates];
    return dates[0];
}

function applyExternalValue(v: SelectedValue | string | string[] | null): void {
    const fp = fpInstance.value;
    if (!fp) return;
    if (v == null || (Array.isArray(v) && (v.length === 0 || v[0] == null))) {
        fp.clear(false);
        rangeAnchor.value = null;
        setRangeState("idle");
        return;
    }

    const isFullCommittedRange =
        Array.isArray(v) && v.length >= 2 && v[0] != null && v[1] != null;
    const dateInput = Array.isArray(v) ? v.filter(d => d != null) : v;
    fp.setDate(dateInput as Parameters<Instance["setDate"]>[0], false);

    if (props.mode === "range") {
        if (isFullCommittedRange) {
            rangeAnchor.value = null;
            setRangeState("committed");
        } else {
            const anchor = Array.isArray(v) ? v[0] : v;
            rangeAnchor.value = anchor instanceof Date ? anchor : null;
            setRangeState("picking-end");
        }
    }
}

function navigateToViewport(vp: Viewport): void {
    const fp = fpInstance.value;
    if (!fp) return;
    if (fp.currentYear !== vp.year) fp.changeYear(vp.year);
    if (fp.currentMonth !== vp.month) {
        fp.changeMonth(vp.month - fp.currentMonth, true);
    }
}

async function createInstance(): Promise<void> {
    if (!inputRef.value) return;
    // Resolve the locale before flatpickr() is called so month/day names
    // render localized on first paint. props.locale wins; otherwise we
    // attempt to load the bundle matching <html lang>.
    const locale = props.locale ? undefined : await loadKohaLocale();
    if (!inputRef.value) return; // unmounted while awaiting
    fpInstance.value = flatpickr(
        inputRef.value as unknown as HTMLInputElement,
        buildConfig(locale) as Options
    );
    if (props.modelValue != null) {
        applyExternalValue(props.modelValue);
    }
    if (props.viewport) {
        navigateToViewport(props.viewport);
    }
}

function destroyInstance(): void {
    const fp = fpInstance.value;
    if (!fp) return;
    const cal = fp.calendarContainer;
    if (cal) {
        cal.removeEventListener("mouseover", onCalendarMouseOver);
    }
    fp.destroy();
    fpInstance.value = null;
}

function clear(): void {
    fpInstance.value?.clear();
}

function setDate(v: SelectedValue, fireChange = false): void {
    if (!fpInstance.value) return;
    if (v == null) {
        fpInstance.value.clear(fireChange);
        return;
    }
    fpInstance.value.setDate(
        v as Parameters<Instance["setDate"]>[0],
        fireChange
    );
}

defineExpose({
    clear,
    setDate,
    instance: () => fpInstance.value,
    inputElement: () => inputRef.value,
});

onMounted(() => {
    createInstance();
});

onBeforeUnmount(() => {
    destroyInstance();
});

watch(
    () => [props.mode, props.locale],
    () => {
        if (!fpInstance.value) return;
        destroyInstance();
        nextTick(() => createInstance());
    }
);

// Coalesce flatpickr.set/redraw calls into a single rAF tick. Without
// coalescing, rapid prop changes during modal hydration trigger one
// synchronous redraw per change, saturating the microtask queue and
// starving other components' render effects (notably vue-select dropdowns).
let redrawScheduled = false;
function scheduleRedraw(): void {
    if (redrawScheduled) return;
    redrawScheduled = true;
    requestAnimationFrame(() => {
        redrawScheduled = false;
        const fp = fpInstance.value;
        if (!fp) return;
        fp.set("disable", hardDisableConfig.value ?? []);
        fp.redraw();
    });
}

watch(
    [() => props.disabled, () => props.markersByDate, () => props.classByDate],
    () => scheduleRedraw(),
    { flush: "post" }
);

// minDate/maxDate get their own watchers because flatpickr's set("minDate")
// and set("maxDate") snap the visible month back to contain the new bound;
// folding them into the redraw path above would undo every user-driven
// month navigation.
watch(
    () => props.minDate,
    v => {
        const fp = fpInstance.value;
        if (!fp) return;
        fp.set("minDate", (v ?? null) as string | Date | null);
    }
);
watch(
    () => props.maxDate,
    v => {
        const fp = fpInstance.value;
        if (!fp) return;
        fp.set("maxDate", (v ?? null) as string | Date | null);
    }
);

watch(
    () => props.modelValue,
    v => {
        if (!fpInstance.value) return;
        applyExternalValue(v ?? null);
    },
    { deep: false }
);

watch(
    () => props.viewport,
    vp => {
        if (!vp || !fpInstance.value) return;
        navigateToViewport(vp);
    }
);
</script>

<style>
.booking-flatpickr-wrapper {
    position: relative;
    display: inline-block;
}
.booking-flatpickr-wrapper.is-inline {
    display: block;
}
.booking-flatpickr-wrapper .booking-flatpickr-clear {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.25rem;
    font-size: 1.2em;
    line-height: 1;
    color: inherit;
    opacity: 0.6;
}
.booking-flatpickr-wrapper .booking-flatpickr-clear:hover,
.booking-flatpickr-wrapper .booking-flatpickr-clear:focus {
    opacity: 1;
}
.flatpickr-day.booking-fp-soft-disabled {
    opacity: 0.55;
    text-decoration: line-through;
    cursor: not-allowed;
}
.flatpickr-day .booking-fp-marker-badge {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--booking-fp-marker-color, currentColor);
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
}
</style>
