require('native-canvas');
const CanvasOutputDevice = require('./canvasDevice.js');
const GBJS = require('./gbjs.js');

const canvasOutput = new CanvasOutputDevice();

const gbjs = new GBJS(canvasOutput, { dump: true, timestamp: Date.now(), testCallback: () => {} });

gbjs.loadRom('./test_roms/acceptance/timer/tima_write_reloading.gb');

gbjs.initialize();

const next = () => {
    gbjs.nextFrame();
    window.requestAnimationFrame(next);
}

next();