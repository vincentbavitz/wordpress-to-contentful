import dotenv from "dotenv";
import Listr from "listr";
import createBlogPosts from "./contentful/create-blog-posts";
import createClient from "./contentful/create-client";
import matchAuthorTypes from "./contentful/match-author-types";
import uploadAssets from "./contentful/upload-assets";
import cleanDist from "./setup/clean-dist";
import testConfig from "./setup/test-config";
import createAssetList from "./wordpress/create-asset-list";
import downloadPosts from "./wordpress/post-download";
import transformPosts from "./wordpress/post-transform";
import downloadUsers from "./wordpress/user-download";

dotenv.config();

const tasks = new Listr([
  {
    title: "Setup & Pre-flight checks",
    task: () => {
      return new Listr([
        {
          title: "Check env config",
          task: () => testConfig(),
        },
        {
          title: "Clean destination folder",
          task: () => cleanDist(),
        },
      ]);
    },
  },
  {
    title: "WordPress export: Users",
    task: () => {
      return new Listr([
        {
          title: "Download raw JSON",
          task: () => downloadUsers() as any,
        },
      ]);
    },
  },
  {
    title: "WordPress export: Posts",
    task: () => {
      return new Listr([
        {
          title: "Download raw JSON",
          task: () => downloadPosts() as any,
        },
        {
          title: "Transform into Contentful format",
          task: () => transformPosts(),
        },
        {
          title: "Create list of assets",
          task: () => createAssetList(),
        },
      ]);
    },
  },
  {
    title: "Contentful import",
    task: () => {
      return new Listr([
        // {
        //   title: "Create Content Management API Client",
        //   task: () => createClient()
        // },
        {
          title: "Upload assets",
          task: () => createClient().then(uploadAssets),
        },
        {
          title: "Match WP 'User' to Contentful 'Person'",
          task: () => createClient().then(matchAuthorTypes),
        },
        {
          title: "Create Posts",
          task: () => createClient().then(createBlogPosts),
        },
      ]);
    },
  },
]);

tasks.run().catch((err) => console.error(err));
