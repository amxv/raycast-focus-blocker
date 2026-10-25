import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patternToRegex } from "../src/patterns";

function matches(pattern: string, url: string) {
  return new RegExp(patternToRegex(pattern)).test(url);
}

describe("Website URL blocking", () => {
  it("blocks YouTube Shorts videos but not regular YouTube", () => {
    const rule = "https://www.youtube.com/shorts/*";
    assert.equal(matches(rule, "https://www.youtube.com/shorts/ABC123"), true);
    assert.equal(matches(rule, "https://www.youtube.com/shorts/ABC123?feature=share"), true);
    assert.equal(matches(rule, "https://www.youtube.com/shorts/"), true);
    assert.equal(matches(rule, "https://www.youtube.com/watch?v=ABC123"), false);
    assert.equal(matches(rule, "https://www.youtube.com/"), false);
    assert.equal(matches(rule, "https://www.youtube.com/feed/subscriptions"), false);
    assert.equal(matches(rule, "https://www.youtube.com/results?search_query=shorts"), false);
    assert.equal(matches(rule, "https://www.youtube.com/@creator/shorts"), false);
    assert.equal(matches(rule, "https://www.youtube.com.evil.org/shorts/ABC123"), false);
    assert.equal(matches(rule, "https://www.notyoutube.com/shorts/ABC123"), false);
  });

  it("blocks all pages and subdomains on a bare domain", () => {
    assert.equal(matches("reddit.com", "https://www.reddit.com/r/popular"), true);
    assert.equal(matches("reddit.com", "http://old.reddit.com/r/all"), true);
    assert.equal(matches("reddit.com", "https://reddit.com/"), true);
    assert.equal(matches("reddit.com", "https://notreddit.com"), false);
  });

  it("limits explicit path patterns to their intended host and path", () => {
    assert.equal(matches("https://example.com/distracting/*", "https://example.com/distracting/abc"), true);
    assert.equal(matches("https://example.com/distracting/*", "https://example.com/work"), false);
    assert.equal(matches("https://example.com/distracting/*", "https://www.example.com/distracting/abc"), false);
    assert.equal(matches("*.example.com/distracting/*", "https://www.example.com/distracting/abc"), true);
    assert.equal(matches("example.com/news", "https://example.com/newspaper"), false);
  });

  it("rejects invalid or dangerous rules", () => {
    for (const rule of ["", "javascript:alert(1)", "*", "http://", "example.com:443", "hello world", "https://example.com/#fragment", "https://example.com/?q=x"]) {
      assert.throws(() => patternToRegex(rule), undefined, rule);
    }
  });
});
