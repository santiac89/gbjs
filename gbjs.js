
const fs = require('fs');
const Memory = require('./memory.js');
const Timer = require('./timer.js');
const CPU = require('./cpu.js');
const PPU = require('./ppu.js');
// const Screen = require('./screen.js');
const CanvasOutputDevice = require('./canvasDevice.js');

// CPU 4194304 Hz - 4194304 cycles per second
// LCD Refresh 60Hz - 60 frames per second
// So each frame is rendered every 4194304 / 60 = 69905 cycles
const CYCLES_PER_FRAME = 70224; // Cycles per frame

function GBJS(outputDevice = new CanvasOutputDevice(), debugOpts = { dump: false, testCallback: () => {} }) {
    this.cycles = 0;

    const memory = new Memory(debugOpts);
    const timer = new Timer(memory, debugOpts);
    // const screen = new Screen(memory);
    const ppu = new PPU(memory);
    const cpu = new CPU(memory, debugOpts);
    
    memory.setTimer(timer);
    memory.setCpu(cpu);
    memory.setPpu(ppu);
    memory.initialize();
    
    this.loadRom = (romPath) => {
        const romBuffer = fs.readFileSync(romPath);
        memory.loadROM([...romBuffer]);
    }

    this.advanceCycles = (t) => {
        timer.step(t);
        ppu.step(t);
        memory.step(t);
        this.cycles += t;
    }

    cpu.setAdvanceCycles(this.advanceCycles);
    
    this.initialize  = () => {
    }

    this.nextFrame = () => {
        while (this.cycles <= CYCLES_PER_FRAME) { // Execute until frame needs to be rendered
            let pendingCycles = cpu.fetchAndExecute();
            this.cycles += pendingCycles;
            this.advanceCycles(pendingCycles);
            pendingCycles = cpu.handleInterrupts();
            this.advanceCycles(pendingCycles);
        }
        
        this.cycles -= CYCLES_PER_FRAME;
        
        outputDevice.render(ppu.screenData);
    }
}

module.exports = GBJS;