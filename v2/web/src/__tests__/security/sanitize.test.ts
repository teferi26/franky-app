/**
 * XSS regression tests for the sanitise pipeline.
 *
 * These payloads are the OWASP cheatsheet "level 1" classics. The pipeline
 * must NEUTRALISE every one of them. Neutralised means one of two things:
 *   - escaped: markdown-it (`html: false`) turns raw HTML into inert text
 *     (`&lt;script&gt;…`). The dangerous string may still be VISIBLE in the
 *     output, but as text content, not as markup.
 *   - stripped: DOMPurify removes anything that survives to the HTML layer.
 *
 * Because "escaped" is a valid (and the most common) outcome, asserting on
 * raw substrings like `/onerror=/` would false-positive on inert text. So the
 * real guarantee is checked on the PARSED DOM: no element outside the
 * allowlist, no event-handler attribute, no dangerous URI scheme in any
 * URI-bearing attribute.
 *
 * Run with `pnpm test` / `vitest` (jsdom environment — DOMParser available).
 */

import { describe, it, expect } from "vitest";
import { renderSafeMarkdown, sanitizeHtml, SAFE_TAGS } from "@/lib/sanitize";

const ALLOWED_TAGS = new Set(SAFE_TAGS);

const URI_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href", "data"]);
const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript):/i;

/**
 * Assert the REAL safety guarantee: when the output is parsed as HTML
 * (exactly what dangerouslySetInnerHTML does), the resulting DOM contains
 * only allowlisted elements, no on* handlers, and no executable URI schemes.
 */
function expectInertHtml(output: string) {
  const body = new DOMParser().parseFromString(output, "text/html").body;
  for (const el of Array.from(body.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    expect(ALLOWED_TAGS.has(tag), `forbidden element <${tag}> in: ${output}`).toBe(true);
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      expect(name, `event handler on <${tag}> in: ${output}`).not.toMatch(/^on/);
      if (URI_ATTRS.has(name)) {
        expect(attr.value, `dangerous URI in ${name} on <${tag}>`).not.toMatch(DANGEROUS_SCHEME);
      }
    }
  }
}

const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  "<script src=//evil.com></script>",
  "<img src=x onerror=alert(1)>",
  '<a href="javascript:alert(1)">click</a>',
  "<svg onload=alert(1)>",
  "<iframe src=javascript:alert(1)></iframe>",
  "<body onload=alert(1)>",
  "<input autofocus onfocus=alert(1)>",
  "<details open ontoggle=alert(1)>",
  "<svg><script>alert(1)</script></svg>",
  '"><script>alert(1)</script>',
  "<math><mtext><a xlink:href=javascript:alert(1)>click</a></mtext></math>",
  "<style>@import url(//evil.com)</style>",
  "<link rel=stylesheet href=javascript:alert(1)>",
  "<object data=javascript:alert(1)></object>",
  "<embed src=javascript:alert(1)>",
  "<form action=javascript:alert(1)><input type=submit></form>",
];

const SAFE_INPUTS = [
  "Hola **mundo**!",
  "Mira esta web: https://franky.es",
  "* Lista uno\n* Lista dos",
  "Un párrafo normal con palabras.",
  "## Subtítulo\n\nTexto **negrita** y *cursiva*.",
];

describe("renderSafeMarkdown — XSS payloads", () => {
  for (const payload of XSS_PAYLOADS) {
    it(`neutralises: ${payload.slice(0, 50)}…`, () => {
      const output = renderSafeMarkdown(payload);
      // Raw markup must never survive as markup. `<` in inert text is
      // escaped to &lt; so these literal checks hold for both outcomes.
      expect(output).not.toMatch(/<script/i);
      expect(output).not.toMatch(/<iframe/i);
      expect(output).not.toMatch(/<object/i);
      expect(output).not.toMatch(/<embed/i);
      expect(output).not.toMatch(/<form/i);
      expect(output).not.toMatch(/<style/i);
      // The strong guarantee, on the parsed DOM.
      expectInertHtml(output);
    });
  }
});

describe("renderSafeMarkdown — preserves safe markdown", () => {
  for (const input of SAFE_INPUTS) {
    it(`renders: ${input.slice(0, 40)}…`, () => {
      const output = renderSafeMarkdown(input);
      // Some markdown should produce some HTML — at minimum a <p>.
      expect(output.length).toBeGreaterThan(0);
      expectInertHtml(output);
    });
  }

  it("converts **bold** to <strong>", () => {
    expect(renderSafeMarkdown("Hola **mundo**!")).toContain("<strong>mundo</strong>");
  });

  it("auto-links URLs and adds rel=noopener", () => {
    const output = renderSafeMarkdown("Visita https://franky.es para más");
    expect(output).toContain('href="https://franky.es"');
    expect(output).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(output).toMatch(/rel="[^"]*nofollow[^"]*"/);
  });

  it("forces target=_blank on external links", () => {
    expect(renderSafeMarkdown("https://franky.es")).toContain('target="_blank"');
  });

  it("keeps rel and target on explicit markdown links", () => {
    // Regression: a custom ALLOWED_URI_REGEXP without the non-URI-value
    // alternation made DOMPurify strip rel/target from every link.
    const output = renderSafeMarkdown("[Franky](https://franky.es)");
    expect(output).toContain('href="https://franky.es"');
    expect(output).toMatch(/rel="[^"]*noopener[^"]*"/);
    expect(output).toContain('target="_blank"');
  });
});

describe("renderSafeMarkdown — edge cases", () => {
  it("handles empty / non-string input", () => {
    expect(renderSafeMarkdown("")).toBe("");
    // @ts-expect-error — testing the runtime guard
    expect(renderSafeMarkdown(null)).toBe("");
    // @ts-expect-error — testing the runtime guard
    expect(renderSafeMarkdown(undefined)).toBe("");
  });

  it("caps absurdly long input without crashing", () => {
    const huge = "a".repeat(500_000);
    const output = renderSafeMarkdown(huge);
    expect(output.length).toBeLessThan(250_000);
  });

  it("never emits a clickable data: link", () => {
    // markdown-it's validateLink rejects data: destinations, so the markdown
    // stays as plain text ("[click](data:…)" rendered as inert text). The
    // guarantee is that no <a> with a data:/javascript: href ever comes out.
    const output = renderSafeMarkdown("[click](data:text/html,<script>alert(1)</script>)");
    expectInertHtml(output);
    const body = new DOMParser().parseFromString(output, "text/html").body;
    expect(body.querySelector("a")).toBeNull();
  });

  it("never emits a clickable javascript: link", () => {
    const output = renderSafeMarkdown("[click](javascript:alert(1))");
    expectInertHtml(output);
    const body = new DOMParser().parseFromString(output, "text/html").body;
    expect(body.querySelector("a")).toBeNull();
  });
});

describe("sanitizeHtml", () => {
  it("strips script tags from pre-rendered HTML", () => {
    expect(sanitizeHtml("<p>hola</p><script>alert(1)</script>")).not.toMatch(/script/i);
  });

  it("preserves safe content", () => {
    const output = sanitizeHtml("<p><strong>hola</strong></p>");
    expect(output).toContain("<strong>hola</strong>");
  });

  it("strips XSS payloads down to inert DOM", () => {
    for (const payload of XSS_PAYLOADS) {
      expectInertHtml(sanitizeHtml(payload));
    }
  });

  it("keeps rel and target on hardened links", () => {
    const output = sanitizeHtml('<a href="https://franky.es" rel="noopener" target="_blank">x</a>');
    expect(output).toContain('rel="noopener"');
    expect(output).toContain('target="_blank"');
  });
});
