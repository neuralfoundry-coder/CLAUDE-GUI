/**
 * A small script injected at the top of srcdoc HTML to patch APIs that
 * throw SecurityError inside sandboxed iframes with opaque origins.
 *
 * - history.replaceState / pushState: reveal.js (and other libs) call
 *   these with a URL derived from `location`, but in a srcdoc iframe
 *   the origin is `null` and the URL is `about:srcdoc`, so the browser
 *   rejects any state URL that contains a real origin.
 */
const SRCDOC_SHIM_SCRIPT = `<script>(function(){
var _rs=history.replaceState,_ps=history.pushState;
history.replaceState=function(){try{return _rs.apply(this,arguments)}catch(e){}};
history.pushState=function(){try{return _ps.apply(this,arguments)}catch(e){}};
})();</script>`;

/**
 * Wrap HTML content with shims needed for safe srcdoc rendering.
 * Inserts the shim right after `<head>` (or `<html>`) when possible,
 * otherwise prepends it so it runs before any library code.
 */
export function wrapSrcdoc(html: string): string {
  // Try to inject after <head...>
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = headMatch.index! + headMatch[0].length;
    return html.slice(0, idx) + SRCDOC_SHIM_SCRIPT + html.slice(idx);
  }
  // Fallback: prepend
  return SRCDOC_SHIM_SCRIPT + html;
}
