require('native-canvas');
const CanvasOutputDevice = require('./canvasDevice.js');
const GBJS = require('./gbjs.js');

const canvasOutput = new CanvasOutputDevice();

const gbjs = new GBJS(canvasOutput, { dump: true, testCallback: () => {} });

gbjs.loadRom('./test_roms/acceptance/pop_timing.gb');
// gbjs.loadRom('./tetris.gb');

const next = () => {
    gbjs.nextFrame();
    window.requestAnimationFrame(next);
}

next();