const fs = require('fs');

const Timer = function(memory, debugOpts) {
    const TIMA_REG = 0xFF05;
    const DIV_REG = 0xFF04;
    const COUNTER_REG = 0xFF03;
    const TAC_REG = 0xFF07;
    const TMA_REG = 0xFF06;
    const IF_REG = 0xFF0F;

    this.currentFrequency = 0;
    this.clock = 0;
    this.timaOverflowed = false;
    this.timaReloadClock = 0;

    this.getState = () => {
        return `
            TIMA: ${memory.io[TIMA_REG - 0xFF00].toString(16)}
            DIV: ${memory.io[DIV_REG - 0xFF00].toString(16)}
            TMA: ${memory.io[TMA_REG - 0xFF00].toString(16)}
            TAC: ${memory.io[TAC_REG - 0xFF00].toString(16)}
        `;
    }

    this.timerIsEnabled = () => {
       return (memory.io[TAC_REG - 0xFF00] & 0b100) > 0;
    }

    this.increaseTimaAndInterrupt = (reason) => {
        memory.io[TIMA_REG - 0xFF00] = (memory.io[TIMA_REG - 0xFF00] + 1) & 0xFF;

        dumpDebug(memory.io[TIMA_REG - 0xFF00].toString(16) + ' TIMA Increase: ' + reason);
        
        if (memory.io[TIMA_REG - 0xFF00] === 0) {
            dumpDebug('TIMA Overflow');
            this.timaOverflowed = true;
            this.timaReloadClock = 4;
        }
    }

    this.getFrequencyCheckBit = () => {
        const freq = memory.io[TAC_REG - 0xFF00] & 0b11;

        if (freq === 0) { // 00: 4096Hz
            return 9;
        } else if (freq === 1) { // 01: 262144Hz
            return 3;
        } else if (freq === 2) { // 10: 65536Hz
            return 5;
        } else if (freq === 3) { // 11: 16384Hz
            return 7;
        }
    }

    // T-Clock speed 4194304 Hz
    // M-Clock speed 1048576 Hz
    // Timer speed 262144 Hz

    this.reset = () => {
        this.clock = 0
    }

    const dumpDebug = (text) => {
        if (debugOpts.dump) {
            fs.writeFileSync(
            `./dump_${debugOpts.timestamp}`,
            `${text}\n`,
            { flag: 'a+' }
        );
        }
    }

    this.setTima = (value) => {
        if (this.timaOverflowed && this.timaReloadClock === 0) {
            memory.io[TIMA_REG - 0xFF00] = memory.io[TMA_REG - 0xFF00];
        } else if (this.timaOverflowed  && this.timaReloadClock > 0) {
            memory.io[TIMA_REG - 0xFF00] = (value & 0xFF);
            // this.timaOverflowed = false;
        } else {
            memory.io[TIMA_REG - 0xFF00] = (value & 0xFF);
        }
    }

    this.setTma = (value) => {
        memory.io[TMA_REG - 0xFF00] = value & 0xFF;

        if (this.timaOverflowed && this.timaReloadClock === 0) {
            memory.io[TIMA_REG - 0xFF00] = value & 0xFF;
        }
    }

    this.setDiv = (value) => {
        this.resetDiv = true;
        
    }

    this.step = (t) => {
        // We increase the 16-bit internal counter every cycle
        // DIV is just the 8 MSB of the 16-bit internal counter that gets incremented on every cycle
        // And it increases every 256 cycles (After the first 8 bits of the counter have wrapped to 0)
        for (let i = 0; i < t; i++) {
            this.timerEnabled = this.timerIsEnabled();

              // Delay the set of TIMA with TMA for 4 cycles
            if (this.timaOverflowed) {
                this.timaReloadClock--;

                if (this.timaReloadClock <= 0) {
                    memory.io[TIMA_REG - 0xFF00] = memory.io[TMA_REG - 0xFF00] & 0xFF;
                    memory.io[IF_REG - 0xFF00] = memory.io[IF_REG - 0xFF00] | 0b100;
                    this.timaOverflowed = false;
                }
                
            }

            let counter = (memory.io[DIV_REG - 0xFF00] << 8) | memory.io[COUNTER_REG - 0xFF00];
            // We check the frequency bit to see if its gonna overflow
            const frequencyBitState1 = (counter & (1 << this.getFrequencyCheckBit())) === 0 ? 0 : 1;

            counter = (counter + 1) & 0xFFFF;
            memory.io[COUNTER_REG - 0xFF00] = counter & 0xFF;
            memory.io[DIV_REG - 0xFF00] = counter >> 8;

            const frequencyBitState2 = (counter & (1 << this.getFrequencyCheckBit())) === 0 ? 0 : 1;
            
            if (this.timerEnabled) {
                if (frequencyBitState1 === 1 && frequencyBitState2 === 0) { // If the bit overflows we increase TIMA
                    this.increaseTimaAndInterrupt('Overflow');
                } else if (this.lastFrequencyBitState === 1 && frequencyBitState1 === 0) { // If the last operation reset the frequency bit by setting the internal counter to 0
                    this.increaseTimaAndInterrupt('DIV Reset');
                }
            } else if (this.lastTimerEnabledState && this.lastFrequencyBitState === 1) { // If timer was just disabled and frequency bit was 1
                this.increaseTimaAndInterrupt('Disabled timer');
            }

            this.lastFrequencyBitState = frequencyBitState2;
            this.lastTimerEnabledState = this.timerEnabled;
        }

        // if (this.resetDiv) {
        //     memory.io[COUNTER_REG - 0xFF00] = 0;
        // memory.io[DIV_REG - 0xFF00] = 0;
        // this.resetDiv = false;
        // }
        
    }
}

module.exports = Timer;