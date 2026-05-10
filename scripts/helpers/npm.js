import pacote from "pacote";
import tar from "tar-stream";
import zlib from "zlib";
import {Readable} from "stream";

export async function getFilesFromNPM(pkg, filter) {
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
        const filepath = header.name.replace(/^package\//, '')

        if (!filter || filter(filepath)) {
          const content = Buffer.concat(buffers);

          const gzipped = zlib.gzipSync(content);

          files[filepath] = {
            gzip: gzipped.length,
            compressed: header.size ? gzipped.length / header.size : 1,
            ...header
          };
        }

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
