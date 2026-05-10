import {run} from "./helpers.js";


export const getCommitInfo = async (ref = "HEAD") => {
    const [sha, date, short] = await run(
      `git show -s --format=%H%n%cI%h ${ref}`,
      true
    );

    let tags = [];

    try {
      tags = await run(`git tag --points-at ${sha}`, true);
    } catch {}

    return {
      sha,
      date,
      short,
      tags
    };
  }

export const getLatestTags = async (limit = 1, pattern= 'v*') => {
  const tags = await run(
    `git for-each-ref --count ${limit} refs/tags/${pattern} --merged=HEAD --sort=-v:refname --format="%(refname:short)|%(*objectname)|%(*committerdate:iso8601)|%(objectname:short)"`,
    true
  );

  return tags.map(line => {
      const [tag, sha, date, short] = line.split('|');

      return {
        tag,
        sha,
        date: new Date(date),
        short
      };
    });
};

export const checkout = async (ref) => {
  await run(`git checkout ${ref}`);
}

export const getCommits = async (from, to = 'HEAD') => {
  return run(`git rev-list ${from}..${to}`, true);
}
