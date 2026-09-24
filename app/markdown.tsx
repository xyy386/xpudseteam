import { createElement, type ReactNode } from "react";
import { Lexer, type Token, type Tokens } from "marked";
import katex from "katex";

const options = { gfm: true, breaks: true };

function safeLink(href: string): string | null {
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || /^\/(?!\/)/.test(href) || href.startsWith("#")) return href;
  return null;
}

function safeImage(href: string): string | null {
  if (/^https:\/\//i.test(href) || /^\/(?!\/)/.test(href)) return href;
  return null;
}

function MathFormula({ expression, display = false }: { expression: string; display?: boolean }) {
  try {
    const html = katex.renderToString(expression.trim(), { displayMode: display, throwOnError: true, trust: false });
    return <span className={display ? "markdown-math-display" : "markdown-math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <code className="markdown-math-error" title="公式格式有误，请检查 LaTeX 写法">{display ? `$$${expression}$$` : `$${expression}$`}</code>;
  }
}

function renderMathText(value: string, key: string): ReactNode {
  const expression = /(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$|(?<!\\)\$([^\n$]+?)(?<!\\)\$/g;
  const result: ReactNode[] = [];
  let position = 0;
  for (const match of value.matchAll(expression)) {
    const start = match.index ?? 0;
    if (start > position) result.push(value.slice(position, start));
    const tex = match[1] ?? match[2];
    const display = match[1] !== undefined;
    result.push(tex.trim() ? <MathFormula key={`${key}-math-${start}`} expression={tex} display={display} /> : match[0]);
    position = start + match[0].length;
  }
  if (position < value.length) result.push(value.slice(position));
  return result.length ? result : value;
}

function renderTokens(tokens: Token[], allowLinks = true): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${index}-${token.type}`;
    switch (token.type) {
      case "space": return null;
      case "text": {
        const value = token as Tokens.Text;
        return value.tokens?.length ? <span key={key}>{renderTokens(value.tokens, allowLinks)}</span> : renderMathText(value.text, key);
      }
      case "escape": return (token as Tokens.Escape).text;
      case "br": return <br key={key} />;
      case "strong": return <strong key={key}>{renderTokens((token as Tokens.Strong).tokens, allowLinks)}</strong>;
      case "em": return <em key={key}>{renderTokens((token as Tokens.Em).tokens, allowLinks)}</em>;
      case "del": return <del key={key}>{renderTokens((token as Tokens.Del).tokens, allowLinks)}</del>;
      case "codespan": return <code key={key}>{(token as Tokens.Codespan).text}</code>;
      case "link": {
        const link = token as Tokens.Link;
        const href = safeLink(link.href);
        return href && allowLinks ? <a key={key} href={href} target={/^https?:\/\//i.test(href) ? "_blank" : undefined} rel={/^https?:\/\//i.test(href) ? "noopener noreferrer" : undefined}>{renderTokens(link.tokens, allowLinks)}</a> : <span key={key}>{renderTokens(link.tokens, false)}</span>;
      }
      case "image": {
        const item = token as Tokens.Image;
        const src = safeImage(item.href);
        return src ? <img key={key} src={src} alt={item.text} loading="lazy" /> : item.text;
      }
      case "paragraph": {
        const paragraph = token as Tokens.Paragraph;
        const display = paragraph.text.match(/^\s*\$\$([\s\S]+?)\$\$\s*$/);
        return display ? <div className="markdown-formula-row" key={key}><MathFormula expression={display[1]} display /></div> : <p key={key}>{renderTokens(paragraph.tokens, allowLinks)}</p>;
      }
      case "heading": {
        const item = token as Tokens.Heading;
        const level = Math.min(6, Math.max(3, item.depth + 2));
        return createElement(`h${level}`, { key }, renderTokens(item.tokens, allowLinks));
      }
      case "blockquote": return <blockquote key={key}>{renderTokens((token as Tokens.Blockquote).tokens, allowLinks)}</blockquote>;
      case "list": {
        const list = token as Tokens.List;
        const items = list.items.map((item, itemIndex) => <li key={itemIndex}>{item.task && <input type="checkbox" checked={item.checked ?? false} readOnly disabled aria-label="任务状态" />}{renderTokens(item.tokens, allowLinks)}</li>);
        return list.ordered ? <ol key={key} start={typeof list.start === "number" ? list.start : undefined}>{items}</ol> : <ul key={key}>{items}</ul>;
      }
      case "code": {
        const item = token as Tokens.Code;
        return <pre key={key}><code>{item.text}</code></pre>;
      }
      case "table": {
        const table = token as Tokens.Table;
        return <div className="markdown-table-scroll" key={key}><table><thead><tr>{table.header.map((cell, cellIndex) => <th key={cellIndex} style={{ textAlign: cell.align ?? undefined }}>{renderTokens(cell.tokens, allowLinks)}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} style={{ textAlign: cell.align ?? undefined }}>{renderTokens(cell.tokens, allowLinks)}</td>)}</tr>)}</tbody></table></div>;
      }
      case "hr": return <hr key={key} />;
      case "html": return (token as Tokens.HTML).text;
      default: return "text" in token && typeof token.text === "string" ? token.text : null;
    }
  });
}

export function MarkdownText({ source, className = "" }: { source: string; className?: string }) {
  return <div className={`markdown-content ${className}`}>{renderTokens(Lexer.lex(source || "", options))}</div>;
}

export function MarkdownInline({ source }: { source: string }) {
  return <>{renderTokens(Lexer.lexInline(source || "", options), false)}</>;
}
