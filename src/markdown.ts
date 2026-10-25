import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { escape } from "lodash";

const markdown = new MarkdownIt({ html: false, linkify: true }).use(footnote);

function isImageOnly(inline: any): boolean {
  if (inline?.type !== "inline" || !inline.children?.length) {
    return false;
  }
  return inline.children.every(
    (child: any) =>
      child.type === "image" ||
      (child.type === "text" && !child.content.trim()),
  );
}

markdown.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const alt = self.renderInlineAsText(token.children ?? [], options, env);
  token.attrSet("alt", alt);
  const image = self.renderToken(tokens, index, options);
  return `<figure>${image}<figcaption>${escape(alt)}</figcaption></figure>\n`;
};

markdown.renderer.rules.paragraph_open = (tokens, index, options, _env, self) => {
  if (isImageOnly(tokens[index + 1])) {
    return "";
  }
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.paragraph_close = (tokens, index, options, _env, self) => {
  if (isImageOnly(tokens[index - 1])) {
    return "";
  }
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.table_open = (tokens, index, options, _env, self) =>
  `<figure class="table-wrapper">${self.renderToken(tokens, index, options)}`;

markdown.renderer.rules.table_close = (tokens, index, options, _env, self) =>
  `${self.renderToken(tokens, index, options)}</figure>`;

export type ImageResolver = (src: string) => Promise<string>;

export async function renderMarkdown(
  source: string,
  resolveImage?: ImageResolver,
): Promise<string> {
  const env = {};
  const tokens = markdown.parse(source, env);

  if (resolveImage) {
    const images: any[] = [];
    const visit = (list: any[]) => {
      for (const token of list) {
        if (token.type === "image") {
          images.push(token);
        }
        if (token.children) {
          visit(token.children);
        }
      }
    };
    visit(tokens);

    await Promise.all(
      images.map(async (token) => {
        const src = token.attrGet("src");
        if (!src) return;
        try {
          token.attrSet("src", await resolveImage(src));
        } catch {
          // keep the original source when the resolver fails
        }
      }),
    );
  }

  return markdown.renderer.render(tokens, markdown.options, env);
}

export function excerpt(source: string): string {
  const text = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text;
}
