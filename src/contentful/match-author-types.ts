import fs from "fs-extra";
import path from "path";
import { Observable } from "rxjs";
import {
  CONTENTFUL_LOCALE,
  findByGlob,
  MOCK_OBSERVER,
  USER_DIR_ORIGINALS,
  USER_DIR_TRANSFORMED,
} from "../util";
const OUTPUT_DATA_PATH = path.join(USER_DIR_TRANSFORMED, "authors.json");
const CF_USER_TYPE = "author";

const sanitizeName = (s: string) => s.toLowerCase().replace(/\ /gi, "");

async function findUserInContentful(wpUser: any, cfUsers: any) {
  const found = cfUsers
    .map(transformCfUser)
    .find(({ name = "" }) => sanitizeName(wpUser.name) === sanitizeName(name));

  return {
    wordpress: {
      id: wpUser.id,
      name: wpUser.name,
    },
    contentful: found || null,
  };
}

function transformCfUser(cfUser: any) {
  return {
    id: cfUser.sys.id,
    name: cfUser.fields.name[CONTENTFUL_LOCALE],
  };
}

async function processSavedUsers(client: any, observer = MOCK_OBSERVER) {
  const files = (await findByGlob("*.json", {
    cwd: USER_DIR_ORIGINALS,
  })) as Blob[];
  const users: any[] = [];
  const queue: any[] = [...files];
  const output = [];

  while (queue.length) {
    const file = queue.shift();
    const page = await fs.readJson(path.join(USER_DIR_ORIGINALS, file));
    page.forEach((user: any) => users.push(user));
  }

  const { items: cfUsers } = await client.getEntries({
    content_type: CF_USER_TYPE,
  });

  while (users.length) {
    const user = users.shift();
    const result = await findUserInContentful(user, cfUsers);
    output.push(result);
  }

  await fs.ensureDir(USER_DIR_TRANSFORMED);
  await fs.writeJson(OUTPUT_DATA_PATH, output, { spaces: 2 });
  return output;
}

export default (client: any) =>
  new Observable(
    (observer) =>
      processSavedUsers(client, observer).then(() => observer.complete()) as any
  );

// (async () => {
//   const client = await require("./create-client")();
//   processSavedUsers(client).then(fin => console.log(fin.length));
// })();
