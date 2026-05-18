import minimist from "minimist";
import {getCommitInfo, getLatestTags, getCommits} from "./helpers/git.js";
import fs from "fs/promises";
import {listFiles, readJSONFile, writeFileAsync, Handlebars, barChart} from "./helpers/helpers.js";
import path from "path";
import util from "util";
import {gzip} from "zlib";
import {getFilesFromNPM} from "./helpers/npm.js";

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
  const {sha, tags, short, date} = await getCommitInfo();

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
    tag: tags[0] || null,
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

const generateReport = async (files, {
  releases = 1,
  base,
  clear = true,
  maxNPMPulls = 5,
  limit = 100
} = {}) => {
  const releaseTags = await getLatestTags(releases);
  const fromTag = releaseTags.length && releaseTags[releaseTags.length - 1];
  const from = fromTag ? fromTag.sha : `HEAD~${releases}`;

  console.log('Latest tags:\n', releaseTags);
  console.log(`Getting commits from ${from} to HEAD...`);

  const commits = await getCommits(from);
  const snapshotFilesMap = {};
  const commit2Tag = {};

  releaseTags.forEach(tagData => {
    commit2Tag[tagData.sha] = tagData;
  });

  const snapshotFiles = await listFiles(statDir);

  if (snapshotFiles) {
    snapshotFiles.forEach(file => {
      snapshotFilesMap[path.parse(file).name] = true;
    });

    console.log(`Snapshot files [${snapshotFiles.length}]:\n${snapshotFiles.join('\n')}`);
  } else {
    console.log('No snapshot directory found on disk');
  }

  let pullCounter = 0;

  maxNPMPulls = Math.min(releases, limit, maxNPMPulls);

  let baseCommitFound;

  const snapshots = {};

  await Promise.all(commits.map(async (sha, i) => {
    const releaseTagInfo = commit2Tag[sha];

    if (!base && releaseTagInfo) {
      base = releaseTagInfo.sha;
    }

    const isBase = base && sha === base;

    if (baseCommitFound && !releaseTagInfo) {
      console.log(`Skipping stats for non-release intermediate commit ${sha}`);
      return null;
    }

    if (isBase) {
      baseCommitFound = true;
    }

    const isSnapshotFileExists = snapshotFilesMap[sha];

    let snapshot = isSnapshotFileExists && (await readJSONFile(path.join(statDir, `${sha}.json`)));

    if (!snapshot) {
      console.log(`${i}) No snapshot found for ${sha}`);

      if (releaseTagInfo && pullCounter < maxNPMPulls) {
        pullCounter++;

        console.log(` Trying to pull [${releaseTagInfo.tag}] from NPM`);

        const stats = await getStatsFromNPM(releaseTagInfo.tag);

        if (stats) {
          snapshot = {
            sha,
            tag: releaseTagInfo.tag,
            date: releaseTagInfo.date,
            short: releaseTagInfo.short,
            stats
          };

          await writeFileAsync(path.join(statDir, `${sha}.json`), snapshot);
        } else {
          console.error(`Failed to get snapshot for ${releaseTagInfo.tag} (${sha}) from NPM`);
        }
      }
    } else {
      console.log(`${i}) Loaded snapshot for ${sha} [${snapshot.tag || '---'}] from disk`);
    }

    if (snapshot) {
      snapshots[sha] = {
        ...snapshot,
        label: !i ? 'HEAD' : (isBase ? 'BASE' : ''),
        parentCommit: commits[i + 1] || null
      }
    }
  }));

  if (clear) {
    await clearStats(snapshots);
  }

  const stats = {};

  files
    .forEach(file => {
      const stat = commits.map((sha) => {
        const snapshot = snapshots[sha];

        if (!snapshot) {
          return null;
        }

        const stat = snapshot?.stats[file];

        if (stat) {
          return {
            sha: snapshot.sha,
            short: snapshot.short,
            tag: snapshot.tag,
            date: snapshot.date,
            label: snapshot.label,
            parentCommit: snapshot.parentCommit,
            ...stat
          }
        }
      })
        .filter(Boolean).map((snapshot, i, snapshots) => {
          const next = snapshots[i + 1];

          if (snapshot.parentCommit && snapshot.parentCommit === next?.sha) {
            return {
              ...snapshot,
              diff: {
                size: snapshot.size - next.size,
                gzip: snapshot.gzip - next.gzip
              }
            }
          }

          return snapshot;
        }).slice(0, limit);

      if (base === 'release') {
        base = releaseTags[0]?.sha;
      }

      const baseStat = base && stat.find(({sha}) => sha === base) || stat[1];

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
    stats,
    snapshots
  };
}

const renderReport = async (report, options = {
  impact: [0, 1, 100, 500, 1024, Infinity]
}) => {
  const templateContent = await fs.readFile(
    path.join(import.meta.dirname, './templates/build-stat.hbs')
  );

  Object.values(report.stats).forEach((stat) => {
    const impact = options.impact || [];
    let gzipImpact = 0;

    for (let i = 0; i < impact.length; i++) {
      if (i + 1 === impact.length || stat.diff?.gzip < impact[i]) {
        gzipImpact = i + 1;
        break;
      }
    }

    stat.impact = {
      gzip: gzipImpact
    }
  });

  return Handlebars.compile(String(templateContent))(report);
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
  let {skipIfExists = true, releases, base, dir = distDir, template, file} = args;
  let [action, ...rest] = args._;

  console.log(`BASE: ${base}`);
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

      const report = await generateReport(files, {
        releases,
        base
      });

      const reportText = await renderReport(report);

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

      if (file) {
        await writeFileAsync(
          file,
          reportText
        )
      }

      break;
    }
  }
})(minimist(process.argv.slice(2), {
  strings: ['releases', 'base', 'dir', 'template', 'file'],
  boolean: ['skipIfExists'],
  alias: {
    releases: 'r',
    skipIfExists: 's',
    base: 'b',
    dir: 'd',
    template: 't',
    file: 'f'
  }
}));
