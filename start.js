
require('native-canvas');
const fs = require('fs');
const Memory = require('./memory.js');
const Timer = require('./timer.js');
const CPU = require('./cpu.js');
const GPU = require('./gpu.js');
const Screen = require('./screen.js');
const logUpdate = require('log-update');
const time = Date.now();

// const rom = fs.readFileSync('./tetris.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/bits/reg_f.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/bits/mem_oam.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/instr/daa.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/oam_dma/basic.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/boot_div-dmg0.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/boot_regs-dmg0.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/timer/tim10_div_trigger.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/timer/tim10.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/timer/tima_reload.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/timer/div_write.gb');

const rom = fs.readFileSync('./test_roms/acceptance/timer/tima_write_reloading.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/timer/tma_write_reloading.gb');

// const rom = fs.readFileSync('./test_roms/acceptance/timer/rapid_toggle.gb');

// const rom = fs.readFileSync('./test_roms/acceptance/call_timing.gb');
// const rom = fs.readFileSync('./test_roms/acceptance/if_ie_registers.gb');

// A passing test:
    // writes the Fibonacci numbers 3/5/8/13/21/34 to the registers B/C/D/E/H/L
    // executes an LD B, B opcode
    // sends the same Fibonacci numbers using the link port. In emulators, the serial interrupt doesn't need to be implemented since the mechanism uses busy looping to wait for the transfer to complete instead of relying on the interrupt

// A failing test:

    // executes an LD B, B opcode, but the B/C/D/E/H/L registers won't contain the "magic" Fibonacci numbers
    // sends the byte 0x42 6 times using the serial port

const memory = new Memory();
const timer = new Timer(memory, time);
const screen = new Screen(memory);
const gpu = new GPU(memory, screen);
const cpu = new CPU(memory, timer);

memory.setTimer(timer);
memory.initialize();
memory.loadROM(rom);

// CPU 4194304 Hz - 4194304 cycles per second
// LCD Refresh 60Hz - 60 frames per second
// So each frame is rendered every 4194304 / 60 = 69905 cycles

const CYCLES_PER_FRAME = 69906; // Cycles per frame

const logState = () => {
    const cpuState = cpu.getState();
    const gpuState = gpu.getState();
    const timerState = timer.getState();

    logUpdate(`
        CPU:
            ${cpuState}
        GPU:
            ${gpuState}
        Timer:
            ${timerState}
    `);
}

document.title = 'GBJS';
canvas.height = '144px';
canvas.width = '160px';

let cycles = 0;

const frame = () => {
    while (cycles <= CYCLES_PER_FRAME) { // Execute until frame needs to be rendered
        const { t, m } = cpu.executeNext(time,);
        cycles += t;
        timer.step(t, time);
        gpu.step(t / 2);
        const { t: interruptT, m: interruptM } = cpu.handleInterrupts();
        timer.step(interruptT, time);
        // logState();
    }
    
    cycles -= CYCLES_PER_FRAME;
    
    screen.render();

    window.requestAnimationFrame(frame);
}

frame();