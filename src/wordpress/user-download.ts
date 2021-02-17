import fs from "fs-extra";
import fetch from "node-fetch";
import path from "path";
import { Observable } from "rxjs";
import { MOCK_OBSERVER, USER_DIR_ORIGINALS, WP_API_URL } from "../util";

const urlForPage = (url: string, page: number) => `${url}/users?page=${page}`;

const users = async (url: string, observer = MOCK_OBSERVER) => {
  await fs.ensureDir(USER_DIR_ORIGINALS);

  const usersByPage = async (page = 1): Promise<void> => {
    observer.next(`Getting users by page (${page})`);
    const response = await fetch(urlForPage(url, page));
    const { status } = response;
    // Save data and move on to the next page
    if (status === 200) {
      const json = await response.json();
      if (json.length) {
        const dest = path.join(USER_DIR_ORIGINALS, `users-${page}.json`);
        await fs.writeJson(dest, json, { spaces: 2 });
        return usersByPage(page + 1);
      } else return observer.complete();
    }
    // if it was working before, but it isn't anymore
    // we've reached the end of the paginated list
    if (status === 400) return observer.complete();
    // badness
    throw new Error(response.statusText);
  };

  // kick off recursive requests
  usersByPage();
};

export default () =>
  new Observable((observer) => users(WP_API_URL, observer) as any);
