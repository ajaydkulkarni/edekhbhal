const allowedTags = new Set([
  "p","br","div","span","strong","b","em","i","u","ul","ol","li",
  "h1","h2","h3","h4","blockquote"
]);

export function sanitizeRichText(input: string): string {
  let html = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tagRaw, attrs) => {
    const tag = String(tagRaw).toLowerCase();
    if (!allowedTags.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;

    let safeStyle = "";
    const styleMatch = String(attrs).match(/style\s*=\s*["']([^"']*)["']/i);
    if (styleMatch) {
      const declarations = styleMatch[1].split(";").map((x: string) => x.trim()).filter(Boolean);
      const safe = declarations.filter((decl: string) =>
        /^(font-size)\s*:\s*(10|12|14|16|18|20|24|28|32)px$/i.test(decl)
      );
      if (safe.length) safeStyle = ` style="${safe.join("; ")}"`;
    }
    return `<${tag}${safeStyle}>`;
  });

  return html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export function richTextToPlainText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
