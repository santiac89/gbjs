require('native-canvas');
const CanvasOutputDevice = require('./canvasDevice.js');
const GBJS = require('./gbjs.js');

const canvasOutput = new CanvasOutputDevice();

const gbjs = new GBJS(canvasOutput, { dump: false, timestamp: Date.now(), testCallback: () => {} });

gbjs.loadRom('./test_roms/acceptance/oam_dma_start.gb');
// gbjs.loadRom('./test_roms/visual/m2_win_en_toggle.gb');
// gbjs.loadRom('./test_roms/visual/m3_scy_change.gb');
// gbjs.loadRom('./tetris.gb');

gbjs.initialize();

const next = () => {
    gbjs.nextFrame();
    window.requestAnimationFrame(next);
}

next();