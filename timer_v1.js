const fs = require('fs')

const Timer = function(memory) {
    const TIMA_REG = 0xFF05;
    const DIV_REG = 0xFF04;
    const TAC_REG = 0xFF07;
    const TMA_REG = 0xFF06;
    const IF_REG = 0xFF0F;

    this.currentFrequency = 0;
    this.clock = 256;
    this.dividerClock = 64;

    this.getState = () => {
        return `
            TIMA: ${memory.io[TIMA_REG - 0xFF00].toString(16)}
            DIV: ${memory.io[DIV_REG - 0xFF00].toString(16)}
            TMA: ${memory.io[TMA_REG - 0xFF00].toString(16)}
            TAC: ${memory.io[TAC_REG - 0xFF00].toString(16)}
        `;
    }

    this.timerIsEnabled = () => {
       return (memory.getByte(TAC_REG) & 0b100) > 0;
    }

    this.increaseDiv = () => {
        memory.io[DIV_REG - 0xFF00] = (memory.getByte(DIV_REG) + 1) & 0xFF;
    }

    this.increaseTimaAndInterrupt = () => {
        memory.io[TIMA_REG - 0xFF00] = (memory.getByte(TIMA_REG) + 1) & 0xFF;

        if (memory.io[TIMA_REG - 0xFF00] === 0) {
            memory.setByte(IF_REG, memory.getByte(IF_REG) | 0b10);
            this.timaOverflowed = true;
            this.timaReloadClock = 4;
        }
    }

    this.getClockFrequency = () => {
        const freq = memory.getByte(TAC_REG) & 0b11;

        if (freq === 0) { // 00: 4096Hz
            return 256;
        } else if (freq === 1) { // 01: 262144Hz
            return 4;
        } else if (freq === 2) { // 10: 65536Hz
            return 16;
        } else if (freq === 3) { // 11: 16384Hz
            return 64;
        }
    }

    this.checkClockFrequencyChange = () => {
        const lastFrequency = memory.getByte(TAC_REG) & 0b11;

        if (lastFrequency != this.currentFrequency) {
            this.clock += this.getClockFrequency();
            this.currentFrequency = lastFrequency;
        }
    }

    this.divHasBeenReset = () => {
        return memory.getByte(DIV_REG - 1) != 0;
    }

    this.disableDivResetFlag = () => {
        memory.setByte(DIV_REG - 1, 0);
    }

    this.step = (m, time) => {
        if (this.timaOverflowed) {
            this.timaReloadClock -= m;

            if (this.timaReloadClock <= 0) {
                memory.io[TIMA_REG - 0xFF00] = memory.getByte(TMA_REG);
                this.timaOverflowed = false;
            }
        }

        // If DIV has been written then all counters go to 0 since DIV is the 8 MSB of the general internal clock
        if (this.divHasBeenReset()) {
            // Also, if the amount of clock cycles is at least half of the needed to update TIMA, it is increased.
            if (this.timerIsEnabled() && (this.clock <= Math.floor(this.getClockFrequency() / 2))) {
                this.increaseTimaAndInterrupt();
                // fs.writeFileSync(`./dump_${time}`, `CLOCK: ${this.clock} TIMA: ${memory.io[TIMA_REG - 0xFF00]}`, { flag: 'a+'});
            }
            
            this.clock = this.getClockFrequency();
            this.dividerClock = 64;
        }

        this.dividerClock -= m;
        
        // T-Clock speed 4,194,304Hz
        // M-Clock speed 1.048.576Hz
        // Timer speed 262.144 Hz
        // Updates every 16384 Hz 
        if (this.dividerClock <= 0) {
            this.increaseDiv(); 
            this.dividerClock += 64; 
        }

        this.checkClockFrequencyChange();
        
        if (this.timerIsEnabled()) {
            this.clock -= m; 
            if (this.clock <= 0) { 
                this.clock += this.getClockFrequency();
                this.increaseTimaAndInterrupt();
            }
        }

        this.disableDivResetFlag();
    }

    this.clock = this.getClockFrequency();
}

module.exports = Timer;