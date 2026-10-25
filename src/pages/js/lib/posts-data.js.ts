/**
 * window.__POSTS_DATA__ — the search index, at the URL the theme expects
 * (/js/lib/posts-data.js). Ported from scripts/posts-data-generator.js.
 */
import { contentOf, getPosts, sortByDateDesc } from "../../../lib/content.js";

export function GET() {
    const posts = sortByDateDesc(getPosts());

    const data = posts.map((post) => ({
        title: post.title,
        path: post.href,
        date: post.date.label,
        categories: post.categories.map((category) => ({
            name: category.name,
            path: category.href,
        })),
        tags: post.tags.map((tag) => ({ name: tag.name, path: tag.href })),
        // A literal </script> in a post body would end the inline data script.
        content: contentOf(post).replace(/<\/script/gi, "<\\/script"),
    }));

    return new Response(`window.__POSTS_DATA__ = ${JSON.stringify(data)};`, {
        headers: {
            "Content-Type": "application/javascript; charset=utf-8",
        },
    });
}
