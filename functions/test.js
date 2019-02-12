var ffmpeg = require("fluent-ffmpeg");
var ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
var ffprobePath = require("@ffprobe-installer/ffprobe").path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
const os = require("os");
const path = require("path");
const spawn = require("child-process-promise").spawn;
const mkdirp = require("mkdirp-promise")

ffmpeg("./a.mp4")
    .takeScreenshots({
        count: 1,
        timemarks: ['00:02'],
        filename: "a.png"
    })
    .on('end', () => {
        console.log('Screenshots taken');
    })