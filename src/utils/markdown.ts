import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { escape } from "lodash";

export type ResolvedMedia =
  | string
  | { video: { webm: string; mp4: string } };

export type ImageResolver = (src: string) => Promise<ResolvedMedia>;

function createMarkdown(html: boolean) {
  const markdown = new MarkdownIt({ html, linkify: true }).use(footnote);

  const isImageOnly = (inline: any): boolean => {
    if (inline?.type !== "inline" || !inline.children?.length) {
      return false;
    }
    return inline.children.every(
      (child: any) =>
        child.type === "image" ||
        (child.type === "text" && !child.content.trim()),
    );
  };

  markdown.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const alt = self.renderInlineAsText(token.children ?? [], options, env);
    const video = token.meta?.video as
      | { webm: string; mp4: string }
      | undefined;

    if (video) {
      const attributes = new Set(
        (token.attrGet("title") ?? "")
          .split(",")
          .map((name: string) => name.trim().toLowerCase())
          .filter(Boolean),
      );
      const flags = ['preload="metadata"', "playsinline"];
      if (!attributes.has("nocontrols")) flags.push("controls");
      for (const name of ["muted", "autoplay", "loop"]) {
        if (attributes.has(name)) flags.push(name);
      }
      const sources =
        `<source src="${escape(video.webm)}" type="video/webm">` +
        `<source src="${escape(video.mp4)}" type="video/mp4">`;
      return (
        `<figure><video ${flags.join(" ")}>${sources}</video>` +
        `<figcaption>${escape(alt)}</figcaption></figure>\n`
      );
    }

    token.attrSet("alt", alt);
    const image = self.renderToken(tokens, index, options);
    return `<figure>${image}<figcaption>${escape(alt)}</figcaption></figure>\n`;
  };

  markdown.renderer.rules.paragraph_open = (
    tokens,
    index,
    options,
    _env,
    self,
  ) => {
    if (isImageOnly(tokens[index + 1])) {
      return "";
    }
    return self.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.paragraph_close = (
    tokens,
    index,
    options,
    _env,
    self,
  ) => {
    if (isImageOnly(tokens[index - 1])) {
      return "";
    }
    return self.renderToken(tokens, index, options);
  };

  markdown.renderer.rules.table_open = (tokens, index, options, _env, self) =>
    `<figure class="table-wrapper">${self.renderToken(tokens, index, options)}`;

  markdown.renderer.rules.table_close = (tokens, index, options, _env, self) =>
    `${self.renderToken(tokens, index, options)}</figure>`;

  return markdown;
}

const markdown = createMarkdown(true);
const pageMarkdown = createMarkdown(true);

async function render(
  // @ts-expect-error
  engine: MarkdownIt,
  source: string,
  resolveImage?: ImageResolver,
): Promise<string> {
  const env = {};
  const tokens = engine.parse(source, env);

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
          const resolved = await resolveImage(src);
          if (typeof resolved === "string") {
            token.attrSet("src", resolved);
          } else {
            token.meta = { ...(token.meta ?? {}), video: resolved.video };
          }
        } catch {
          // keep the original source when the resolver fails
        }
      }),
    );
  }

  return engine.renderer.render(tokens, engine.options, env);
}

export function renderMarkdown(
  source: string,
  resolveImage?: ImageResolver,
): Promise<string> {
  return render(markdown, source, resolveImage);
}

export function renderPageMarkdown(
  source: string,
  resolveImage?: ImageResolver,
): Promise<string> {
  return render(pageMarkdown, source, resolveImage);
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
