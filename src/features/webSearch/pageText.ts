import { Parser } from "htmlparser2";

const ignored = new Set(["script", "style", "noscript", "template", "svg", "canvas", "nav", "footer", "form", "iframe"]);
const blocks = new Set(["p", "div", "section", "article", "main", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "pre", "blockquote", "tr", "br", "hr"]);
function normalize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t\r\f\v]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function extractPageText(html: string): { title: string; text: string } {
  const stack: { skip: boolean; title: boolean; main: boolean }[] = [];
  const body: string[] = [], main: string[] = [], title: string[] = [];
  const append = (text: string): void => {
    const current = stack.at(-1);
    if (current?.skip) return;
    if (current?.title) { title.push(text); return; }
    body.push(text);
    if (current?.main) main.push(text);
  };
  const parser = new Parser({
    onopentag(name, attrs) {
      const parent = stack.at(-1);
      stack.push({
        skip: !!parent?.skip || ignored.has(name) || "hidden" in attrs || attrs["aria-hidden"] === "true" || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.style ?? ""),
        title: !!parent?.title || name === "title",
        main: !!parent?.main || name === "main" || name === "article" || attrs.role === "main"
      });
      if (blocks.has(name)) append("\n");
      if (name === "li") append("• ");
    },
    ontext: append,
    onclosetag(name) { if (blocks.has(name)) append("\n"); stack.pop(); }
  }, { decodeEntities: true });
  parser.end(html);
  const primary = normalize(main.join(""));
  return { title: normalize(title.join("")).slice(0, 300), text: primary || normalize(body.join("")) };
}
export const normalizePageText = normalize;
