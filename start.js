require('native-canvas');
const CanvasOutputDevice = require('./canvasDevice.js');
const GBJS = require('./gbjs.js');

const canvasOutput = new CanvasOutputDevice();

const gbjs = new GBJS(canvasOutput, { dump: false, testCallback: () => {} });

gbjs.loadRom('./tetris.gb');
// gbjs.loadRom('./tetris.gb');

const next = () => {
    gbjs.nextFrame();
    window.requestAnimationFrame(next);
}

next();