const {
    Storage
} = require('@google-cloud/storage');

var admin = require("firebase-admin");

const gcs = new Storage();
const os = require('os');
const path = require('path');
const spawn = require('child-process-promise').spawn;
const mkdirp = require('mkdirp-promise');
const db = admin.database()
var videoScreen = require('video-screen');
var fs = require('fs');
var gs = require('gs');

exports.handler = function (object) {
    const bucket = object.bucket;
    const contentType = object.contentType;
    const filePath = object.name;
    const destBucket = gcs.bucket(bucket);
    const tmpFilePath = path.join(os.tmpdir(), path.basename(filePath));
    const dir = path.dirname(filePath)
    const metadata = {
        contentType: contentType
    };
    var myBucket = admin.storage().bucket(bucket)
    const imgExt = path.basename(filePath).split('.').pop()
    const newName = path.basename(filePath, '.pdf') + '.png';
    const tempNewPath = path.join(os.tmpdir(), newName);
    const isImage = contentType.startsWith("image")
    var tempNewThumbDir = path.join(os.tmpdir(), dir) + ".png";
    const tempLocalDir = path.join(os.tmpdir(), dir)
    const isVideo = contentType.startsWith('video/')
    const isPdf = contentType.startsWith('application/pdf')

    const sizes = [64, 128, 256];

    if (path.basename(filePath).startsWith('Thumb')) {
        return Promise.resolve();
    } else if (isImage) {
        const uploadPromises = sizes.map(
            size => {
                return destBucket.file(filePath).download({
                        destination: tmpFilePath
                    }).then(() => {
                        return spawn('convert', [tmpFilePath, '-thumbnail', size.toString() + "x" + size.toString(), tmpFilePath])
                    })
                    .then(() => {
                        return destBucket.upload(tmpFilePath, {
                            destination: dir + '/Thumb@' + size + '.' + imgExt,
                            metadata: metadata
                        })
                    }).then(res => {
                        return myBucket.file(res[0].metadata.name).getSignedUrl({
                            action: 'read',
                            expires: '03-09-2491'
                        })
                    }).then(err => {
                        return db.ref("entries/" + dir).child('/Thumb@' + size).set(err[0])
                    })
                    .then(() => {
                        return Promise.resolve()
                    })
                    .catch(err => {
                        return Promise.reject(err)
                    })
            }
        )
        return myBucket.file(filePath).getSignedUrl({
                action: 'read',
                expires: '03-09-2491'
            }).then((err) => {
                return db.ref("entries/" + dir).child('/url').set(err[0])
            })
            .then(() => {
                return Promise.all(uploadPromises)
            }).catch(err => {
                return Promise.reject(err)
            })
    } else if (isPdf) {
        return destBucket.file(filePath).download({
                destination: tmpFilePath
            }).then(() => {
                return new Promise((resolve, reject) => {
                    gs()
                        .batch()
                        .nopause()
                        .option('-r' + 50 * 2)
                        .option('-dDownScaleFactor=2')
                        .option('-dFirstPage=1')
                        .option('-dLastPage=1')
                        .executablePath('lambda-ghostscript/bin/./gs')
                        .device('png16m')
                        .output(tempNewPath)
                        .input(tmpFilePath)
                        .exec((err, stdout, stderr) => {
                            if (!err) {
                                resolve();
                            } else {
                                console.log('gs error:', err);
                                reject(err);
                            }
                        })
                })
            })
            .then(() => {
                return spawn('convert', [tempNewPath, '-thumbnail', "200x200", tempNewPath])
            })
            .then(() => {
                return destBucket.upload(tempNewPath, {
                    destination: dir + '/Thumb.png'
                })
            })
            .then(res => {
                return myBucket.file(res[0].metadata.name).getSignedUrl({
                    action: 'read',
                    expires: '03-09-2491'
                })
            }).then(err => {
                return db.ref("entries/" + dir).child('/Thumb').set(err[0])
            })
            .then(() => {
                return Promise.resolve()
            })
            .catch(err => {
                return console.log(err)
            })
    } else if (isVideo) {

        return mkdirp(tempLocalDir)


            .then(() => {
                return destBucket.file(filePath).download({
                    destination: tmpFilePath
                })
            })

            .then(() => {
                return new Promise((resolve, reject) => {
                 videoScreen(tmpFilePath, (err, screenshot) => {
                    if (err) reject(err)
                
                        fs.writeFile(tempNewThumbDir, screenshot, () => {
                            resolve()
                        })
                    
                });
            })
            })
            .then(() => {
                return destBucket.upload(tempNewThumbDir, {
                    destination: dir + '/Thumb.png'
                })
            }).then(res => {

                return myBucket.file(res[0].metadata.name).getSignedUrl({
                    action: 'read',
                    expires: '03-09-2491'
                })
            }).then(err => {
                return db.ref("entries/" + dir).child('/Thumb').set(err[0])
            })
            .then(() => {
                return Promise.resolve()
            })
            .catch(err => {
                return Promise.reject(err)
            })




    }
}