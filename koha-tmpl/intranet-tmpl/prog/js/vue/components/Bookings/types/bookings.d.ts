/**
 * Physical item that can be booked (minimum shape used across the UI).
 */
export type BookableItem = {
    /** Internal item identifier */
    item_id: Id;
    /** Koha item type code */
    item_type_id: string;
    /** Effective type after MARC policies (when present) */
    effective_item_type_id?: string;
    /** Owning or home library id */
    home_library_id: string;
    /** Optional descriptive fields used in UI/logs */
    title?: string;
    barcode?: string;
    external_id?: string;
    holding_library?: string;
    available_pickup_locations?: any;
    /** Localized strings container (when available) */
    _strings?: { item_type_id?: { str?: string } };
};

/**
 * Booking record (core fields only, as used by the UI).
 */
export type Booking = {
    booking_id: number;
    item_id: Id;
    start_date: ISODateString;
    end_date: ISODateString;
    status?: string;
    patron_id?: number;
};

/**
 * Active checkout record for an item relevant to bookings.
 */
export type Checkout = {
    item_id: Id;
    due_date: ISODateString;
};

/**
 * Library that can serve as pickup location with optional item whitelist.
 */
export type PickupLocation = {
    library_id: string;
    name: string;
    /** Allowed item ids for pickup at this location (when restricted) */
    pickup_items?: Array<Id>;
};

/**
 * Subset of circulation rules used by bookings logic (from backend API).
 */
export type CirculationRule = {
    /** Max booking length in days (effective, UI-enforced) */
    maxPeriod?: number;
    /** Base issue length in days (backend rule) */
    issuelength?: number;
    /** Renewal policy: length per renewal (days) */
    renewalperiod?: number;
    /** Renewal policy: number of renewals allowed */
    renewalsallowed?: number;
    /** Lead/trail periods around bookings (days) */
    leadTime?: number;
    leadTimeToday?: boolean;
    /** Optional calculated due date from backend (ISO) */
    calculated_due_date?: ISODateString;
    /** Optional calculated period in days (from backend) */
    calculated_period_days?: number;
    /** Constraint mode selection */
    booking_constraint_mode?: "range" | "end_date_only";
};

/** Visual marker type used in calendar tooltip and markers grid. */
export type MarkerType = "booked" | "checked-out" | "lead" | "trail";

/**
 * Marker used by calendar code (tooltips + aggregation).
 * Contains display label (itemName) and resolved barcode (or external id).
 */
export type CalendarMarker = {
    type: MarkerType;
    item: string;
    itemName: string;
    barcode: string | null;
};

/**
 * Result of availability calculation: Flatpickr disable function + daily map.
 */
export type AvailabilityResult = {
    disable: DisableFn;
    unavailableByDate: UnavailableByDate;
};

/**
 * Canonical map of daily unavailability across items.
 *
 * Keys:
 * - Outer key: date in YYYY-MM-DD (calendar day)
 * - Inner key: item id as string
 * - Value: set of reasons for unavailability on that day
 */
export type UnavailableByDate = Record<
    string,
    Record<string, Set<UnavailabilityReason>>
>;

/** Enumerates reasons an item is not bookable on a specific date.
 *
 * Lead variants distinguish the origin of a lead-period block:
 * - "lead": this date is in the lead window of an existing booking.
 * - "lead-floor": this date is within the minimum lead time from today
 *   (the floor applied before any new booking can start).
 * - "lead-theoretical": this date is within the lead time a hypothetical
 *   follow-up booking would need after an existing booking's trail.
 *
 * Hover feedback uses the distinction to attribute the block accurately.
 */
export type UnavailabilityReason =
    | "booking"
    | "checkout"
    | "lead"
    | "lead-floor"
    | "lead-theoretical"
    | "trail"
    | string;

/** Disable function for Flatpickr */
export type DisableFn = (date: Date) => boolean;

/** Options affecting constraint calculations (UI + rules composition). */
export type ConstraintOptions = {
    dateRangeConstraint?: string | null;
    maxBookingPeriod?: number | null;
    /** Start of the currently visible calendar range (on-demand marker build) */
    visibleStartDate?: Date | null;
    /** End of the currently visible calendar range (on-demand marker build) */
    visibleEndDate?: Date | null;
    /** Holiday dates (YYYY-MM-DD format) for constraint highlighting */
    holidays?: string[];
    /** On-demand loading flag */
    onDemand?: boolean;
};

/** Dependencies used for updating external widgets after booking changes. */
export type ExternalDependencies = {
    timeline: () => any;
    bookingsTable: () => any;
    patronRenderer: () => any;
    domQuery: (selector: string) => NodeListOf<HTMLElement>;
    logger: {
        warn: (msg: any, data?: any) => void;
        error: (msg: any, err?: any) => void;
        debug?: (msg: any, data?: any) => void;
    };
};

/** Generic Ref-like helper for accepting either Vue Ref or plain `{ value }`. */
export type RefLike<T> = import("vue").Ref<T> | { value: T };

/** Minimal patron shape used by composables. */
export type PatronLike = {
    patron_id?: number | string;
    category_id?: string | number;
    library_id?: string;
    cardnumber?: string;
};

/** Patron data from API with display label added by transformPatronData. */
export type PatronOption = PatronLike & {
    surname?: string;
    firstname?: string;
    /** Display label formatted as "surname firstname (cardnumber)" */
    label: string;
    library?: {
        library_id: string;
        name: string;
    };
};

/** Minimal parameter set for circulation rules fetching. */
export type RulesParams = {
    patron_category_id?: string | number;
    item_type_id?: Id;
    library_id?: string;
    start_date?: string;
};

/** Minimal shape of the Pinia booking store used by `useRulesFetcher`. */
export type BookingStoreLike = {
    selectedDateRange?: string[];
    circulationRules?: CirculationRule[];
    bookings?: Booking[];
    checkouts?: Checkout[];
    bookableItems?: BookableItem[];
    bookingItemId?: Id | null;
    bookingId?: Id | null;
    unavailableByDate?: UnavailableByDate;
    /** Holiday dates (YYYY-MM-DD format) */
    holidays?: string[];
};

/** Store actions used by `useRulesFetcher` to drive backend fetches. */
export type BookingStoreActions = {
    fetchPickupLocations: (biblionumber: Id, patronId: Id) => Promise<unknown>;
    invalidateCalculatedDue: () => void;
    fetchCirculationRules: (
        params: Record<string, unknown>
    ) => Promise<unknown>;
    /** Fetch holidays for a library within a date range */
    fetchHolidays?: (
        libraryId: string,
        startDate: string,
        endDate: string
    ) => Promise<unknown>;
};

/** Convenience alias for stores passed to fetchers. */
export type StoreWithActions = BookingStoreLike & BookingStoreActions;

/** Common result shape for `constrain*` helpers. */
export type ConstraintResult<T> = {
    filtered: T[];
    filteredOutCount: number;
    total: number;
    constraintApplied: boolean;
};

/** Aggregated counts by marker type for the markers grid. */
export type MarkerAggregation = Record<string, number>;

/**
 * Common identifier type used across UI (string or number).
 */
export type Id = string | number;

/** ISO-8601 date string (YYYY-MM-DD or full ISO as returned by backend). */
export type ISODateString = string;

/** Minimal item type shape used in constraints and selection UI. */
export type ItemType = {
    item_type_id: string;
    /** Display description (used by v-select label) */
    description?: string;
    /** Alternate name field (for backwards compatibility) */
    name?: string;
};
