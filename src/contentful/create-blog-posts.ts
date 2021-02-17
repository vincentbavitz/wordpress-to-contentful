import fs from "fs-extra";
import path from "path";
import { Observable } from "rxjs";
import {
  ASSET_DIR_LIST,
  CONTENTFUL_FALLBACK_USER_ID,
  CONTENTFUL_LOCALE,
  findByGlob,
  MOCK_OBSERVER,
  POST_DIR_CREATED,
  POST_DIR_TRANSFORMED,
  USER_DIR_TRANSFORMED,
} from "../util";
import { CfPost } from "../wordpress/post-transform";

// Do not exceed ten, delay is an important factor too
// 8 processes and 1s delay seem to make sense, for 10p/s
const PROCESSES = 8;
// add delays to try and avoid API request limits in
// the parallel processes
const API_DELAY_DUR = 1000;
const UPLOAD_TIMEOUT = 60000;

const CONTENT_TYPE = "post";
const DONE_FILE_PATH = path.join(ASSET_DIR_LIST, "done.json");
const AUTHOR_FILE_PATH = path.join(USER_DIR_TRANSFORMED, "authors.json");
const RESULTS_PATH = path.join(POST_DIR_CREATED, "posts.json");

const delay = (dur = API_DELAY_DUR) =>
  new Promise((resolve) => setTimeout(resolve, dur));

const createBlogPosts = (
  posts: CfPost[],
  assets: any[],
  authors: any[],
  client: any,
  observer: any
) => {
  const [inlineMap, heroMap] = createMapsFromAssets(assets);
  const authorMap = createMapFromAuthors(authors);

  return new Promise((complete) => {
    const queue = [...posts];
    const processing = new Set();
    const done: any[] = [];
    const failed: any[] = [];

    observer.next(`Preparing to create ${queue.length} posts`);

    const logProgress = () => {
      observer.next(
        `Remaining: ${queue.length} (${processing.size} uploading, ${
          done.length
        } done, ${failed.length} failed)`
      );
    };

    const createBlogPost = (post: CfPost) => {
      const identifier = post.slug;
      processing.add(identifier);
      logProgress();

      return (
        Promise.race([
          new Promise((_, reject) => setTimeout(reject, UPLOAD_TIMEOUT)),
          new Promise(async (resolve, reject) => {
            await delay();

            const exists = await client.getEntries({
              content_type: CONTENT_TYPE,
              "fields.slug[in]": post.slug,
            });
            if (exists && exists.total > 0) {
              return reject({ error: "Post already exists", post: exists });
            }

            await delay();

            const created = await client.createEntry(
              CONTENT_TYPE,
              transform(post, inlineMap, heroMap, authorMap)
            );
            await delay();
            const published = await created.publish();
            await delay();
            resolve(published);
          }),
        ])

          // happy path
          .then((published) => {
            done.push(post);
          })
          // badness
          .catch((error) => {
            // TODO: retry failed
            failed.push({ post, error });
          })
          // either
          .finally(() => {
            processing.delete(identifier);
            logProgress();
            // more in queue case
            if (queue.length) createBlogPost(queue.shift() as CfPost);
            // no more in queue, but at lesat one parallel
            // process is in progress
            else if (processing.size) return;
            else complete({ done, failed });
          })
      );
    };
    // safely handle cases where there are less total
    // items than the amount of parallel processes
    let count = 0;
    while (queue.length && count < PROCESSES) {
      createBlogPost(queue.shift() as CfPost);
      count += 1;
    }
  });
};

function transform(
  post: CfPost,
  inlineMap: Map<any, any>,
  heroMap: Map<any, any>,
  authorMap: Map<any, any>
) {
  console.log("create-blog-posts ➡️ authorMap:", post);
  console.log("create-blog-posts ➡️ authorMap:", authorMap);

  return {
    fields: {
      title: {
        [CONTENTFUL_LOCALE]: post.title,
      },
      body: {
        [CONTENTFUL_LOCALE]: replaceInlineImageUrls(post.body, inlineMap),
      },
      description: {
        [CONTENTFUL_LOCALE]: post.description,
      },
      slug: {
        [CONTENTFUL_LOCALE]: post.slug,
      },
      publishedDate: {
        [CONTENTFUL_LOCALE]: post.publishedDate,
      },
      featureImage: {
        [CONTENTFUL_LOCALE]: {
          sys: {
            type: "Link",
            linkType: "Asset",
            id: heroMap.get(post.featuredMedia),
          },
        },
      },
      author: {
        [CONTENTFUL_LOCALE]: {
          sys: {
            type: "Link",
            linkType: "Entry",
            id: authorMap.has(post.author)
              ? authorMap.get(post.author)
              : CONTENTFUL_FALLBACK_USER_ID,
          },
        },
      },
    },
  };
}

function replaceInlineImageUrls(text: string, map: Map<any, any>) {
  let replacedText = text;
  map.forEach((newUrl, oldUrl) => {
    replacedText = replacedText.replace(oldUrl, newUrl);
  });
  return replacedText;
}

function createMapsFromAssets(assets: any[]) {
  const links = new Map();
  const heros = new Map();
  assets.forEach((asset) =>
    links.set(asset.wordpress.link, asset.contentful.url)
  );
  assets.forEach(
    (asset) =>
      asset.wordpress.mediaNumber &&
      heros.set(asset.wordpress.mediaNumber, asset.contentful.id)
  );
  return [links, heros];
}

function createMapFromAuthors(authors: any[]) {
  const map = new Map();
  authors.forEach((author) => {
    console.log("author", author);
    if (author.contentful) map.set(author.wordpress.id, author.contentful.id);
  });
  return map;
}

async function processBlogPosts(client: any, observer = MOCK_OBSERVER) {
  const files = (await findByGlob("*.json", {
    cwd: POST_DIR_TRANSFORMED,
  })) as any[];
  const queue = [...files].sort();
  const posts = [];
  while (queue.length) {
    const file = queue.shift();
    const post = await fs.readJson(path.join(POST_DIR_TRANSFORMED, file));
    posts.push(post);
  }

  const assets = await fs.readJson(DONE_FILE_PATH);
  const authors = await fs.readJson(AUTHOR_FILE_PATH);

  const result = await createBlogPosts(
    posts,
    assets,
    authors,
    client,
    observer
  );

  await fs.ensureDir(POST_DIR_CREATED);
  await fs.writeJson(RESULTS_PATH, result, { spaces: 2 });
  return result;
}

export default (client: any) =>
  new Observable(
    (observer) =>
      processBlogPosts(client, observer).then(() => observer.complete()) as any
  );

// debug
// (async () => {
//   const client = await require("./create-client")();
//   processBlogPosts(client).then(console.log);
// })();
