import fs from "fs-extra";
import fetch from "node-fetch";
import path from "path";
import { Observable } from "rxjs";
import {
  ASSET_DIR_LIST,
  findByGlob,
  MOCK_OBSERVER,
  POST_DIR_TRANSFORMED,
  WP_API_URL
} from "../util";

const urlById = (url: string, id: string) => `${url}/media/${id}`;

const listOfImagesByPost = async (post: any, url: string) => {
  const images = [];
  if (post.featured_media) {
    const postId = post.id;
    const mediaNumber = post.featured_media;
    const response = await fetch(urlById(url, mediaNumber));
    const { status } = response;
    // Save data and move on to the next page
    if (status === 200) {
      const json = await response.json();
      images.push({
        mediaNumber,
        link: json.guid.rendered,
        title: json.title.rendered || "",
        description: json.alt_text || "",
        postId,
      });
    }
  }
  return images.concat(post.bodyImages ? post.bodyImages : []);
};

const assets = async (url: string, observer = MOCK_OBSERVER) => {
  await fs.ensureDir(ASSET_DIR_LIST);
  const files = (await findByGlob("*.json", {
    cwd: POST_DIR_TRANSFORMED,
  })) as string[];
  observer.next(`Processing ${files.length} posts`);
  const queue = [...files].sort();
  let list: any[] = [];
  while (queue.length) {
    const file = queue.shift();
    const post = await fs.readJson(path.join(POST_DIR_TRANSFORMED, file ?? ''));
    const images = await listOfImagesByPost(post, url);
    list = list.concat(images);
    observer.next(
      `Processed ${list.length} images. (${files.length - queue.length} / ${
        files.length
      } posts)`
    );
  }

  await fs.writeJson(path.join(ASSET_DIR_LIST, "assets.json"), list, {
    spaces: 2,
  });
  observer.complete();
};

export default () => new Observable((observer) => assets(WP_API_URL, observer) as any);
