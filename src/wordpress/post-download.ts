import fs from "fs-extra";
import fetch from "node-fetch";
import path from "path";
import { Observable } from "rxjs";
import { MOCK_OBSERVER, POST_DIR_ORIGINALS, WP_API_URL } from "../util";

const urlForPage = (url: string, page: number) => `${url}/posts?page=${page}`;

const posts = async (url: string, observer = MOCK_OBSERVER) => {
  await fs.ensureDir(POST_DIR_ORIGINALS);

  const postsByPage = async (page = 1): Promise<void> => {
    observer.next(`Getting posts by page (${page})`);
    const response = await fetch(urlForPage(url, page));
    const { status } = response;
    // Save data and move on to the next page
    if (status === 200) {
      const json = await response.json();
      const dest = path.join(POST_DIR_ORIGINALS, `posts-${page}.json`);
      await fs.writeJson(dest, json);
      return postsByPage(page + 1);
    }
    // if it was working before, but it isn't anymore
    // we've reached the end of the paginated list
    if (status === 400) return observer.complete();
    // badness
    throw new Error(response.statusText);
  };
  // kick of recursive requests
  postsByPage();
};

export default () =>
  new Observable((observer) => posts(WP_API_URL, observer) as any);
