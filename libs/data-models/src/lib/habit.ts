// libs/data-models/src/lib/habit.ts
// Defines the core data model for a Habit

/**
 * Represents a habit with a name, daily target repetitions, and a log of completions per day.
 */
export interface Habit {
  /** Unique identifier for the habit */
  id: string;
  /** Human-readable name of the habit */
  name: string;
  /** Number of times the habit should be completed each day */
  repeatsPerDay: number;
  /**
   * Logs of completions.
   * Keys are dates in ISO format (YYYY-MM-DD), values are how many times completed on that date.
   */
  logs: Record<string, number>;
}
