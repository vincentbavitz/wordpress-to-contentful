import { createClient } from "contentful-management";
import {
  CONTENTFUL_CMA_TOKEN,
  CONTENTFUL_ENV_NAME,
  CONTENTFUL_SPACE_ID,
} from "../util";

const get = async (
  {
    accessToken,
    spaceId,
    envName,
  }: {
    accessToken: string;
    spaceId: string;
    envName: string;
  } = {
    accessToken: "",
    spaceId: "",
    envName: "",
  }
) => {
  const client = createClient({
    accessToken,
    logHandler: (level, data) => console.log(`${level} | ${data}`),
  });

  const space = await client.getSpace(spaceId);
  const env = await space.getEnvironment(envName);
  return env;
};

export default () =>
  get({
    accessToken: CONTENTFUL_CMA_TOKEN,
    spaceId: CONTENTFUL_SPACE_ID,
    envName: CONTENTFUL_ENV_NAME,
  });
