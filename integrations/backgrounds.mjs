/**
 * auto-backgrounds — ship only the public images the site actually references.
 *
 * Astro copies the whole `public/` directory into `dist/` on every build, so
 * every candidate wallpaper in `public/images/background_*.webp` ended up in
 * the deployed output even though `theme.background` (src/site.config.js) only
 * references a subset of them.
 *
 * This integration inspects the sources for `/images/...` references and, for
 * `astro build`, points `publicDir` at a filtered copy of `public/`:
 *
 *   - every file is kept as-is, except
 *   - files under `public/images/` that no source file references, which are
 *     dropped — instead the referenced ones are copied over, so only those
 *     reach `dist/`.
 *
 * Sources are scanned as text, so comments are stripped first. That matters:
 * the commented-out local pool kept in `theme.background` used to be read as
 * live references, which is why the wallpapers kept reaching `dist/images/`
 * after the pool moved to R2, and why the stale `avatar.webp` shipped too.
 *
 * The wallpapers and the avatar may be remote URLs (they are, today: Cloudflare
 * R2). Only paths starting with `/` are treated as local assets; those must
 * exist in `public/`, and the scan must see them, or the build fails — a typo
 * would otherwise silently yield a 404 wallpaper. When every image is remote
 * the scan finds nothing, which is expected: nothing is copied and `dist/`
 * ships without `images/`. `astro dev` still serves the real `public/`
 * directory, so development is untouched.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Absolute root-relative references such as "/images/background_02.webp".
const IMAGE_REFERENCE = /\/images\/([A-Za-z0-9._@-]+\.(?:avif|gif|jpe?g|png|svg|webp))/g;

const SCAN_DIRS = ["src", "content", "public"];
const SCAN_EXTENSIONS = new Set([
  ".astro",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".html",
]);

// Scratch copy of `public/` used as the build's publicDir. Inside `.astro/`
// (git-ignored) so it never shows up in the repository.
const BUILD_PUBLIC_DIR = ".astro/build-public";

/**
 * Drops comments from a source file before it is scanned.
 *
 * A `//` that follows a non-colon character starts a comment; `https://` does
 * not. This is a heuristic — it is only ever applied to text that is searched
 * for `/images/...` paths, never to anything that gets written out.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

async function walkFiles(dir, files) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, files);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
}

/** Collects the file names referenced as "/images/<name>" anywhere in the site sources. */
async function collectImageReferences(root) {
  const files = [];
  for (const dir of SCAN_DIRS) await walkFiles(path.join(root, dir), files);
  const references = new Set();
  for (const file of files) {
    const source = stripComments(await readFile(file, "utf8"));
    for (const match of source.matchAll(IMAGE_REFERENCE)) references.add(match[1]);
  }
  return references;
}

/** The image paths the theme config points at, if they are local ones. */
async function localThemeImages(root) {
  const { theme } = await import(pathToFileURL(path.join(root, "src/site.config.js")).href);
  const pool = Array.isArray(theme.background) ? theme.background : [theme.background];
  return [theme.avatar, ...pool].filter(
    (entry) => typeof entry === "string" && entry.startsWith("/"),
  );
}

export default function autoBackgrounds() {
  /** @type {string | undefined} */
  let buildPublicDir;

  return {
    name: "auto-backgrounds",
    hooks: {
      "astro:config:setup": async ({ config, command, updateConfig, logger }) => {
        const root = fileURLToPath(config.root);
        const publicDir = fileURLToPath(config.publicDir);
        const imagesDir = path.join(publicDir, "images");
        const references = await collectImageReferences(root);

        // Whatever the theme points at locally has to exist, and the scan has to
        // see it — otherwise the file is pruned and the page asks for a 404.
        const localImages = await localThemeImages(root);
        const missing = localImages.filter((entry) => !existsSync(path.join(publicDir, entry.slice(1))));
        const unseen = localImages.filter((entry) => !references.has(path.basename(entry)));
        if (missing.length > 0 || unseen.length > 0) {
          const lines = [
            ...missing.map((entry) => `  ${entry} — referenced by the theme config but not in public/`),
            ...unseen.map((entry) => `  ${entry} — referenced by the theme config but not seen by the scan`),
          ].join("\n");
          const message = `local image(s) would 404:\n${lines}`;
          // A missing wallpaper breaks the home page, so refuse to build.
          if (command === "build") throw new Error(`[auto-backgrounds] ${message}`);
          logger.warn(message);
        }

        if (command !== "build") return;

        if (!existsSync(imagesDir)) {
          // Nothing to prune; public/ is copied as-is.
          logger.info("public/images is empty — nothing to prune");
          return;
        }

        const images = (await readdir(imagesDir, { withFileTypes: true }))
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort();
        const used = images.filter((name) => references.has(name));
        const unused = images.filter((name) => !references.has(name));

        buildPublicDir = path.join(root, BUILD_PUBLIC_DIR);
        await rm(buildPublicDir, { recursive: true, force: true });
        await mkdir(buildPublicDir, { recursive: true });
        // Copy public/, minus every image no source file mentions.
        await cp(publicDir, buildPublicDir, {
          recursive: true,
          filter: (source) => {
            const relative = path.relative(imagesDir, source);
            const insideImages = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
            if (!insideImages) return true;
            // A sub-directory of images/ is kept; its files are filtered by name.
            if (!path.extname(relative)) return true;
            return references.has(path.basename(relative));
          },
        });

        // An empty `images/` would still be created by the copy above; drop it so
        // the output does not carry a directory that holds nothing.
        if (used.length === 0) {
          await rm(path.join(buildPublicDir, "images"), { recursive: true, force: true });
        }

        // Trailing slash matters: Astro resolves paths relative to this URL.
        updateConfig({ publicDir: pathToFileURL(buildPublicDir + path.sep) });

        const skipped = unused.length > 0 ? ` (skipped: ${unused.join(", ")})` : "";
        logger.info(`${used.length} of ${images.length} public image(s) copied into the build${skipped}`);
      },
      "astro:build:done": async () => {
        // The copy is scratch space; dist/ already has the files at this point.
        if (buildPublicDir) {
          await rm(buildPublicDir, { recursive: true, force: true });
          buildPublicDir = undefined;
        }
      },
    },
  };
}
