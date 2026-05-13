import {run} from "./helpers.js";


export const getCommitInfo = async (ref = "HEAD") => {
  const [sha, date, short] = await run(
    `git show -s --format=%H%n%cI%n%h ${ref}`,
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

export const getLatestTags = async (limit = 1, pattern = 'v*') => {
  const lines = await run(
    `git for-each-ref \
      --count=${limit} \
      --sort=-v:refname \
      --merged=HEAD \
      --format="%(refname:short)|%(*objectname)|%(objectname)|%(*committerdate:iso8601)|%(committerdate:iso8601)|%(*objectname:short)|%(objectname:short)" \
      refs/tags/${pattern}`,
    true
  );

  return lines.map(line => {
    const [
      tag,
      annotatedSha,
      lightweightSha,
      annotatedDate,
      lightweightDate,
      annotatedShort,
      lightweightShort
    ] = line.split('|');

    return {
      tag,
      sha: annotatedSha || lightweightSha,
      date: new Date(annotatedDate || lightweightDate),
      short: annotatedShort || lightweightShort
    };
  });
};

export const getCommits = async (from, to = 'HEAD') => {
  return run(`git rev-list ${from}..${to}`, true);
}
