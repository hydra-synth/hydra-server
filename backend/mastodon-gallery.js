const multer = require('multer')
var path = require('path')
var fs = require('fs')
const request = require('request')
const { createRestAPIClient } = require('masto')
// const Mastodon = require('mastodon-api')

let masto = null
if (process.env.MASTODON_ACCESS_TOKEN) {
  masto = createRestAPIClient({
    url: process.env.MASTODON_API_URL,
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });
}

module.exports = (app) => {
  // server-side code related to saving and storing images
  const Datastore = require('nedb')
  var db = new Datastore({ filename: path.join(__dirname, '/db/saved_sketches'), autoload: true })
  var sketches = []

  db.count({}, function (err, count) {
    // console.log("There are " + count + " entries in the database");
    if (err) console.log("There's a problem with the database: ", err);
    else if (count <= 0) { // empty database so needs populating
      // default users inserted in the database
      db.insert(sketches, function (err, testAdded) {
        if (err) console.log("There's a problem with the database: ", err);
        else if (testAdded) console.log("Default users inserted in the database");
      });
    }
  });

  app.get('/sketches', function (request, response) {
    db.find({}, function (err, entries) {
      if (err) {
        console.log('problem with db', err)
      } else {
        var res = entries.map((entry) => {
          entry.sketch_id = entry._id
          return entry
        })
        response.send(entries)
      }
    })
  })

  app.get('/sketchById', function (request, response) {
    db.find({ _id: request.query.sketch_id }, function (err, entries) {
      if (err) {
        console.log('problem with db', err)
      } else {
        var res = entries.map((entry) => {
          entry.sketch_id = entry._id
          return entry
        })
        response.send(entries)
      }
    })
  })

  app.post('/sketch', function (request, response) {
    //  console.log('post sketch', request.query)
    db.insert({
      "code": request.query.code,
      "parent": request.query.parent,
      "date": new Date()
    }, function (err, sketchAdded) {
      if (err) {
        console.log('error adding', err)
        response.sendStatus(500)
      } else {
        //  console.log('ADDED', sketchAdded)
        response.send(sketchAdded._id)
      }
    })
  })

  // app.post('/image', function (request, response) {
  //   console.log('post sketch', request.query)
  // })


  //const storage = multer.memoryStorage();


  //  console.log('envv', process.env)
  // app.post('/image', (req, res) => {

  //   // let data = ÷\ß\req.body;
  //   //res.send('gallery is currently disabled, stay tuned for updates');

  //   res.send('twitter gallery is down, but sketch code has been saved to hydra database')
  // })

  // using disk storage
  // var storage = multer.diskStorage({
  //   destination: function (req, file, cb) {
  //    cb(null, path.join(__dirname + '/uploads/'))
  //    },
  //    filename: function (req, file, cb) {
  //      cb(null, file.originalname + '.png')
  //    }
  // })
  // const upload = multer({ storage: storage });
  // app.post("/image", upload.single('previewImage'), (req, res) => {
  //   console.log('loaded file', req.query.url, req.query.name, req.file)
  //       const attachment1 = masto.v2.media.create({
  //     file: new Blob([fs.readFileSync(req.file.path)]),
  //     description: req.query.name,
  //   }).then((attachment) => {
  //     console.log('created attachment', attachment)
  //   }).catch((err) => {
  //     console.warn('error', err)
  //   });
  // })


  const upload = multer()
  app.post('/image', upload.single('previewImage'), (req, res) => {
    if (masto !== null) {
      findParentToot(req.query.sketch_id, function (err, masto_id) {
        if (err) console.log(err)
        let description = `${req.query.url} created by ${req.query.name}`
       
        if (masto_id !== null) {
         // console.log("FOUND PARENT", masto_id)
          description += `

(based on https://botsin.space/@hydra/${masto_id})`
        }
        const attachment1 = masto.v2.media.create({
          file: new Blob([req.file.buffer]),
          description: req.query.name,
        }).then((attachment) => {
          // console.log('created attachment')
          const status = masto.v1.statuses.create({
            status: description,
            visibility: "unlisted",
            mediaIds: [attachment.id],
            "in_reply_to_id": masto_id
          }).then((status) => {
            // console.log('posted with status', status, status.id, status.url)
            res.status(200).send(status.url);
            db.update(
              { _id: req.query.sketch_id },
              { $set: { masto_id: status.id } },
              {},
              function (err, numReplaced) { }
            );
          }).catch((err) => {
              console.warn(err)
              res.status(500).send('error creating image attachment')
            });
        }).catch((err) => {
          res.status(500).send('error creating image attachment')
        });
      })
    } else {
      res.status(200).send('mastodon gallery is down, but sketch code has been saved to hydra database')
    }
  })


    function findParentToot(sketch_id, callback) {
      //console.log('finding entry', sketch_id)
      db.find({ _id: sketch_id }, function (err, entries) {
        if (err) {
          callback(err, null)
        } else {
          if (entries.length > 0) {
          //  console.log('found entry', entries[0])
            if (entries[0].parent) {
              db.find({ _id: entries[0].parent }, function (err, entries) {
                if (err) {
                  callback(err)
                } else {
                  if (entries.length > 0) {
                //    console.log('found parent', entries[0])
                    if (entries[0].masto_id) {
                      callback(null, entries[0].masto_id)
                    } else {
                      callback(null, null)
                    }
                  } else {
                    callback(null, null)
                  }
                }
              })
            } else {
              callback(null, null)
            }
          } else {
            callback(null, null)
          }
        }
      })
    }
  
  //   function findParentTweet(sketch_id, callback) {
  //     db.find({ _id: sketch_id }, function (err, entries) {
  //       if (err) {
  //         callback(err, null)
  //       } else {
  //         if (entries.length > 0) {
  //           if (entries[0].parent) {
  //             db.find({ _id: entries[0].parent }, function (err, entries) {
  //               if (err) {
  //                 callback(err)
  //               } else {
  //                 if (entries.length > 0) {
  //                   if (entries[0].tweet_id) {
  //                     callback(null, entries[0].tweet_id)
  //                   } else {
  //                     callback(null, null)
  //                   }
  //                 } else {
  //                   callback(null, null)
  //                 }
  //               }
  //             })
  //           } else {
  //             callback(null, null)
  //           }
  //         } else {
  //           callback(null, null)
  //         }
  //       }
  //     })
  //   }
  // }

  // function saveFile(body, fileName) {
  //   const file = fs.createWriteStream(fileName)
  //   request(body).pipe(file).on('close', err => {
  //     if (err) {
  //       console.log(err)
  //     } else {
  //       //  console.log('Media saved!')
  //       const descriptionText = body.title
  //       // uploadMedia(descriptionText, fileName)
  //     }
  //   })
  // }
}
