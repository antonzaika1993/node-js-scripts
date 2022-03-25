// noinspection DuplicatedCode

const puppeteer = require("puppeteer-extra");
const axios = require('axios')
const mysql = require('mysql');
require('dotenv').config();
const header = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36',
    'accept': '*/*'
}

const DB_HOST = process.env.DB_HOST
const DB_USER = process.env.DB_USER
const DB_PASSWORD = process.env.DB_PASSWORD
const DB_NAME = process.env.DB_NAME

const keywords_ad_networks = {
    'propellerclick': '28',
    'youradexchange': '12',
    'display.php': '12',
    '.casa/': '13',
    'serve.popads.net': '57'
}

let publishers = []
let publishers_http_statuses = []
let conn = ''
let table_publishers = "pop_publisher_links"
let table_urls = "interstitial_master_urls"

function connectToMySql() {
    return new Promise((resolve, reject) => {
        conn = mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME
        });
        // let n = null.toString() // test raise exception
        conn.connect(function (err) {
            if (err) reject(err);
            conn.query("SELECT * FROM " + table_publishers, function (err, result) {
                if (err) reject(err);
                resolve(result)
            });
        })
    })
}

function check_axios(pub) {
    return new Promise(async (resolve, reject) => {
        try {
            let axios_instance = axios.create();
            axios_instance.defaults.timeout = 5000;
            console.log('axios GET to publisher url')
            axios_instance.get(pub.url, {
                headers: header,
                timeout: 5000
            }).then((r) => {
                console.log('http status = ', r.status)
                publishers_http_statuses.push([200, pub.publisher_link_id])
                resolve(true)
            }).catch(e => {
                let bad_status = 404
                if (e.response) {
                    if (e.response.status) {
                        console.log('http status = ', e.response.status)
                        bad_status = e.response.status
                    }
                }
                console.log('http status = ', bad_status)
                publishers_http_statuses.push([bad_status, pub.publisher_link_id])
                resolve(false)
            })
        } catch {
            reject(false)
        }
    })
}

function StartScraping() {
    console.log('*** Start Scraping')
    let scraping_result = []
    let pup_obj = puppeteer
    return new Promise(async (resolve, reject) => {
        try {
            pup_obj = puppeteer.launch(
            //     {
            //     "headless": true,
            //     // "args": ["--fast-start", "--disable-extensions", "--no-sandbox"],
            //     "ignoreHTTPSErrors": true
            // }
            )
        } catch (e) {
            reject(e)
            return false
        }
        await pup_obj.then(async (browser) => {
            console.log('we in puppeteer launch then')
            const page = await browser.newPage();
            await page.setExtraHTTPHeaders(header)
            for (let i in publishers) {
                let publisher = publishers[i]
                console.log('*************************************************************************************')
                console.log('publisher_link_id = ', publisher.publisher_link_id, ' publisher_url = ', publisher.url)
                let resp = []
                if (await check_axios(publisher)) {
                    try {
                        await page.goto(publisher.url, {
                        waitUntil: "load",
                        timeout: 20000,
                        });
                    } catch (e) {
                        // pass
                    }
                } else {
                    // pass
                }
                if (i > 4) {
                    break
                }
            }
            await page.browser().close()
        });
        console.log('*** Finished StartScraping')
        resolve(scraping_result)
    })
}

const updatePublishers = async _ => {
    console.log('*** We in updatePublishers !!!')
    for (let i in publishers_http_statuses) {
        let item = publishers_http_statuses[i]
        await new Promise((resolve, reject) => {
            try {
                conn.query(
                    'update ' + table_publishers + ' SET http_status=? WHERE publisher_link_id=?', item, function (err) {
                        if (err) throw err;
                        resolve()
                    })
            } catch (e) {
                console.log(e)
                reject()
            }
        })
    }
    console.log('*** Update END ***')
    conn.end();
}

async function main() {
    try {
        publishers = await connectToMySql() // list of objects
        console.log('*** Success getting publishers.\nLength of publishers = ', publishers.length)
    } catch (e) {
        console.log('!!! Error in get publishers ', e)
        return null
    }
    try {
        let result = await StartScraping() // Working with every publisher
        console.log('*** Success getting result.\nLength of result = ', result.length)
    } catch (e) {
        console.log('!!! Error in get result ', e)
        return null
    }
    // insertUrls(conn, table_urls, master_urls_to_insert)
    // await updatePublishers()
    console.log('*** MAIN END ***')
}

let start = main()
