import fs from "fs-extra";
import { BUILD_DIR } from "../util";

const clean = async () => fs.emptyDir(BUILD_DIR);
export default clean;
