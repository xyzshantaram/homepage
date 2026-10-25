import type { Context } from "hono";
import { HOME_POST_COUNT, type Deps, type Route } from "../utils";

export function HomeRoute(deps: Deps): Route {
  return [
    "/",
    async (c: Context) => {
      const visible = (await deps.posts.list()).filter((post) => !post.hidden);
      return c.html(
        await deps.liquid.renderFile("index.liquid", {
          posts: visible.slice(0, HOME_POST_COUNT),
        }),
      );
    },
  ];
}
