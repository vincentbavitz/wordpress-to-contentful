import * as parser from "contentful-html-to-richtext";
import { RootContentfulNode } from "contentful-html-to-richtext";
import fs from "fs-extra";
import html2plaintext from "html2plaintext";
import path from "path";
import { Observable } from "rxjs";
import {
  findByGlob,
  MOCK_OBSERVER,
  POST_DIR_ORIGINALS,
  POST_DIR_TRANSFORMED,
  REDIRECTS_DIR,
  REDIRECT_BASE_URL,
} from "../util";

export interface Redirect {
  link: string;
  slug: string;
}

export interface WpPost {
  _links: any;
  guide: string;
  excerpt: {
    rendered: string;
  };
  comment_status: string;
  ping_status: string;
  categories: number[];
  template: string;
  format: string;
  meta: string;
  slug: string;
  status: string;
  author: string;
  type: string;
  date_gmt: string;
  date: string;
  modified: string;
  modified_gmt: string;
  tags: number[];
  sticky: boolean;
  content: {
    rendered: string;
  };
  title: {
    rendered: string;
  };
  featured_media: any;
  link: string;
}

export interface CfPost {
  title: string;
  author: string;
  description: string;
  tags: number[];
  slug: string;
  body: RootContentfulNode;
  date: string;
  category: number;
  featuredMedia: number;
  link: string;
}

const extractImages = (post: any) => {
  const regex = /<img.*?src="(.*?)"[\s\S]*?alt="(.*?)"/g;
  post.bodyImages = [];

  let foundImage: RegExpExecArray | null;
  while ((foundImage = regex.exec(post.body))) {
    const alt = foundImage[2] ? foundImage[2].replace(/_/g, " ") : "";
    post.bodyImages.push({
      link: foundImage[1],
      description: alt,
      title: alt,
      postId: post.id,
    });
  }
  return post;
};

function convertToRichText(post: CfPost): CfPost {
  return {
    ...post,
    body: parser.generateRichText(post.body),
  };
}

const transform = (wpPost: WpPost) => {
  const post: CfPost = {
    title: wpPost.title.rendered,
    description: (html2plaintext as (value: string) => string)(
      wpPost.excerpt.rendered || ""
    ),
    author: wpPost.author,
    date: wpPost.date_gmt + "+00:00",
    body: wpPost.content.rendered,
    slug: wpPost.slug,
    category: wpPost.categories[0],
    featuredMedia: wpPost.featured_media,
    tags: wpPost.tags,
    link: wpPost.link,
  };

  return { slug: post.slug, post: convertToRichText(extractImages(post)) };
};

const writePost = (name: string, data: any) =>
  fs.writeJson(path.join(POST_DIR_TRANSFORMED, `${name}.json`), data, {
    spaces: 2,
  });

const postLinkToRedirectSource = (link: any, base = REDIRECT_BASE_URL) =>
  link.replace(base, "");
const postSlugToRedirectDestination = (slug: string) => `/blog/${slug}`;
const formatAsRedirect = ({ link, slug }: { link: string; slug: string }) =>
  `${postLinkToRedirectSource(link)}     ${postSlugToRedirectDestination(
    slug
  )}`;

const writeRedirects = (rdrx: Redirect[]) => {
  const txt = rdrx.map(formatAsRedirect).join("\n");
  return fs.writeFile(path.join(REDIRECTS_DIR, `posts`), txt);
};

const transformByPage = async (observer = MOCK_OBSERVER) => {
  // get paginated raw posts from directory created in previous step
  await fs.ensureDir(POST_DIR_TRANSFORMED);
  await fs.ensureDir(REDIRECTS_DIR);
  const files = (await findByGlob("*.json", {
    cwd: POST_DIR_ORIGINALS,
  })) as any[];
  observer.next(`Found ${files.length} pages of posts`);

  const queue = [...files].sort(); // create a queue to process
  const redirects: Redirect[] = [];
  let count = 0; // progress indicator
  while (queue.length) {
    const file = queue.shift();
    const page = await fs.readJson(path.join(POST_DIR_ORIGINALS, file));
    while (page.length) {
      // grab post off the page stack
      const post = page.shift();
      // increment progress and show update
      count += 1;
      observer.next(`Processing post ${count}`);
      // transform the wordpress post into the expected format
      const { slug: name, post: data } = transform(post);
      // save relevant information for redirects
      const { link, slug } = data;
      redirects.push({ link, slug });
      // save processed post by slug for later
      await writePost(name, data);
    }
  }

  await writeRedirects(redirects);

  observer.complete(`Successfully tranfsormed ${count} posts`);
};

export default () =>
  new Observable((observer) => transformByPage(observer) as any);
