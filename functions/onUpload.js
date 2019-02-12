const { Storage } = require("@google-cloud/storage");

var admin = require("firebase-admin");
const requestImageSize = require("request-image-size");
const { getAudioDurationInSeconds } = require("get-audio-duration");
const gcs = new Storage();
const os = require("os");
const path = require("path");
const spawn = require("child-process-promise").spawn;
const mkdirp = require("mkdirp-promise");
const db = admin.database();
var videoScreen = require("video-screen");
var fs = require("fs");
var gs = require("gs");
var ffmpeg = require("fluent-ffmpeg");
var ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
var ffprobePath = require("@ffprobe-installer/ffprobe").path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
exports.handler = function(object) {
  const bucket = object.bucket;
  const contentType = object.contentType;
  const filePath = object.name;
  const destBucket = gcs.bucket(bucket);
  const tmpFilePath = path.join(os.tmpdir(), path.basename(filePath));
  const dir = path.dirname(filePath);
  const metadata = {
    contentType: contentType
  };
  var myBucket = admin.storage().bucket(bucket);
  const imgExt = path
    .basename(filePath)
    .split(".")
    .pop();
  const newName = path.basename(filePath, ".pdf") + ".png";
  const tempNewPath = path.join(os.tmpdir(), newName);
  const isImage = contentType.startsWith("image");
  var tempNewThumbDir = path.join(os.tmpdir(), dir) + ".png";
  const tempLocalDir = path.join(os.tmpdir(), dir);
  const isVideo = contentType.startsWith("video/");
  const isPdf = contentType.startsWith("application/pdf");
  const isaudio = contentType.startsWith("audio/");
  const sizes = [64, 128, 256];
  console.log(object);
  if (path.basename(filePath).startsWith("Thumb")) {
    return Promise.resolve();
  } else if (isImage) {
    const uploadPromises = sizes.map(size => {
      return destBucket
        .file(filePath)
        .download({
          destination: tmpFilePath
        })
        .then(() => {
          return spawn("convert", [
            tmpFilePath,
            "-thumbnail",
            size.toString() + "x" + size.toString(),
            tmpFilePath
          ]);
        })
        .then(() => {
          return destBucket.upload(tmpFilePath, {
            destination: dir + "/Thumb@" + size + "." + imgExt,
            metadata: metadata
          });
        })
        .then(res => {
          return myBucket.file(res[0].metadata.name).getSignedUrl({
            action: "read",
            expires: "03-09-2491"
          });
        })
        .then(err => {
          return db
            .ref("entries/" + dir)
            .child("/Thumb@" + size)
            .set(err[0]);
        })
        .then(() => {
          return Promise.resolve();
        })
        .catch(err => {
          return Promise.reject(err);
        });
    });
    var url;
    return myBucket
      .file(filePath)
      .getSignedUrl({
        action: "read",
        expires: "03-09-2491"
      })
      .then(res => {
        url = res[0];
        return requestImageSize(url);
      })
      .then(size => {
        var meta = {
          size: {
            height: size.height,
            width: size.width
          }
        };
        return db.ref("entries/" + dir).set({
          meta: meta,
          url: url
        });
      })
      .then(() => {
        return Promise.all(uploadPromises);
      })
      .catch(err => {
        return Promise.reject(err);
      });
  } else if (isPdf) {
    return destBucket
      .file(filePath)
      .download({
        destination: tmpFilePath
      })
      .then(() => {
        return new Promise((resolve, reject) => {
          gs()
            .batch()
            .nopause()
            .option("-dFirstPage=1")
            .option("-dLastPage=1")
            .executablePath("lambda-ghostscript/bin/./gs")
            .device("png16m")
            .output(tempNewPath)
            .input(tmpFilePath)
            .exec((err, stdout, stderr) => {
              if (!err) {
                resolve();
              } else {
                console.log("gs error:", err);
                reject(err);
              }
            });
        });
      })
      .then(() => {
        return spawn("convert", [
          tempNewPath,
          "-thumbnail",
          "400x400",
          tempNewPath
        ]);
      })
      .then(() => {
        return destBucket.upload(tempNewPath, {
          destination: dir + "/Thumb.png"
        });
      })
      .then(res => {
        return myBucket.file(res[0].metadata.name).getSignedUrl({
          action: "read",
          expires: "03-09-2491"
        });
      })
      .then(err => {
        return db
          .ref("entries/" + dir)
          .child("/Thumb")
          .set(err[0]);
      })
      .then(() => {
        return db
          .ref("entries/" + dir)
          .child("/meta")
          .set({
            size: object.size / 1024
          });
      })
      .then(() => {
        return Promise.resolve();
      })
      .catch(err => {
        return console.log(err);
      });
  } else if (isVideo) {
    var snapDimentions;
    var snapshotTime;
    return mkdirp(tempLocalDir)
      .then(() => {
        return destBucket.file(filePath).download({
          destination: tmpFilePath
        });
      })
      .then(() => {
        var Meta;
        return new Promise((resolve, reject) => {
          ffmpeg.ffprobe(tmpFilePath, (err, metadata) => {
            if (err) {
              reject(err);
            } else {
              var minutes = metadata.format.duration / 60;
              var seconds = Math.floor((minutes % 1) * 60);
              minutes = Math.floor(minutes);
              if (minutes < 10) {
                minutes = "0" + minutes;
              }
              Meta = {
                duration: minutes + ":" + seconds
              };
              if (metadata.format.duration * 0.1 > 30) {
                snapshotTime = "30";
              } else if (metadata.format.duration <= 1) {
                snapshotTime = "0";
              } else {
                var timeat10 = Math.floor(metadata.format.duration * 0.1);
                if (timeat10 < 10) {
                  snapshotTime = "0" + timeat10;
                } else {
                  snapshotTime = timeat10;
                }
              }
              snapDimentions = {
                height: 300,
                width:
                  (metadata.streams[0].width * 300) / metadata.streams[0].height
              };
              console.log(metadata);
              resolve(Meta);
            }
          });
        });
      })
      .then(Meta => {
        return db
          .ref("entries/" + dir)
          .child("/meta")
          .set(Meta);
      })
      .then(() => {
        return new Promise((resolve, reject) => {
          var options = {
            time: "00:00:" + snapshotTime,
            height: snapDimentions.height,
            width: snapDimentions.width
          };
          videoScreen(tmpFilePath, options, (err, screenshot) => {
            if (err) reject(err);

            fs.writeFile(tempNewThumbDir, screenshot, () => {
              resolve();
            });
          });
        });
      })

      .then(() => {
        return destBucket.upload(tempNewThumbDir, {
          destination: dir + "/Thumb.png"
        });
      })
      .then(res => {
        return myBucket.file(res[0].metadata.name).getSignedUrl({
          action: "read",
          expires: "03-09-2491"
        });
      })
      .then(err => {
        return db
          .ref("entries/" + dir)
          .child("/Thumb")
          .set(err[0]);
      })

      .then(() => {
        return Promise.resolve();
      })
      .catch(err => {
        return Promise.reject(err);
      });
  } else if (isaudio) {
    return destBucket
      .file(filePath)
      .download({
        destination: tmpFilePath
      })
      .then(() => {
        return getAudioDurationInSeconds(tmpFilePath);
      })
      .then(duration => {
        var minutes = duration / 60;
        var seconds = Math.floor((minutes % 1) * 60);
        minutes = Math.floor(minutes);
        var meta = {
          duration: minutes + ":" + seconds
        };
        return db
          .ref("entries/" + dir)
          .child("/meta")
          .set(meta);
      })
      .then(() => {
        return Promise.resolve();
      })
      .catch(err => {
        return Promise.reject(err);
      });
  }
};
