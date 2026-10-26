import type { Context } from "hono";
import { sessionFromRequest } from "../admin";
import type { Deps, Route } from "../utils";

const REDIRECTS = [
  "/contact/donate",
  "/contact/donate/",
  "/contact/donate.html",
  "/donate/",
];

export function PageRoutes(deps: Deps): Route[] {
  const page = (slug: string) => async (c: Context) => {
    const entry = await deps.pages.get(slug);
    if (!entry) {
      return c.notFound();
    }

    const admin = Boolean(sessionFromRequest(c, deps.admin));
    const components = await deps.pages.resolveComponents(entry);
    return c.html(
      await deps.liquid.renderFile("page.liquid", {
        ...entry,
        components,
        body: await deps.pages.render(entry),
        admin,
      }),
    );
  };

  return [
    ["/contact", page("contact")],
    ["/contact/", page("contact")],
    ["/services", page("services")],
    ["/services/", page("services")],
    ["/donate", page("donate")],
    ...REDIRECTS.map(
      (path) => [path, (c: Context) => c.redirect("/donate", 301)] as Route,
    ),
  ];
}
