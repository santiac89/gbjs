const GBJS = require('../../gbjs.js');

test('acceptance/ret_timing.gb', () => {
    const dummyDevice = { render: () => {} };    
    const testCallback = jest.fn();

    const gbjs = new GBJS(dummyDevice, { testCallback });
    gbjs.loadRom('./test_roms/acceptance/ret_timing.gb');
    
    while (testCallback.mock.calls.length === 0) {
        gbjs.nextFrame();    
    }

    expect(testCallback).toHaveBeenCalledWith(true);
});