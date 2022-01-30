const GBJS = require('../../../gbjs.js');

test('acceptance/timer/tima_reload.gb', () => {
    const dummyDevice = { render: () => {} };    
    const testCallback = jest.fn();

    const gbjs = new GBJS(dummyDevice, { testCallback });
    gbjs.loadRom('./test_roms/acceptance/timer/tima_reload.gb');
    
    while (testCallback.mock.calls.length === 0) {
        gbjs.nextFrame();    
    }

    expect(testCallback).toHaveBeenCalledWith(true);
});