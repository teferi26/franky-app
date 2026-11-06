/**
 * Centralised HTML sanitisation for user-generated and AI-generated content.
 *
 * Why this exists:
 * - FrankyAIChat originally used a homegrown regex-based `formatMarkdown` and
 *   rendered it via `dangerouslySetInnerHTML`. Gemini responses are
 *   attacker-controllable (prompt injection), so the regex was a viable XSS
 *   vector — a single `<script>` or `onerror=` would have executed.
 * - This module is the ONLY allowed path between untrusted text and the DOM.
 *   Anything else with `dangerouslySetInnerHTML` must import from here.
 *
 * Two helpers:
 *   - `renderSafeMarkdown(input)` for AI replies, comments, descriptions —
 *     accepts a subset of Markdown, returns sanitised HTML.
 *   - `sanitizeHtml(input)` for pre-rendered HTML from trusted-ish sources
 *     (e.g. CMS preview, email previews) that still needs a final scrub.
 */

import DOMPurify from "isomorphic-dompurify";
import MarkdownIt from "markdown-it";

// `html: false` blocks raw <script>, <style>, <iframe> at the parser stage.
// `linkify: true` auto-wraps URLs into <a>; we whitelist href + rel below
// and force rel="noopener nofollow ugc" via the renderer override.
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
});

// Force every <a> rendered by markdown-it to be hardened against tabnabbing
// and to mark untrusted user content (rel="ugc").
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hrefIdx = token.attrIndex("href");
  if (hrefIdx >= 0) {
    const href = token.attrs?.[hrefIdx]?.[1] ?? "";
    // Block javascript: / data: / vbscript: URIs at the source. DOMPurify
    // does this too, but failing twice is cheap.
    if (/^(javascript|data|vbscript):/i.test(href.trim())) {
      token.attrs![hrefIdx][1] = "#blocked";
    }
  }
  const relIdx = token.attrIndex("rel");
  const relValue = "noopener noreferrer nofollow ugc";
  if (relIdx < 0) {
    token.attrPush(["rel", relValue]);
  } else {
    token.attrs![relIdx][1] = relValue;
  }
  const targetIdx = token.attrIndex("target");
  if (targetIdx < 0) {
    token.attrPush(["target", "_blank"]);
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// Tags we explicitly allow in the output. Everything else is stripped.
// Exported so the security tests assert against the same list (no drift).
export const SAFE_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

const SAFE_ATTRS = ["href", "rel", "target", "title"];

const PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: SAFE_TAGS,
  ALLOWED_ATTR: SAFE_ATTRS,
  // Forbid every URI scheme except https?/mailto/tel. CAUTION: DOMPurify runs
  // this regexp against the value of EVERY attribute not in its built-in
  // "never a URI" list (rel and target are not in that list), so the pattern
  // must also accept non-URI values. The `[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$)`
  // alternation (copied from DOMPurify's default) accepts anything that does
  // not look like a `scheme:` prefix — e.g. rel="noopener", target="_blank",
  // "#fragment" — while still rejecting javascript:, data:, vbscript:, ftp:.
  // Protocol-relative hrefs (//evil.com) pass, as in DOMPurify's default:
  // they inherit the page protocol (https) and are not an executable scheme.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
  FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover", "onfocus", "srcset", "formaction"],
  // Do NOT add USE_PROFILES here: it silently overrides ALLOWED_TAGS and
  // ALLOWED_ATTR (per DOMPurify docs they must not be combined), which is how
  // target="_blank" and rel="noopener" were being stripped from links.
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
};

/**
 * Render an untrusted Markdown string as sanitised HTML.
 * Use this for AI replies, user-generated comments, bios, etc.
 */
export function renderSafeMarkdown(input: string): string {
  if (!input || typeof input !== "string") return "";
  // Cap pathological input. 200KB is more than any legit Gemini reply or comment.
  const capped = input.length > 200_000 ? input.slice(0, 200_000) : input;
  const rendered = md.render(capped);
  return DOMPurify.sanitize(rendered, PURIFY_CONFIG) as unknown as string;
}

/**
 * Sanitise pre-rendered HTML. Use only when the source is somewhat trusted
 * (e.g. CMS output, transactional email preview) but still needs a final scrub.
 * For untrusted markdown text, always prefer `renderSafeMarkdown`.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") return "";
  const capped = input.length > 200_000 ? input.slice(0, 200_000) : input;
  return DOMPurify.sanitize(capped, PURIFY_CONFIG) as unknown as string;
}
