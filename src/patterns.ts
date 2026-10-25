/**
 * URL filters deliberately support a small, predictable syntax rather than an
 * arbitrary regex. DNR filters are anchored to the scheme and hostname so a
 * URL containing a blocked name in its query string will never be blocked.
 */
export function patternToRegex(input: string): string {
  const pattern = input.trim();
  if (!pattern || /\s/.test(pattern) || pattern.length > 500) {
    throw new Error("Enter one website or URL pattern (without spaces).");
  }

  let scheme = "https?";
  let remainder = pattern;
  const schemeMatch = /^(https?):\/\//i.exec(pattern);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    remainder = pattern.slice(schemeMatch[0].length);
  } else if (pattern.includes("://")) {
    throw new Error("Only http:// and https:// website patterns are supported.");
  }

  const slashIndex = remainder.indexOf("/");
  const rawHost = (slashIndex === -1 ? remainder : remainder.slice(0, slashIndex)).toLowerCase();
  const path = slashIndex === -1 ? "" : remainder.slice(slashIndex);
  const wildcardDomain = rawHost.startsWith("*.");
  const hostname = wildcardDomain ? rawHost.slice(2) : rawHost;

  if (
    !hostname.includes(".") ||
    !hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    /[?#]/.test(path)
  ) {
    throw new Error("Use a valid domain, optionally followed by a path, e.g. reddit.com or youtube.com/shorts/*.");
  }

  const escape = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const host = escape(hostname);
  // Bare domains block all subdomains. A named host with a URL path is exact;
  // to match subdomains for a path, explicitly write *.example.com/path/*.
  const matchSubdomains = wildcardDomain || (path === "" && !schemeMatch);
  const hostExpr = matchSubdomains ? `(?:[a-z0-9-]+\\.)*${host}` : host;
  const origin = `^${scheme}:\\/\\/${hostExpr}`;

  if (!path || path === "/") {
    return `${origin}(?:[\\/?#]|$)`;
  }
  const pathExpr = path.split("*").map(escape).join(".*");
  const suffix = path.endsWith("*") ? "" : "(?:[?#]|$)";
  return `${origin}${pathExpr}${suffix}`;
}

export function readableLabel(pattern: string): string {
  if (pattern === "https://www.youtube.com/shorts/*") return "YouTube Shorts";
  return pattern.replace(/^https?:\/\//, "").replace(/\/\*$/, "");
}
