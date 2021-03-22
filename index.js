const puppeteer = require("puppeteer");
const fs = require('fs');
const path = require('path');
const format = require('date-fns/format');
const json2csv = require('json2csv').parse;

const write = async (fileName, data) => {
  // output file in the same folder
  const filename = path.join(__dirname, `${fileName}`);
  let rows;
  // If file doesn't exist, we will create new file and add rows with headers.    
  if (!fs.existsSync(filename)) {
      rows = json2csv(data, { header: true });
  } else {
      // Rows without headers.
      rows = json2csv(data, { header: false });
  }

  // Append file function can create new file too.
  fs.appendFileSync(filename, rows);
  // Always add new line if file already exists.
  fs.appendFileSync(filename, "\r\n");
}

const getSession = (h) => {
  if( h >= 23 ) {
    return 'late';
  } else if( h >= 18 ) {
    return 'evening';
  } else if( h >= 12 ) {
    return 'midday';
  } else {
    return 'morning'
  }
}

const delay = (time) => {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}


(async () => {

  [
    './data',
    './data/daily',
    './img'
  ].map( (dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  })

  const processDate = new Date();
  const date = format( processDate, 'yyyy-MM-dd');
  const hour = format( processDate, 'H');
  const session = getSession( hour );
  const timestamp = format( processDate, 'yyyyMMddHHmm');

  const browser = await puppeteer.launch();
  const page = await browser.newPage();  
  await page.setViewport({
    width: 1290,
    height: 900,
    deviceScaleFactor: 1,
  });

  const pages = [    
    {
      "proj": 'cnn-intl',
      "url": "https://edition.cnn.com",
      "sectionSel": ".zn--idx-1",
      "linkSel": ".zn--idx-1 .cd__headline a",
      "agreeBtn": "#onetrust-accept-btn-handler"
    },
    {
      "proj": 'cnn-us',
      "url": "https://us.cnn.com",
      "sectionSel": ".zn--idx-1",
      "linkSel": ".zn--idx-1 .cd__headline a",
      "agreeBtn": "#onetrust-accept-btn-handler"
    },
    {
      "proj": "nyt",
      "url": "https://www.nytimes.com",
      "sectionSel": "section[data-block-tracking-id='Spotlight']",
      "linkSel": "section[data-block-tracking-id='Spotlight'] .story-wrapper > a[data-story]:first-of-type",
      "agreeBtn": "button[data-testid='GDPR-accept']"
    },
    {
      "proj": 'guardian-uk',
      "url": "https://www.theguardian.com/uk",
      "sectionSel": "#headlines",
      "linkSel": "#headlines .fc-item__link",
      "agreeFrame" : "https://sourcepoint.theguardian.com/index.html?message_id=414203",
      "agreeBtn" : ".message-button"
    }    
  ]

  const capture = async ( {proj, url, sectionSel, linkSel, agreeBtn, agreeFrame} ) => {

      console.log( `${proj} : capture ${url}`);
      try {
        await page.goto( url );

        await page.waitForSelector( sectionSel, { timeout: 10000 });

        if( agreeFrame ) {
          try {
            const frame = page.frames().find(frame => frame.url().indexOf(agreeFrame) > -1 );
            frame.click(agreeBtn);
          } catch (error) {
            console.log("The agree frame didn't appear.")
          }
        }

        if( agreeBtn ) {
          try {
            await page.waitForSelector(agreeBtn, { timeout: 5000 })
            await page.click( agreeBtn );
          } catch (error) {
            console.log("The agree button didn't appear.")
          }
        }

        // wait a few seconds to give other things time to load
        await delay(5000);

      
        const top = await page.$( sectionSel );

        // grab the top section links and headlines
        const stories = await page.evaluate((linkSel) => {    
          const linkNodes = document.querySelectorAll( linkSel );
          let links = [];
          linkNodes.forEach(link => {
            links.push({
              href: link.href,
              txt: link.textContent
            })
          })
          return links;
        }, linkSel)

        // add in metadata
        const records = stories.map(
          ( d ) => {
            return {
              date,
              timestamp,
              session,
              ...d
            }
          }
        )

      // write the data
      console.log('writing csv');
      await write(`data/${proj}.csv`, records);
      await write(`data/daily/${proj}-${timestamp}.csv`, records);

      // take the screenshot
      console.log('taking screenshot');
      await top.screenshot( { path: `img/${proj}-${timestamp}.png` } );
      console.log('Done!')
    } catch (error) {
      console.log(`Problem with capture - ${proj}`);
    }

  }
  

  const doNextCapture = async (d) => {
    return capture(pages[d])
      .then(x => {
        d++;
        if (d < pages.length)
          return doNextCapture(d)
        else
          console.log(`done all.`);
      })
  }

  await doNextCapture(0);
  
  

  await browser.close();
})();
