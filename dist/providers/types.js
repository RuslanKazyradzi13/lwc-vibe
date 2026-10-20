/**
 * Optional AI advisory providers for the Evidence Gate.
 *
 * A provider receives a small, explicitly built payload (never the repository) and returns
 * advisory items. Advisory items are kept apart from deterministic results: they never change
 * the gate verdict, never remove a finding and are always labelled as AI output.
 */
export {};
