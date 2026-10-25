import { defineConfig } from "astro/config";

import autoBackgrounds from "./integrations/backgrounds.mjs";

export default defineConfig({
    // Ships only the wallpapers referenced by the sources, not every candidate
    // in public/images/background_*.webp. See integrations/backgrounds.mjs.
    integrations: [autoBackgrounds()],
    // The deployed origin. Only used to make absolute URLs absolute; every link
    // in the markup is root-relative, exactly like the Hexo build.
    site: "https://example.com",
    // Directories with an index.html (/about/index.html served as /about/).
    build: { format: "directory" },
    devToolbar: { enabled: false },
});
