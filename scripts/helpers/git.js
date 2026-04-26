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

export const getHeadCommit = async () => {
  const head = (await execAsync(
    `git rev-parse HEAD`
  )).stdout;

  return head.trim();
}

export const getLatestTags = async (limit = 1, pattern= 'v*') => {
  const { stdout } = await execAsync(
    `git for-each-ref --count ${limit} refs/tags/${pattern} --merged=HEAD --sort=-v:refname --format="%(refname:short)|%(objectname)"`
  );

  return stdout
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [tag, objectSha, peeledSha] = line.split('|');

      return {
        tag,
        sha: peeledSha || objectSha,
      };
    });
};

export const getTagBySha = async (sha, regexp) => {
  try {
    const { stdout } = await execAsync(
      `git tag --points-at ${sha}`
    );

    const tags = stdout
      .split(/\r?\n/)
      .map(t => t.trim())
      .filter(Boolean);

    return tags.length && (regexp ? tags.filter(tag => regexp.test(tag)) : tags)[0] || null;
  } catch {
    return null;
  }
};

export const getCurrentBranch = async () => {
  try {
    const { stdout } = await execAsync(
      'git branch --show-current'
    );

    return stdout.trim() || null;
  } catch {
    return null;
  }
};
