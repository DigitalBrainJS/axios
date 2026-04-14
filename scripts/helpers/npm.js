import pacote from "pacote";
import tar from "tar-stream";
import zlib from "zlib";
import {Readable} from "stream";

export async function getFilesFromNPM(pkg) {
  const tgzData = await pacote.tarball(pkg);
  const files = {};

  return new Promise((resolve, reject) => {
    const extract = tar.extract();

    extract.on("entry", (header, stream, next) => {
      const buffers = [];

      stream.on('data', (buffer) => {
        buffers.push(buffer);
      });

      stream.on("end", () => {
        const content = Buffer.concat(buffers);

        const gzipped = zlib.gzipSync(content);

        files[header.name.replace(/^package\//, '')] = {
          gzip: gzipped.length,
          compressed: header.size ? gzipped.length / header.size : 1,
          ...header
        };

        next();
      });
    });

    Readable.from(tgzData)
      .pipe(zlib.createGunzip())
      .pipe(extract)
      .on("error", reject)
      .on('finish', () => resolve(files));
  });
}
