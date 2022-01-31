
const fs = require('fs');
const Memory = require('./memory.js');
const Timer = require('./timer.js');
const CPU = require('./cpu.js');
const GPU = require('./gpu.js');
const Screen = require('./screen.js');
const CanvasOutputDevice = require('./canvasDevice.js');

// CPU 4194304 Hz - 4194304 cycles per second
// LCD Refresh 60Hz - 60 frames per second
// So each frame is rendered every 4194304 / 60 = 69905 cycles
const CYCLES_PER_FRAME = 69906; // Cycles per frame

function GBJS(outputDevice = new CanvasOutputDevice(), debugOpts = { dump: false, testCallback: () => {} }) {
    this.cycles = 0;

    const memory = new Memory();
    const timer = new Timer(memory);
    const screen = new Screen(memory);
    const gpu = new GPU(memory, screen);
    const cpu = new CPU(memory, debugOpts);
    
    memory.setTimer(timer);
    memory.initialize();
    memory.setCpu(cpu);
    memory.setGpu(gpu);
    
    this.loadRom = (romPath) => {
        const romBuffer = fs.readFileSync(romPath);
        memory.loadROM([...romBuffer]);
    }

    this.nextFrame = () => {
        while (this.cycles <= CYCLES_PER_FRAME) { // Execute until frame needs to be rendered
            const m = cpu.fetchAndExecute();
            this.cycles += m * 4;
            timer.step(m * 4);
            gpu.step(m * 2);
            const interruptM = cpu.handleInterrupts();
            timer.step(interruptM * 4);
        }
        
        this.cycles -= CYCLES_PER_FRAME;
        
        outputDevice.render(screen.screenData);
    }
}

module.exports = GBJS;