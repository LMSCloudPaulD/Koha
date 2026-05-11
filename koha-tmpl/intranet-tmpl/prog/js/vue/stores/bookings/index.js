import { defineStore } from "pinia";
import { useStatusSection } from "./sections/status.mjs";
import { useDataSection } from "./sections/data.mjs";
import { useDraftSection } from "./sections/draft.mjs";
import { useAvailabilitySection } from "./sections/availability.mjs";
import { useValidationSection } from "./sections/validation.mjs";
import { useEffectsSection } from "./sections/effects.mjs";

/**
 * Bookings store, organized into named sections that compose along
 * a one-way dependency chain:
 *
 *   status       — async-operation tracking, UI-error state
 *   data         — API collections + fetch actions (depends on status)
 *   draft        — booking-in-progress fields
 *   availability — derived view of the world (depends on data + draft)
 *   validation   — submit-readiness predicates and the prepareSubmission
 *                  action (depends on status + data + draft + availability)
 *   effects      — cross-cutting reactive bridges (depends on data +
 *                  draft + availability)
 *
 * Each section file is self-contained and can be read top-to-bottom.
 * The setup function below threads the sections together and merges
 * their returns into a single flat surface so consumers continue to
 * call useBookingStore() and access fields by name as before — the
 * public API is preserved across the conversion to setup-style.
 */
export const useBookingStore = defineStore("bookings", () => {
    const status = useStatusSection();
    const data = useDataSection({ status });
    const draft = useDraftSection({ data });
    const availability = useAvailabilitySection({ data, draft });
    const validation = useValidationSection({
        status,
        data,
        draft,
        availability,
    });
    const effects = useEffectsSection({ data, draft, availability });

    return {
        ...status,
        ...data,
        ...draft,
        ...availability,
        ...validation,
        ...effects,
    };
});
