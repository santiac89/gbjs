const fs = require('fs')

const Timer = function(memory, time) {
    const TIMA_REG = 0xFF05;
    const DIV_REG = 0xFF04;
    const COUNTER_REG = 0xFF03;
    const TAC_REG = 0xFF07;
    const TMA_REG = 0xFF06;
    const IF_REG = 0xFF0F;

    this.currentFrequency = 0;
    this.clock = 0;
    this.dividerClock = 64;
    this.divReset = false;

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

    this.increaseTimaAndInterrupt = (reason) => {
        memory.io[TIMA_REG - 0xFF00] = (memory.getByte(TIMA_REG) + 1) & 0xFF;
        fs.writeFileSync(`./dump_${time}`, `${reason} TIMA++ = ${memory.io[TIMA_REG - 0xFF00].toString(16)}\n`, { flag: 'a+' });

        if (memory.io[TIMA_REG - 0xFF00] === 0) {
            this.timaOverflowed = true;
            this.timaReloadClock = 4;
        }
    }

    this.getFrequencyCheckBit = () => {
        const freq = memory.getByte(TAC_REG) & 0b11;

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


    this.checkClockFrequencyChange = () => {
        const lastFrequency = memory.getByte(TAC_REG) & 0b11;

        if (lastFrequency != this.currentFrequency) {
            memory.io[COUNTER_REG - 0xFF00] = 0;
            memory.io[DIV_REG - 0xFF00] = 0;
            this.currentFrequency = lastFrequency;
        }
    }

    // T-Clock speed 4194304 Hz
    // M-Clock speed 1048576 Hz
    // Timer speed 262144 Hz

    this.reset = () => {
        this.clock = 0
    }

    this.setTima = (value) => {
        if (this.timaOverflowed && this.timaReloadClock > 0) {
            fs.writeFileSync(`./dump_${time}`, `TIMA = TMA (${memory.getByte(TMA_REG).toString(16)})\n`, { flag: 'a+' })
            memory.io[TIMA_REG - 0xFF00] = memory.getByte(TMA_REG);
        } else {
            fs.writeFileSync(`./dump_${time}`, `TIMA = ${value.toString(16)}\n`, { flag: 'a+' })
            memory.io[TIMA_REG - 0xFF00] = (value & 0xFF);
        }
    }

    this.setTma = (value) => {
        memory.io[TMA_REG - 0xFF00] = value & 0xFF;

        if (this.timaOverflowed && this.timaReloadClock === 0) {
            memory.io[TIMA_REG - 0xFF00] = value & 0xFF;
        }
    }

    this.setDivReset = () => {
        this.divReset = true;
    }

    this.step = (t = 1) => {
        // this.clock += t;
        
        this.timerEnabled = this.timerIsEnabled();

        // We increase the 16-bit internal counter every cycle
        // DIV is just the 8 MSB of the 16-bit internal counter that gets incremented on every cycle
        // And it increases every 256 cycles (After the first 8 bits of the counter have wrapped to 0)
        for (let i = 0; i < t; i++) {

            // Delay the set of TIMA with TMA for 4 cycles
            if (this.timaOverflowed) {
                this.timaReloadClock--;

                if (this.timaReloadClock <= 0) {
                    memory.io[TIMA_REG - 0xFF00] = memory.getByte(TMA_REG) & 0xFF;
                    memory.setByte(IF_REG, memory.getByte(IF_REG) | 0b10);
                    this.timaOverflowed = false;
                }
            }

            // We check the frequency bit to see if it overflows
            const frequencyBitState1 = (memory.getWord(COUNTER_REG) & (1 << this.getFrequencyCheckBit())) === 0 ? 0 : 1;

            if (this.divReset) { // Skip if last operation reseted div
                this.divReset = false;
            } else {
                const counter = (memory.getWord(COUNTER_REG) + 1) & 0xFFFF;
                memory.io[COUNTER_REG - 0xFF00] = counter & 0xFF;
                memory.io[DIV_REG - 0xFF00] = counter >> 8;
            }

            const frequencyBitState2 = (memory.getWord(COUNTER_REG) & (1 << this.getFrequencyCheckBit())) === 0 ? 0 : 1;
            
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
    }
}

module.exports = Timer;