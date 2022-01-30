const GBJS = require('../../../gbjs.js');

test('acceptance/oam_dma/sources-GS.gb', () => {
    const dummyDevice = { render: () => {} };    
    const testCallback = jest.fn();

    const gbjs = new GBJS(dummyDevice, { dump: true, testCallback });
    gbjs.loadRom('./test_roms/acceptance/oam_dma/sources-GS.gb');
    
    while (testCallback.mock.calls.length === 0) {
        gbjs.nextFrame();    
    }

    expect(testCallback).toHaveBeenCalledWith(true);
});