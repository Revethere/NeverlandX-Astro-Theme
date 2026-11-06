/**
 * The Moments stream is optional: `theme.moments.enable` in src/site.config.js
 * decides whether it exists at all.
 *
 * Astro routes come from files, so a feature that can be switched off cannot
 * live in src/pages/ — the file would keep producing a URL no matter what the
 * config says. Both Moments routes therefore live in src/moments/ and are
 * injected here only when the flag is on, which is also why turning it off
 * leaves no `/moments/` page behind at all.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export default function optionalRoutes() {
    return {
        name: "blog-optional-routes",
        hooks: {
            "astro:config:setup": async ({ config, injectRoute, logger }) => {
                const moduleFile = path.join(fileURLToPath(config.root), "src", "site.config.js");
                const { theme } = await import(pathToFileURL(moduleFile).href);
                const enabled = theme.moments?.enable !== false;

                if (!enabled) {
                    logger.info("moments are switched off (theme.moments.enable = false)");
                    return;
                }

                injectRoute({ pattern: "/moments", entrypoint: "./src/moments/page.astro" });
                injectRoute({ pattern: "/moments/feed/[chunk]", entrypoint: "./src/moments/feed/[chunk].astro" });
            },
        },
    };
}
