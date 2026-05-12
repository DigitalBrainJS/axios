import minimist from "minimist";
import {getCommitInfo, getLatestTags, checkout, getCommits} from "./helpers/git.js";
import fs from "fs/promises";
import {listFiles, readJSONFile, writeFileAsync, Handlebars, barChart} from "./helpers/helpers.js";
import path from "path";
import util from "util";
import {gzip} from "zlib";
import {getFilesFromNPM} from "./helpers/npm.js";
import github from "./helpers/github.js";

const gzipAsync = util.promisify(gzip);

const jsFilesExt = {
  '.js': true,
  '.cjs': true,
  '.mjs': true
};

const statDir = process.env.STATS_PATH || './axios-stats/';
const distDir = 'dist/';

const getFileStats = async (filename) => {
  try {
    const content = await fs.readFile(filename);

    const compressedSize = (await gzipAsync(content)).byteLength;

    return {
      size: content.byteLength,
      gzip: compressedSize,
      compressed: content.byteLength ? compressedSize / content.byteLength : 1
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    return null;
  }
}

const snapshot = async (dir = distDir, skipIfExists = true) => {
  const {sha, tag, short, date} = await getCommitInfo();

  if (skipIfExists) {
    try {
      await fs.access(path.join(statDir, `${sha}.json`), fs.constants.F_OK);
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  const files = await listFiles(dir);

  const stat = {
    sha,
    tag,
    date,
    short,
    stats: {}
  };

  await Promise.all(files.filter((file) => jsFilesExt[path.extname(file)]).map(async (filePath) => {
    stat.stats[filePath.replace(/\\\\?/g, '/')] = await getFileStats(filePath);
  }));

  if (statDir) {
    await writeFileAsync(path.join(statDir, `${sha}.json`), stat);
  }

  return stat;
}

const getStatsFromNPM = async (version) => {
  try {
    const npmPackage = await getFilesFromNPM(`axios@${version.replace(/^v/, '')}`, (filepath) => {
      return jsFilesExt[path.extname(filepath)] && filepath.startsWith(distDir)
    });
    const stats = {};

    for (const [filepath, {size, gzip, compressed}] of Object.entries(npmPackage)) {
      stats[filepath] = {
        size,
        gzip,
        compressed
      }
    }

    return stats;
  } catch (err) {
    return null;
  }
}


const report = async (files, {releases = 1, base, clear = true} = {}) => {
  const tags = await getLatestTags(releases);
  const fromTag = tags.length && tags[tags.length - 1];
  const from = fromTag ? fromTag.sha : `HEAD~${releases}`;

  console.log('Latest tags:\n', tags);
  console.log(`Getting commits from ${from} to HEAD...`);


  const commits = await getCommits(from);
  const snapshotsMap = {};
  const commit2Tag = {};

  tags.forEach(tagData => {
    commit2Tag[tagData.sha] = tagData;
  });

  const snapshotFiles = await listFiles(statDir);
  const snapshotFilesMap = {};

  if (snapshotFiles) {
    snapshotFiles.forEach(file => {
      snapshotFilesMap[path.parse(file).name] = true;
    });

    console.log(`Snapshot files [${snapshotFiles.length}]:\n ${snapshotFiles.join('\n')}`);
  } else {
    console.log('No snapshot directory found on disk');
  }

  const snapshots = await Promise.all(commits.map(async (sha, i) => {
    const isSnapshotFileExists = snapshotFilesMap[sha];


    let snapshot = isSnapshotFileExists && (await readJSONFile(path.join(statDir, `${sha}.json`)));

    if (!snapshot) {
      const tagInfo = commit2Tag[sha];

      console.log(`${i}) No snapshot found for ${sha}`);

      if (tagInfo) {
        console.log(` Trying to pull [${tagInfo.tag}] from NPM`);

        const stats = await getStatsFromNPM(tagInfo.tag);

        if (stats) {
          snapshot = {
            sha,
            tag: tagInfo.tag,
            date: tagInfo.date,
            short: tagInfo.short,
            stats
          };

          await writeFileAsync(path.join(statDir, `${sha}.json`), snapshot);
        } else {
          console.error(`Failed to get snapshot for ${tagInfo.tag} (${sha}) from NPM`);
        }
      }
    } else {
      console.log(`${i}) Loaded snapshot for ${sha} [${snapshot.tag || '---'}] from disk`);
    }

    if (snapshot) {
      snapshot.label = !i ? 'HEAD' : (snapshot.sha === base ? 'BASE' : '');
    }

    return snapshot;
  }));

  snapshots.forEach((snapshot) => {
    if(snapshot) {
      snapshotsMap[snapshot.sha] = snapshot;
    }
  });

  if (clear) {
    await clearStats(snapshotsMap);
  }

  const stats = {};

  let impact = 0;

  files.forEach(file => {
    const stat = Object.values(snapshotsMap).map((snapshot) => {
      const stat = snapshot?.stats[file];

      if (stat) {
        return {
          sha: snapshot.sha,
          short: snapshot.short,
          tag: snapshot.tag,
          date: snapshot.date,
          label: snapshot.label,
          ...stat
        }
      }
    }).filter(Boolean).map((snapshot, i, snapshots) => {
      const next = snapshots[i + 1];
      const diff = next ? snapshot.size - next.size : null;
      const diffGZip = next ? snapshot.gzip - next.gzip : null;

      if (diffGZip > 0) {
        impact += diffGZip;
      }

      return {
        ...snapshot,
        diff: {
          size: diff,
          gzip: diffGZip
        }
      }
    });

    const baseStat = base &&
      (base === 'release' ? tags[0].sha : stat.find(({sha}) => sha === base)) ||
      stat[1];

    stats[file] = {
      stat,
      diff: {
        size: baseStat ? stat[0].size - baseStat.size : null,
        gzip: baseStat ? stat[0].gzip - baseStat.gzip : null,
      },
      graph: barChart(stat.map(({tag, short, label, sha, gzip}) => {
        return {
          label: label || tag || short || sha,
          value: gzip
        };
      }))
    };
  });

  return {
    impact,
    stats,
    snapshots: snapshotsMap
  };
}

const clearStats = async (snapshots) => {
  try {
    const files = await listFiles(statDir);

    await Promise.all(files.map(file => {
      const sha = path.parse(file).name;

      if (!snapshots[sha]) {
        console.log(`Removing irrelevant snapshot for ${sha}`);
        return fs.unlink(path.join(statDir, file))
      }
    }));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}




(async (args) => {
  let {skipIfExists = true, releases, base, dir = distDir} = args;
  let [action, ...rest] = args._;
  let pr = args.pr || process.env.PR_NUMBER;
  let marker = args.marker || process.env.DEFAULT_MARKER || 'axios-comment-marker';

  console.log(`Stat dir: ${statDir}`);

  switch (action) {
    case 'snapshot':
    case 'snap': {
      const stat = await snapshot(dir, skipIfExists);

      if (stat) {
        console.log(`Snapshot for ${stat.sha} (${stat.tag || '---'}) saved successfully!`);
      } else {
        console.log('Snapshot already exists, skipping...');
      }

      break;
    }
    case 'report': {
      const [...files] = rest;

      const template = await fs.readFile('./scripts/templates/build-stat.hbs');

      const stats = await report(files, {
        releases,
        base
      });

      const reportText = Handlebars.compile(String(template))(stats);

      if (pr) {
        const fullMarker = `<!-- ${marker} -->`;

        await github.findCommentAndUpdate(
          pr,
          reportText ? `${fullMarker}\r\n${reportText}` : '',
          ({body}) => body.trim().startsWith(fullMarker)
        );
      }

      console.log(reportText);

      if (process.env.GITHUB_STEP_SUMMARY) {
        try {
          await fs.writeFile(
            process.env.GITHUB_STEP_SUMMARY,
            reportText
          );
        } catch (err) {
          console.error('Failed to write GitHub summary', err);
        }
      }

      break;
    }
  }
})(minimist(process.argv.slice(2), {
  strings: ['releases', 'pr', 'base', 'dir', 'target'],
  boolean: ['skipIfExists'],
  alias: {
    releases: 'r',
    skipIfExists: 's',
    base: 'b',
    pr: 'p',
    dir: 'd',
    target: 't'
  }
}));
