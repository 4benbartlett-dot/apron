/**
 * The browser-storage keys a session lives under. They were typed where they
 * were used: the moves key in three files, the board key in two, four times.
 * A leaf module with no imports, so the error pages (which must not pull in
 * the league) can use it too. The `_v1` suffix is the format's version: what
 * is saved in people's browsers has to keep loading, so a key only changes
 * when its contents can no longer be read by the code that reads it.
 */

/** The session's move list (JSON `Move[]`), read by lib/store.ts. */
export const MOVES_KEY = "apron_gm_moves_v1";
/** The visitor's own move list, set aside when they change a shared one. */
export const MOVES_BACKUP_KEY = "apron_gm_moves_prev_v1";
/** The teams on the board (JSON `string[]`, at most eight). */
export const BOARD_KEY = "apron_board_v1";
