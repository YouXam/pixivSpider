const superagent = require('superagent');
const time = require('./time');
const mongodb = require("mongodb");
const eventproxy = require('eventproxy');
const fs = require('fs');
const webp = require('webp-converter');
let parentPort, mdb, PRDate;

function getArtworks() {
    return new Promise(async (resolve, reject) => {
        const ep = new eventproxy();
        let url = `https://www.pixiv.net/ranking.php?mode=daily&content=illust&date=${PRDate}&p=1&format=json`;
        // parentPort.postMessage({ type: 'log', data: '爬取 ' + url })
        let first;
        try {
            first = await superagent.get(url);
        } catch (error) {
            reject(`找不到${PRDate}排行榜`);
            return;
        }
        let data, artworks = [], targetURLs = [];
        first = JSON.parse(first.text);
        artworks = artworks.concat(first.contents);
        for (let i = 2; i <= (first.rank_total % 50 ? parseInt(first.rank_total / 50) + 1 : parseInt(first.rank_total / 50)); i++) {
            targetURLs.push(`https://www.pixiv.net/ranking.php?mode=daily&content=illust&date=${PRDate}&p=${i}&format=json`);
        }
        ep.after('end', targetURLs.length, () => {
            parentPort.postMessage({ type: 'log', data: `获取到 ${artworks.length} 个作品信息` })
            resolve(artworks);
        });
        targetURLs.forEach(async (url) => {
            // parentPort.postMessage({ type: 'log', data: '爬取 ' + url })
            data = await superagent.get(url);
            data = JSON.parse(data.text);
            artworks = artworks.concat(data.contents);
            ep.emit("end");
        })
    });
}

function getImgURLs(artworks) {
    return new Promise((resolve, reject) => {
        const ep = new eventproxy();
        ep.after('end', artworks.length, (imgurls) => {
            parentPort.postMessage({ type: 'log', data: `获取到 ${imgurls.length} 个图片链接` });
            resolve(imgurls);
        });
        artworks.forEach(async (artwork) => {
            const dbartwork = await mdb.collection('artworks').findOne({ aid: artwork.illust_id });
            if (dbartwork) return;
            const url = 'https://www.pixiv.net/artworks/' + artwork.illust_id;
            const data = await superagent.get(url);
            const imgurl = /"(https:\/\/i\.pximg\.net\/img-original\/.*?)\"/g.exec(data.text);
            if (imgurl) {
                // parentPort.postMessage({ type: 'log', data: `已获取 ${artwork.title}(${artwork.illust_id}) 图片链接` });
                ep.emit("end", { imgurl: imgurl[1], title: artwork.title, id: artwork.illust_id, referer: url, pcnt: artwork.illust_page_count });
            } else {
                // parentPort.postMessage({ type: 'error', data: `未能获取到 ${artwork.title}(${artwork.illust_id}) 图片链接` });
                ep.emit("end");
            }
        })
    });
}

function saveImgs(imginfo) {
    return new Promise((resolve, reject) => {
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36 Edg/80.0.361.69';
        const ep = new eventproxy();
        let count = 0;
        ep.after('end', 11/*imginfo.length*/, () => {
            parentPort.postMessage({ type: 'log', data: `保存了 ${count} 个图片` });
            resolve(count);
        });
        if (!fs.existsSync('imgs')) fs.mkdirSync('imgs');
        imginfo = imginfo.splice(0, 11);
        imginfo.forEach((info, index) => {
            setTimeout(async () => {
                if(info.pcnt==1){
                    img = await superagent.get(info.imgurl).set("user-agent", ua).set("referer", info.referer).catch(error => {
                        parentPort.postMessage({ type: 'error', data: error });
                    });
                    const ct = img.header['content-type'].split('/');
                    const basePath = `imgs/${PRDate}`;
                    if (!fs.existsSync(basePath)) fs.mkdirSync(basePath);
                    fs.writeFile(`${basePath}/${info.id}.${ct[ct.length - 1]}`, img.body, async (error) => {
                        if (!error) {
                            await mdb.collection('d' + PRDate).insertOne({
                                path: basePath,
                                aid: info.id,
                                title: info.title,
                                downCount: 0,
                                filename: `${info.id}.${ct[ct.length - 1]}`
                            }).catch(error => {
                                parentPort.postMessage({ type: 'error', data: error });
                            });
                            webp.cwebp(`${basePath}/${info.id}.${ct[ct.length - 1]}`, `${basePath}/${info.id}.webp`, "-q 10", () => {
                                count++;
                                ep.emit("end");
                            });
                        } else parentPort.postMessage({ type: 'error', data: error })
                    })
                } else {
                    ep.emit("end");
                }
            }, index * 1000);
        })
    });
}

async function spiderMain(save) {
    //获取作品信息列表
    try {
        parentPort.postMessage({ type: 'log', data: '开始爬取' });
        const artworks = await getArtworks();
        const imginfo = await getImgURLs(artworks);
        const count = await saveImgs(imginfo);
        parentPort.postMessage({ type: 'log', data: '爬取结束' });
        save(count);
    } catch (error) {
        parentPort.postMessage({ type: 'error', data: error });
        return;
    }
}

function loop() {
    PRDate = time.getPRDate();
    mdb.collection('date').findOne({ date: PRDate }).then(date => {
        //如果昨天排行榜没有被爬过
        if (!date) {
            try {
                //爬排行榜,爬完之后将记录保存在数据库
                spiderMain((count) => {
                    mdb.collection('date').insertOne({ date: PRDate, count: count }).catch(error => {
                        parentPort.postMessage({ type: 'error', data: error });
                    });
                });
            } catch (error) {
                parentPort.postMessage({ type: 'error', data: error });
            }
        }
    }).catch(error => {
        parentPort.postMessage({ type: 'error', data: error });
    });
}


async function deleteall(path, deldir) {
    fs.readdir(path, (err, files) => {
        const ep = new eventproxy();
        ep.after('end', files.length, () => {
            deldir()
        });
        files.forEach((file, index) => {
            fs.unlink(path + "/" + file, () => {
                ep.emit('end');
            });
        });
    });
}

function del() {
    function deldir() {
        fs.exists(`imgs/${pdate}`, async (exists) => {
            if (!exists) return;
            deleteall(`imgs/${pdate}`, () => {
                fs.rmdir(`imgs/${pdate}`, (error) => {
                    if (error) parentPort.postMessage({ type: 'error', data: error });
                    else parentPort.postMessage({ type: 'log', data: `删除imgs/${pdate}文件夹` });
                });
            });
            mdb.collection('d' + pdate).drop((err, delOK) => {
                if (delOK) {
                    mdb.collection('date').deleteOne({ date: pdate }).then(() => {
                        parentPort.postMessage({ type: 'log', data: `数据库删除${pdate}` });
                    }).catch(error => {
                        parentPort.postMessage({ type: 'error', data: error });
                    });
                }
            })
        })
    }
    const pdate = time.getPRDate(5);
    mdb.collection('d' + pdate).find().sort({ "downCount": -1 }).limit(10).toArray().then((data) => {
        if (!data) return;
        data = data.filter((e) => e.downCount);
        if (data.length) {
            const path = `picked/${pdate}`;
            const ep = new eventproxy();
            ep.after('end', data.length, () => {
                deldir();
            });
            if (!fs.existsSync('picked')) fs.mkdirSync('picked');
            if (!fs.existsSync(path)) fs.mkdirSync(path);
            for (let i = 0; i < data.length; i++) {
                data[i].rpath = data[i].path;
                fs.rename(`${data[i].rpath}/${data[i].filename}`, `${path}/${data[i].filename}`, (error) => {
                    if(error)parentPort.postMessage({ type: 'error', data: error });
                    fs.rename(`${data[i].rpath}/${data[i].aid}.webp`, `${path}/${data[i].aid}.webp`, (error) => {
                        if(error)parentPort.postMessage({ type: 'error', data: error });
                        ep.emit('end');
                    })
                })
                data[i].path = path;
            }
            mdb.collection('picked').insertMany(data).then(() => { }).catch(error => {
                parentPort.postMessage({ type: 'error', data: error });
            });
        } else {
            deldir();
        }
    }).catch(error => {
        parentPort.postMessage({ type: 'error', data: error });
    });
}

function stratSpider(db) {
    mdb = db;
    parentPort.postMessage({ type: 'log', data: '爬虫正在启动....' });
    //每一小时执行一次loop函数
    setInterval(loop, 1000 * 60 * 60);
    setInterval(del, 1000 * 60 * 60 * 10);
    loop();
    del();
}

function main(port, db) {
    parentPort = port;
    //连接数据库
    mongodb.MongoClient.connect('mongodb://localhost', { useUnifiedTopology: true }).then(client => {
        db = client.db('pixiv');
        //开启爬虫定时器
        stratSpider(db);
    })
}
module.exports = main;