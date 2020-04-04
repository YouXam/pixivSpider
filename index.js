const { Worker, isMainThread, parentPort } = require('worker_threads');
const express = require('express');
const spider = require('./lib/spider');
const time = require('./lib/time');
const mongodb = require("mongodb");
console.log = time.timeLog(console.log);
console.error = time.timeLog(console.error);
let logs = []
function startServer(db) {
    console.log('服务器正在启动')
    const app = express();
    app.set("view engine", "ejs");
    app.use('/imgs', express.static("imgs"));
    app.use('/picked', express.static("picked"));
    app.get('/', (req, res) => {
        db.collection('date').find().toArray().then((data) => {
            res.render('index', { data: data });
        }).catch(error => {
            res.status(500).send(error);
        });
    });
    app.get('/original/:date/:aid', (req, res) => {
        if (!req.params.date || !req.params.aid) {
            res.status(401).send("Invalid arguments");
        }
        db.collection('d' + req.params.date).findOne({ aid: parseInt(req.params.aid) }).then((data) => {
            if (!data) {
                res.status(404).send("404 Not Found");
            }
            db.collection('d' + req.params.date).updateOne({ aid: parseInt(req.params.aid) }, {
                $set: {
                    downCount: data.downCount + 1
                }
            }).then(() => {
                res.sendFile(`${__dirname}/${data.path}/${data.filename}`);
            }).catch(error => {
                console.log(error)
                res.status(500).send(error);
            });
        }).catch(error => {
            res.status(500).send(error);
        });
    });
    app.get('/logs', (req, res) => {
        res.render('logs', { logs: logs });
    });
    app.get('/picked/:page?', (req, res) => {
        db.collection('picked').find().count().then((count) => {
            let page;
            if (!req.params.page || req.params.page < 0 || req.params.page > Math.ceil(count / 10)) {
                page = 1;
            } else {
                page = req.params.page;
            }
            db.collection('picked').find().sort({ "downCount": -1 }).skip((page - 1) * 10).limit(10).toArray().then((data) => {
                res.render('picked', { data: data,totol: count, page: page });
            }).catch(error => {
                res.status(500).send(error);
            });
        });
    });
    app.get('/list/:date/:page?', (req, res) => {
        if (!req.params.date) {
            res.status(404).send("404 Not Found");
            return;
        }
        db.collection('date').findOne({ date: req.params.date }).then((data) => {
            if (!data) {
                res.status(404).send("404 Not Found");
                return;
            }
            let page;
            if (!req.params.page || req.params.page < 0 || req.params.page > Math.ceil(data.count / 10)) {
                page = 1;
            } else {
                page = req.params.page;
            }
            db.collection('d' + req.params.date).find().sort({ "downCount": -1 }).skip((page - 1) * 10).limit(10).toArray().then((sdata) => {
                res.render('list', { data: sdata, date: req.params.date, totol: data.count, page: page });
            }).catch(error => {
                res.status(500).send(error);
            });
        }).catch(error => {
            res.status(500).send(error);
        });
    });
    app.all("*", (req, res) => {
        res.status(400).send();
    })
    app.listen(80, () => {
        console.log('服务器已经启动')
    });
}

if (isMainThread) {
    mongodb.MongoClient.connect('mongodb://localhost', { useUnifiedTopology: true }).then(client => {
        db = client.db('pixiv');
        startServer(db);
    }).catch(error => {
        console.error(error);
    })
    const worker = new Worker(__filename);
    worker.on('message', (msg) => {
        logs.push('[' + time.getTime() + '] ' + msg.data)
        if (logs.length > 500) {
            logs = logs.splice(100, 1000);
        }
        console[msg.type](msg.data);
    });
} else {
    spider(parentPort);
}
