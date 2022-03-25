const axios = require("axios");
const puppeteer = require("puppeteer-extra");
const fs = require('fs');


function saveToFile(data) {
    fs.writeFile('helloworld.html', data, function (err) {
      if (err) return console.log(err);
      console.log('*** helloworld.html saved!');
    });
}


async function Start(url, header) {
    let axios_instance = axios.create();
    axios_instance.defaults.timeout = 5000;
    console.log('axios GET to url')
    await axios_instance.get(url, {
        headers: header,
        timeout: 5000
    }).then(async (r) => {
        console.log('http status = ', r.status)
        await puppeteer
            .launch({
                "headless": true,
                "args": ["--fast-start", "--disable-extensions", "--no-sandbox"],
                "ignoreHTTPSErrors": true
            })
            .then(async (browser) => {
                console.log('we in puppeteer launch then')
                const page = await browser.newPage();
                await page.setExtraHTTPHeaders(header)
                try {
                    await page.goto(url, {
                        waitUntil: "load",
                        timeout: 15000,
                    });
                    const html = await page.content();
                    saveToFile(html)
                    await page.browser().close()
                } catch (e) {
                    console.log('Bad url ', url, ' ', e)
                    await page.browser().close()
                }
            });
    }).catch((e) => {
        console.log(e)
    })
    console.log('we out Start')
}

let url = 'https://app.socialadspyder.com/favorites'
let header = {
    authorization: "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNjQ3OTcwODcwLCJqdGkiOiJkNDcyODZkMDczOTY0MzU0YWNmMjIxNmU3MThlOTkzMCIsInVzZXJfaWQiOjMwNX0.nlTQ8NKCPEtixXX5qf9pl2KZk477yfJL56_-jaU5avQ"
}

Start(url, header)
