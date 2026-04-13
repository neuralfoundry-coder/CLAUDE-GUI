/**
 * Per-tab browser session identifier.
 *
 * Each browser tab gets a unique UUID stored in `sessionStorage` (which is
 * tab-scoped by spec).  The ID survives page refreshes but a new tab always
 * gets a fresh one.  The server uses this to maintain independent project
 * state per tab.
 */

const SESSION_KEY = 'claudegui-browser-id';

export function getBrowserId(): string {
  if (typeof sessionStorage === 'undefined') return 'default';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
