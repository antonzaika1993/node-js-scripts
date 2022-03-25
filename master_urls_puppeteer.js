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
let result = []
let master_urls_to_insert = []
let publishers_http_statuses = []
let conn = ''
let table_publishers = "pop_publisher_links"
let table_urls = "interstitial_master_urls"

// propeller - clickUrl key in json response
// adCash - url key in json response
// adMaven - url key in json response
// popAds - don't check
// if master url like 'https://native.propellerclick.com/1?z=3344762' then need replace
// "1?z=" to "9?z=" and send request for getting json response
// str = str.replace(/\/\d+(\?z=\d+)/i, '/9$1')

function checkMasterUrls(list) {
    return new Promise(async (resolve, reject) => {
        let resolve_data = []
        let json_url_key = 'url'
        try {
            // let n = null.toString()  // test raise exception
            for (let i in list) {
                console.log('check ')
                let obj = list[i]
                if (obj.ad_network_term_id !== '57') {
                    console.log('master url 57 ', obj.ad_network_term_id)
                    if (obj.ad_network_term_id === '28') {
                        json_url_key = 'clickUrl'
                        let reg_ex_propeller = /\/\d+(\?z=\d+)/i
                        obj.master_url = obj.master_url.replace(reg_ex_propeller, '/9$1')
                        console.log('obj.master_url = ', obj.master_url)
                    }
                    await axios.get(obj.master_url, {headers: header}).then((resp) => {
                        // console.log(resp)
                        console.log('master url status = ', resp?.status)

                        let resp_data = resp?.data
                        console.log('typeof resp_data = ', typeof resp_data)
                        if (typeof resp_data === 'string') {
                            try {
                                resp_data = JSON.parse(resp_data);
                                console.log('resp data is json')
                                if (resp_data[json_url_key]) {
                                    resolve_data.push(obj)
                                    console.log('this master url is good')
                                }
                            } catch (e) {
                                console.log('invalid json. Master url bad');
                                console.log('master url = ', obj.master_url);
                                console.log('resp_data = ', String(resp_data).slice(0, 50));
                            }
                        } else if (typeof resp_data === 'object') {
                            console.log('resp_data === object.constructor ', resp_data.constructor)
                            if (resp_data[json_url_key]) {
                                resolve_data.push(obj)
                                console.log('this master url is good')
                            } else if (resp_data?.driver) {
                                if (resp_data.driver?.landing) {
                                    if (resp_data.driver.landing[json_url_key]) {
                                        resolve_data.push(obj)
                                        console.log('this master url is good')
                                    }
                                    else {
                                        console.log('invalid resp_data. Master url bad')
                                    }
                                }
                                else {
                                    console.log('invalid resp_data. Master url bad')
                                }
                            } else {
                                console.log('invalid resp_data. Master url bad')
                            }
                        }

                    }).catch((e) => {
                        console.log(e?.request?.res?.statusCode)
                    })
                } else {
                    console.log('master url 57. Good master url')
                    resolve_data.push(obj)
                }
            }
            resolve(resolve_data)
        } catch (e) {
            console.log('checkMasterUrls ERROR = ', e)
            resolve(resolve_data)
        }
    })
}

function connectToMySql() {
    return new Promise((resolve, reject) => {
        try {
            conn = mysql.createConnection({
                host: DB_HOST,
                user: DB_USER,
                password: DB_PASSWORD,
                database: DB_NAME
            });
            // let n = null.toString() // test raise exception
            conn.connect(function (err) {
                if (err) throw err;
                conn.query("SELECT * FROM " + table_publishers, function (err, result) {
                    if (err) throw err;
                    resolve(result)
                });
            })
        } catch (e) {
            reject(e)
        }
    })
}

async function StartScraping(publisher) {
    let resp = []
    let axios_instance = axios.create();
    axios_instance.defaults.timeout = 5000;
    console.log('axios GET to publisher url')
    await axios_instance.get(publisher.url, {
        headers: header,
        timeout: 5000
    }).then(async (r) => {
        console.log('http status = ', r.status)
        publishers_http_statuses.push([200, publisher.publisher_link_id])
        await puppeteer
            .launch({
                "headless": true,
                "args": ["--fast-start", "--disable-extensions", "--no-sandbox"],
                "ignoreHTTPSErrors": true
            })
            .then(async (browser) => {
                console.log('we in puppeteer launch then')
                const page = await browser.newPage();

                page.on("response", async (response) => {
                    for (let keyword in keywords_ad_networks) {
                        let ad_network = keywords_ad_networks[keyword]
                        // console.log('keyword = ', keyword)
                        if (await response._url.includes(keyword)) {
                            // console.log('keyword includes')
                            resp.push({
                                'publisher_link_id': publisher.publisher_link_id,
                                'ad_network_term_id': ad_network,
                                'master_url': await response._url
                            })
                        }
                    }
                });
                await page.setExtraHTTPHeaders(header)
                try {
                    await page.goto(publisher.url, {
                        waitUntil: "load",
                        timeout: 15000,
                    });
                    await page.browser().close()
                } catch (e) {
                    console.log('Bad url ', publisher.url, ' ', e)
                    await page.browser().close()
                }
            });
    }).catch((e) => {
        let bad_status = 404
        if (e.response) {
            if (e.response.status) {
                console.log('http status = ', e.response.status)
                bad_status = e.response.status
            }
        }
        publishers_http_statuses.push([bad_status, publisher.publisher_link_id])
        return resp
    })
    console.log('we out StartScraping. Resp = ', resp)

    return await checkMasterUrls(resp)
}

const forLoop = async _ => {
    console.log('Start forLoop')
    for (let i in publishers) {
        let publisher = publishers[i]
        console.log('*********************************************************************************************')
        console.log('publisher_link_id = ', publisher.publisher_link_id, ' publisher_url = ', publisher.url)
        let main_resp = await StartScraping(publisher)
        if (main_resp.length) {
            console.log('MAIN RESP AFTER STARTSCRAPING = ', main_resp)
        } else {
            console.log('... Main resp after start scraping is empty :( ...')
        }
        main_resp.forEach((item) => {
            result.push(item)
        })
        console.log('finished StartScraping')
    }
    console.log('result example = [...,', result[result.length - 1], ']')
    console.log('pub_http_statuses example = [...,', publishers_http_statuses[publishers_http_statuses.length - 1], ']')
    console.log('ForLoop End')
}

function prepareResult() {
    console.log('*** We in prepareResult after "ForLoop End"')
    return new Promise((resolve, reject) => {
        result.forEach((item) => {
            master_urls_to_insert.push([item.master_url, item.publisher_link_id, item.ad_network_term_id])
        })
        resolve()
    })
}

// bulk insert

function insertUrls(connection, table, values) {
    console.log('*** We in insertUrls !!!')
    let sql = "INSERT INTO " + table + " (master_url, rel_publisher_link_id, rel_term_id) VALUES ?";
    conn.query(sql, [values], function (err) {
        if (err) throw err;
        conn.end();
        console.log('*** Insert END ***')
    });
}

// bulk update

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
    } catch (e) {
        console.log('Error in get publishers ', e)
        return null
    }
    console.log('*** Success getting publishers.\nLength of publishers = ', publishers.length)
    await forLoop() // Working with every publisher
    await prepareResult(result) // makes  [ [...], [...], [...] ]
    insertUrls(conn, table_urls, master_urls_to_insert)
    await updatePublishers()
    console.log('*** MAIN END ***')
    return null
}

let start = main()

// main('https://fanproj.net/')

// test messages - writing from my home. I set new work space. Look like good.
