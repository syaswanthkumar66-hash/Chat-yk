const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting WebRTC race condition automated test...");

  // Start two browser instances (or two pages in one browser)
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--mute-audio'
    ]
  });

  const page1 = await browser.newPage();
  const page2 = await browser.newPage();

  // Peer 2 (Receiver) will have an artificially delayed media acquisition
  await page2.evaluateOnNewDocument(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      console.log("[Test Script] Artificially delaying getUserMedia by 3000ms...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log("[Test Script] 3000ms delay finished. Acquiring real media...");
      return originalGetUserMedia(constraints);
    };
  });

  // Expose a function to capture console logs
  page1.on('console', msg => console.log('[Peer 1]', msg.text()));
  page2.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Diagnostic]') || text.includes('[Test Script]')) {
      console.log('[Peer 2]', text);
    }
  });

  const url = 'http://localhost:3000'; 
  console.log("Navigating Peer 1 to app...");
  await page1.goto(url);
  
  console.log("Navigating Peer 2 to app...");
  await page2.goto(url);

  // We need to trigger a call between Peer 1 and Peer 2. 
  // Since we don't have the exact UI selectors, we can just run a script in the context of the page 
  // to directly invoke the socket signal, or we can instruct the user on how this test works.
  
  console.log(`
Test environment ready. 
To fully automate the call initiation, we'd need exact DOM selectors for the "Call" button.
However, the artificial delay is successfully injected into Peer 2. 
If Peer 1 calls Peer 2, Peer 2's media will take 3 seconds to resolve, 
forcing the 'offer' or 'peer_joined' signal to be queued.
  `);

  await new Promise(resolve => setTimeout(resolve, 10000));
  await browser.close();
  console.log("Test finished.");
})();
