import BaseFlatpickr from "@koha-vue/components/BaseFlatpickr.vue";
import { ref } from "vue";

const MARCH_2026 = { year: 2026, month: 2 };

const day = label => cy.get(`.flatpickr-day[aria-label="${label}"]`);

describe("BaseFlatpickr", () => {
    describe("single mode", () => {
        it("renders an input and an inline calendar", () => {
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                },
            });
            cy.get("input").should("exist");
            cy.get(".flatpickr-calendar").should("exist");
        });

        it("emits update:modelValue when a day is clicked", () => {
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 15, 2026").click();
            cy.get("@onUpdate").should("have.been.calledOnce");
        });
    });

    describe("range mode state machine", () => {
        it("transitions idle → picking-end → committed across two clicks", () => {
            const onState = cy.stub().as("onState");
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    "onRange-state-change": onState,
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 10, 2026").click();
            cy.get("@onState").should("have.been.calledWith", "picking-end");
            day("March 14, 2026").click();
            cy.get("@onState").should("have.been.calledWith", "committed");
            cy.get("@onUpdate").its("lastCall.args.0").should("have.length", 2);
        });

        it("treats external [a, b] write as committed without re-emitting", () => {
            const onUpdate = cy.stub().as("onUpdate");
            const onState = cy.stub().as("onState");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    modelValue: [
                        new Date("2026-03-10"),
                        new Date("2026-03-14"),
                    ],
                    "onUpdate:modelValue": onUpdate,
                    "onRange-state-change": onState,
                },
            });
            cy.get("@onUpdate").should("not.have.been.called");
            cy.get("@onState").should("have.been.calledWith", "committed");
        });

        it("returns to idle when externally cleared", () => {
            const onState = cy.stub().as("onState");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    modelValue: [
                        new Date("2026-03-10"),
                        new Date("2026-03-14"),
                    ],
                    "onRange-state-change": onState,
                },
            }).then(({ wrapper }) => {
                wrapper.setProps({ modelValue: null });
                cy.get("@onState").should("have.been.calledWith", "idle");
            });
        });
    });

    describe("end-date-only mode (fixed anchor)", () => {
        it("starts in picking-end with anchor visible as selected", () => {
            const onState = cy.stub().as("onState");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-10",
                    modelValue: [new Date("2026-03-10"), null],
                    "onRange-state-change": onState,
                },
            });
            day("March 10, 2026").should("have.class", "selected");
            cy.get("@onState").should("have.been.calledWith", "picking-end");
        });

        it("commits a range whose end is past a soft-disabled mid day", () => {
            const disabled = new Map([
                ["2026-03-12", { reason: "Holiday", severity: "soft" }],
            ]);
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-10",
                    modelValue: [new Date("2026-03-10"), null],
                    disabled,
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 14, 2026").click();
            cy.get("@onUpdate").its("lastCall.args.0").should("have.length", 2);
            cy.get("@onUpdate")
                .its("lastCall.args.0.0")
                .invoke("getTime")
                .should("equal", new Date("2026-03-10").getTime());
        });

        it("blocks click before the fixed anchor via minDate", () => {
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-10",
                    modelValue: [new Date("2026-03-10"), null],
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 5, 2026").should("have.class", "flatpickr-disabled");
            day("March 5, 2026").click({ force: true });
            cy.get("@onUpdate").should("not.have.been.called");
        });
    });

    describe("hover preview", () => {
        it("calls rangePreviewFn with anchor and hover during picking-end", () => {
            const rangePreviewFn = cy
                .stub()
                .returns({ status: "valid" })
                .as("previewFn");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-10",
                    modelValue: [new Date("2026-03-10"), null],
                    rangePreviewFn,
                },
            });
            day("March 14, 2026").trigger("mouseover");
            cy.get("@previewFn").should("have.been.called");
            cy.get("@previewFn")
                .its("lastCall.args.0")
                .invoke("getTime")
                .should("equal", new Date("2026-03-10").getTime());
            cy.get("@previewFn")
                .its("lastCall.args.1")
                .invoke("getTime")
                .should("equal", new Date("2026-03-14").getTime());
        });

        it("emits range-preview with the status returned by rangePreviewFn", () => {
            const rangePreviewFn = (anchor, hover) => ({
                status: hover.getDate() > 13 ? "warn" : "valid",
                message: hover.getDate() > 13 ? "long booking" : undefined,
            });
            const onPreview = cy.stub().as("onPreview");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-10",
                    modelValue: [new Date("2026-03-10"), null],
                    rangePreviewFn,
                    "onRange-preview": onPreview,
                },
            });
            day("March 14, 2026").trigger("mouseover");
            cy.get("@onPreview")
                .its("lastCall.args.0.status.status")
                .should("equal", "warn");
        });

        it("includes the hovered day element on the day-hover payload", () => {
            const onHover = cy.stub().as("onHover");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    "onDay-hover": onHover,
                },
            });
            day("March 14, 2026").trigger("mouseover");
            cy.get("@onHover")
                .its("lastCall.args.0.element")
                .should("have.class", "flatpickr-day");
        });

        it("applies updated classByDate on prop change without losing anchor", () => {
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-10",
                    modelValue: [new Date("2026-03-10"), null],
                    classByDate: new Map([["2026-03-15", "preview-initial"]]),
                },
            }).then(({ wrapper }) => {
                day("March 15, 2026").should("have.class", "preview-initial");
                day("March 10, 2026").should("have.class", "selected");

                wrapper.setProps({
                    classByDate: new Map([["2026-03-15", "preview-updated"]]),
                });

                day("March 15, 2026").should("have.class", "preview-updated");
                day("March 15, 2026").should(
                    "not.have.class",
                    "preview-initial"
                );
                day("March 10, 2026").should("have.class", "selected");
            });
        });
    });

    describe("per-anchor constrained-range highlighting", () => {
        const ymdOf = d => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${y}-${m}-${dd}`;
        };

        const HostHighlighter = {
            components: { BaseFlatpickr },
            data() {
                return {
                    modelValue: null,
                    classByDate: new Map(),
                };
            },
            methods: {
                onStateChange(state, anchor) {
                    if (state === "picking-end" && anchor) {
                        const reachable = new Date(anchor);
                        reachable.setDate(reachable.getDate() + 5);
                        this.classByDate = new Map([
                            [ymdOf(reachable), "reachable-end"],
                        ]);
                    } else if (state === "idle") {
                        this.classByDate = new Map();
                    }
                },
            },
            template: `
                <BaseFlatpickr
                    mode="range"
                    inline
                    :viewport="{ year: 2026, month: 2 }"
                    min-date="2026-03-01"
                    :model-value="modelValue"
                    :class-by-date="classByDate"
                    @update:model-value="modelValue = $event"
                    @range-state-change="onStateChange"
                />
            `,
        };

        it("emits range-state-change with the anchor on transition to picking-end", () => {
            const onState = cy.stub().as("onState");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    "onRange-state-change": onState,
                },
            });
            day("March 10, 2026").click();
            cy.get("@onState")
                .its("lastCall.args.1")
                .invoke("getTime")
                .should("equal", new Date("2026-03-10").getTime());
        });

        it("applies per-anchor classByDate from a consumer wired via range-state-change", () => {
            cy.mount(HostHighlighter);
            day("March 15, 2026").should("not.have.class", "reachable-end");
            day("March 10, 2026").click();
            day("March 15, 2026").should("have.class", "reachable-end");
            day("March 10, 2026").should("have.class", "selected");
        });
    });

    describe("hard-disabled", () => {
        it("applies flatpickr's disabled class and blocks selection", () => {
            const disabled = new Map([
                ["2026-03-15", { reason: "Closed", severity: "hard" }],
            ]);
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    disabled,
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 15, 2026").should("have.class", "flatpickr-disabled");
            day("March 15, 2026").click({ force: true });
            cy.get("@onUpdate").should("not.have.been.called");
        });

        it("treats specs without explicit severity as hard", () => {
            const disabled = new Map([["2026-03-15", { reason: "Closed" }]]);
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    disabled,
                },
            });
            day("March 15, 2026").should("have.class", "flatpickr-disabled");
        });

        it("accepts a function-form disabled predicate", () => {
            const disabledFn = d =>
                d.getDate() === 15
                    ? { reason: "Mid-month closed", severity: "hard" }
                    : null;
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    disabled: disabledFn,
                },
            });
            day("March 15, 2026").should("have.class", "flatpickr-disabled");
            day("March 14, 2026").should(
                "not.have.class",
                "flatpickr-disabled"
            );
        });
    });

    describe("soft-disabled", () => {
        it("styles the day without flatpickr's disabled class", () => {
            const disabled = new Map([
                ["2026-03-15", { reason: "Holiday", severity: "soft" }],
            ]);
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    disabled,
                },
            });
            day("March 15, 2026")
                .should("have.class", "base-fp-soft-disabled")
                .should("not.have.class", "flatpickr-disabled");
        });

        it("blocks single-mode click and emits select-attempt-blocked", () => {
            const disabled = new Map([
                ["2026-03-15", { reason: "Holiday", severity: "soft" }],
            ]);
            const onBlocked = cy.stub().as("onBlocked");
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    disabled,
                    "onSelect-attempt-blocked": onBlocked,
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 15, 2026").click();
            cy.get("@onBlocked").should("have.been.calledOnce");
            cy.get("@onUpdate").should("not.have.been.called");
        });

        it("allows a range to cross a soft-disabled day", () => {
            const disabled = new Map([
                ["2026-03-12", { reason: "Holiday", severity: "soft" }],
            ]);
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "range",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    disabled,
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 10, 2026").click();
            day("March 14, 2026").click();
            cy.get("@onUpdate").its("lastCall.args.0").should("have.length", 2);
        });
    });

    describe("markers", () => {
        it("applies marker className, tooltip, and badge", () => {
            const markersByDate = new Map([
                [
                    "2026-03-15",
                    [
                        {
                            kind: "test",
                            className: "test-marker",
                            tooltip: "Test marker",
                        },
                    ],
                ],
            ]);
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    markersByDate,
                },
            });
            day("March 15, 2026")
                .should("have.class", "test-marker")
                .should("have.attr", "title", "Test marker");
            day("March 15, 2026").find(".base-fp-marker-badge").should("exist");
        });

        it("delegates to a custom markerRenderer and suppresses the default badge", () => {
            const markerRenderer = cy.stub().as("markerRenderer");
            const markersByDate = new Map([
                [
                    "2026-03-15",
                    [
                        {
                            kind: "test",
                            className: "test-marker",
                        },
                    ],
                ],
            ]);
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    markersByDate,
                    markerRenderer,
                },
            });
            cy.get("@markerRenderer").should("have.been.called");
            cy.get("@markerRenderer")
                .its("lastCall.args.0")
                .should("have.class", "flatpickr-day");
            cy.get("@markerRenderer")
                .its("lastCall.args.1")
                .should("deep.equal", [
                    { kind: "test", className: "test-marker" },
                ]);
            cy.get("@markerRenderer")
                .its("lastCall.args.2")
                .invoke("getTime")
                .should("equal", new Date(2026, 2, 15).getTime());
            // BookingPeriodStep relies on this: a custom renderer takes over
            // and the generic dot badge should not be emitted.
            day("March 15, 2026")
                .find(".base-fp-marker-badge")
                .should("not.exist");
        });
    });

    describe("ready event", () => {
        // BookingPeriodStep reads payload.instance.calendarContainer to mount
        // the hover-feedback bar; a payload-shape refactor would silently
        // break that wiring. Pin the contract here.
        it("emits an object with instance, inputElement, and altInputElement", () => {
            const onReady = cy.stub().as("onReady");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    onReady,
                },
            });
            cy.get("@onReady").should("have.been.calledOnce");
            cy.get("@onReady")
                .its("lastCall.args.0.instance")
                .should("have.property", "calendarContainer");
            cy.get("@onReady")
                .its("lastCall.args.0.inputElement")
                .should("be.instanceOf", HTMLInputElement);
            cy.get("@onReady")
                .its("lastCall.args.0")
                .should("have.property", "altInputElement");
        });
    });

    describe("classByDate", () => {
        it("applies multiple custom classes to the day cell", () => {
            const classByDate = new Map([["2026-03-15", "custom-a custom-b"]]);
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    minDate: "2026-03-01",
                    classByDate,
                },
            });
            day("March 15, 2026")
                .should("have.class", "custom-a")
                .should("have.class", "custom-b");
        });
    });

    describe("external value", () => {
        it("does not emit update:modelValue when initialized from props", () => {
            const onUpdate = cy.stub().as("onUpdate");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    modelValue: new Date("2026-03-15"),
                    "onUpdate:modelValue": onUpdate,
                },
            });
            day("March 15, 2026").should("have.class", "selected");
            cy.get("@onUpdate").should("not.have.been.called");
        });
    });

    describe("viewport", () => {
        it("emits update:viewport when navigating months", () => {
            const onViewport = cy.stub().as("onViewport");
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                    "onUpdate:viewport": onViewport,
                },
            });
            cy.get(".flatpickr-next-month").click();
            cy.get("@onViewport").should("have.been.called");
        });

        it("navigates to the viewport prop when set on mount", () => {
            cy.mount(BaseFlatpickr, {
                props: {
                    mode: "single",
                    inline: true,
                    viewport: MARCH_2026,
                },
            });
            // March 2026 is visible iff a known March day is rendered
            day("March 15, 2026").should("exist");
        });
    });

    // BookingPeriodStep drives clearDateRange and the loanBoundaryTimes
    // write through this exposed surface. Treat these as a contract: a
    // refactor that hides any of these methods would silently break those
    // callers.
    describe("exposed API", () => {
        const PICKER_VIEWPORT = { year: 2026, month: 2 };
        const PickerHost = {
            components: { BaseFlatpickr },
            props: ["modelValue", "mode"],
            setup() {
                const picker = ref(null);
                return { picker, viewport: PICKER_VIEWPORT };
            },
            template: `
                <BaseFlatpickr
                    ref="picker"
                    :mode="mode || 'single'"
                    :inline="true"
                    :viewport="viewport"
                    min-date="2026-03-01"
                    :model-value="modelValue"
                />
            `,
        };

        it("instance() returns a live flatpickr instance with viewport state", () => {
            cy.mount(PickerHost).then(({ wrapper }) => {
                const fp = wrapper.vm.picker.instance();
                expect(fp).to.have.property("currentMonth", 2);
                expect(fp).to.have.property("currentYear", 2026);
                expect(fp).to.have.property("setDate");
                expect(fp).to.have.property("changeMonth");
            });
        });

        it("setDate() programmatically selects a day", () => {
            cy.mount(PickerHost).then(({ wrapper }) => {
                wrapper.vm.picker.setDate(new Date("2026-03-15"));
            });
            day("March 15, 2026").should("have.class", "selected");
        });

        it("clear() removes the selection", () => {
            // After clear() flatpickr navigates the calendar away from the
            // anchor month (back to today's month), so assert against the
            // global "any selected day" predicate rather than looking up
            // March 15 — which the picker has navigated past.
            let host;
            cy.mount(PickerHost).then(({ wrapper }) => {
                host = wrapper;
                wrapper.vm.picker.setDate(new Date("2026-03-15"));
            });
            day("March 15, 2026").should("have.class", "selected");
            cy.then(() => host.vm.picker.clear());
            cy.get(".flatpickr-day.selected").should("not.exist");
        });

        it("inputElement() returns the underlying input", () => {
            // BookingPeriodStep does not currently call inputElement, but
            // the integration spec's keyboard helpers do; pin the return
            // shape here so a refactor that changed it to a wrapper or
            // null would surface immediately.
            cy.mount(PickerHost).then(({ wrapper }) => {
                const el = wrapper.vm.picker.inputElement();
                expect(el).to.be.instanceOf(HTMLInputElement);
            });
        });
    });
});
