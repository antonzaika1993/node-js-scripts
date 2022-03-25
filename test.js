const puppeteer = require("puppeteer-extra");

async function start() {
    console.log('1')
    let browser = await puppeteer.launch()
    console.log('2')
    let page = await browser.newPage()
    console.log('3')
    await page.goto('https://www.google.com')
    console.log('4')
    await page.screenshot({path: 'google_com_screenshot.webp'})
    console.log('5')
    await browser.close()
    console.log('6')
}

start()
