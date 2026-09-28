import { Lexer, type Token, type Tokens } from "marked";

const htmlTag = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][\w:-]*)(?:\s(?:[^"'<>]|"[^"]*"|'[^']*')*)?\s*\/?>/gi;
const omittedHtml = new Set(["script", "style", "pre", "table"]);
const blockHtml = new Set(["p", "div", "br", "hr", "li", "ul", "ol", "blockquote", "section", "article"]);

function htmlText(source: string, state: { hiddenTag: string | null }) {
  let text = "";
  let cursor = 0;
  for (const match of source.matchAll(htmlTag)) {
    const position = match.index ?? 0;
    if (!state.hiddenTag) text += source.slice(cursor, position);
    const name = match[1]?.toLowerCase();
    const closing = match[0].startsWith("</");
    if (state.hiddenTag) {
      if (closing && name === state.hiddenTag) state.hiddenTag = null;
    } else if (name && omittedHtml.has(name) && !closing && !match[0].endsWith("/>")) {
      state.hiddenTag = name;
    } else if (name && blockHtml.has(name)) text += " ";
    cursor = position + match[0].length;
  }
  if (!state.hiddenTag) text += source.slice(cursor);
  return text;
}

function decodeEntities(source: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return source.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

function readableText(tokens: Token[], state: { hiddenTag: string | null }, block = true): string {
  return tokens.map((token) => {
    if (token.type === "html") {
      const html = token as Tokens.HTML | Tokens.Tag;
      return htmlText(html.text, state) + (html.block ? " " : "");
    }
    if (state.hiddenTag) return "";
    switch (token.type) {
      case "paragraph":
      case "blockquote":
        return readableText((token as Tokens.Paragraph | Tokens.Blockquote).tokens, state, token.type === "blockquote") + " ";
      case "list":
        return (token as Tokens.List).items.map((item) => readableText(item.tokens, state) + " ").join("");
      case "strong":
      case "em":
      case "del":
      case "link":
        return readableText((token as Tokens.Strong | Tokens.Em | Tokens.Del | Tokens.Link).tokens, state, false);
      case "text": {
        const text = token as Tokens.Text;
        return text.tokens ? readableText(text.tokens, state, false) + (block ? " " : "") : text.text;
      }
      case "escape":
      case "codespan":
        return (token as Tokens.Escape | Tokens.Codespan).text;
      case "br":
      case "space":
        return " ";
      default:
        // Headings and non-prose blocks do not become a body excerpt.
        return "";
    }
  }).join("");
}

function plainText(source: string) {
  return htmlText(decodeEntities(source), { hiddenTag: null }).replace(/\s+/gu, " ").trim();
}

function shorten(text: string, limit: number) {
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : text;
}

function firstParagraph(tokens: Token[], state: { hiddenTag: string | null }): string {
  for (const token of tokens) {
    const text = token.type === "blockquote"
      ? firstParagraph((token as Tokens.Blockquote).tokens, state)
      : token.type === "paragraph" || token.type === "html"
        ? plainText(readableText([token], state))
        : "";
    if (text) return text;
  }
  return "";
}

export function summarizeEducationIntro(source: string): string {
  return shorten(firstParagraph(Lexer.lex(source, { gfm: true, breaks: true }), { hiddenTag: null }), 60);
}

export function summarizeEducationBody(source: string): string {
  const tokens = Lexer.lex(source, { gfm: true, breaks: true });
  return shorten(plainText(readableText(tokens, { hiddenTag: null })), 120);
}
