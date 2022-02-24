require('native-canvas');
const CanvasOutputDevice = require('./canvasDevice.js');
const GBJS = require('./gbjs.js');

const canvasOutput = new CanvasOutputDevice();

const gbjs = new GBJS(canvasOutput, { dump: false, timestamp: Date.now(), testCallback: () => {} });

// gbjs.loadRom('./dmg-acid2.gb');
// gbjs.loadRom('./test_roms/blargg/09-op r,r.gb');
gbjs.loadRom('./test_roms/visual/m2_win_en_toggle.gb');

gbjs.initialize();

const next = () => {
    gbjs.nextFrame();
    window.requestAnimationFrame(next);
}

next();