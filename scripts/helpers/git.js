import util from "util";
import cp from "child_process";

export const execAsync = util.promisify(cp.exec);

export const parseVersionTag = (tag) => {
  const [, major, minor, patch] = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag) || [];
  return [major, minor, patch];
}

export const getBlobSize = async (filepath, sha ='HEAD') => {
  const size = (await execAsync(
    `git cat-file -s ${sha}:${filepath}`
  )).stdout;

  return size ? +size : 0;
}

export const getBlobHistory = async (filepath, maxCount= 5) => {
  const log = (await execAsync(
    `git log --max-count=${maxCount} --no-walk --tags=v* --oneline --format=%H%d -- ${filepath}`
  )).stdout;

  const commits = [];

  let match;

  const regexp = /^(\w+) \(tag: (v?[.\d]+)\)$/gm;

  while((match = regexp.exec(log))) {
    commits.push({
      sha: match[1],
      tag: match[2],
      size: await getBlobSize(filepath, match[1])
    })
  }

  return commits;
}



export const getTags = async (pattern = 'v*', sort = '-v:refname') => {
  const log = (await execAsync(
    `git tag -l ${pattern} --sort=${sort}`
  )).stdout;

  return log.split(/\r?\n/);
}
