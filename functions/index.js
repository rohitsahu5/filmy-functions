const functions = require('firebase-functions');
var serviceAccount = require("./filmy-demo-firebase-adminsdk-4vyou-cc1bd1c3ce.json");
var admin = require("firebase-admin");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://filmy-demo.firebaseio.com"
})
const  handleDelete = require("./onDelete")
const  handleUpload = require("./onUpload")

exports.handleDelete = functions.database.ref("entries/{id}").onDelete(handleDelete.handler)
exports.handleUpload = functions.storage.object().onFinalize(handleUpload.handler);