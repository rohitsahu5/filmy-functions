var admin = require("firebase-admin");

   exports.handler = function (change,context){
    var id=context.params.id
    var myBucket=admin.storage().bucket('filmy-demo.appspot.com')
    return myBucket.deleteFiles({
        prefix:id+"/"
    },(err) => {
        if(err){
            return Promise.reject(err)
        }
        else
            return Promise.resolve()
    })
    
}
