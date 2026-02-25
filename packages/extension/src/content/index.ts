import { ConsoleCapture } from "./capture.js";
import { NetworkCapture } from "./capture.js";

const consoleCapture = new ConsoleCapture();
const networkCapture = new NetworkCapture();

consoleCapture.start();
networkCapture.start();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get_console_logs") {
    sendResponse(consoleCapture.flush());
    return false;
  }

  if (message.type === "get_network_logs") {
    sendResponse(networkCapture.flush());
    return false;
  }

  return false;
});
