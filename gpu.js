function GPU (memory, screen) {
    const VRAM_BASE =  0x8000;
    const OAM_BASE = 0xFE00;

    const STAT_REG = 0xFF41;
    // Bit 6 - LYC=LY STAT Interrupt source         (1=Enable) (Read/Write)
    // Bit 5 - Mode 2 OAM STAT Interrupt source     (1=Enable) (Read/Write)
    // Bit 4 - Mode 1 VBlank STAT Interrupt source  (1=Enable) (Read/Write)
    // Bit 3 - Mode 0 HBlank STAT Interrupt source  (1=Enable) (Read/Write)
    // Bit 2 - LYC=LY Flag                          (0=Different, 1=Equal) (Read Only)
    // Bit 1-0 - Mode Flag                          (Mode 0-3, see below) (Read Only)
    //     0: HBlank
    //     1: VBlank
    //     2: Searching OAM
    //     3: Transferring Data to LCD Controller
        
    const LCDC_REG = 0xFF40;
    const LY_REG = 0xFF44;
    const LYC_REG = 0xFF45;
    const IF_REG = 0xFF0F;

    this.clock = 0;
    this.firstClock = 0;
    this.mode = 2;
    this.line = 0;

    this.getState = () => {
        return `
            STAT: ${memory.io[STAT_REG - 0xFF00].toString(16)}
            LY: ${memory.io[LY_REG - 0xFF00].toString(16)}
            LCDC: ${memory.io[LCDC_REG - 0xFF00].toString(16)}
            
        `;
    }

    this.isLCDEnabled = () => {
        return (memory.getByte(LCDC_REG) & 0b10000000) !== 0; 
        // 7   LCD and PPU enable	0=Off, 1=On
        // 6	Window tile map area	0=9800-9BFF, 1=9C00-9FFF
        // 5	Window enable	0=Off, 1=On
        // 4	BG and Window tile data area	0=8800-97FF, 1=8000-8FFF
        // 3	BG tile map area	0=9800-9BFF, 1=9C00-9FFF
        // 2	OBJ size	0=8x8, 1=8x16
        // 1	OBJ enable	0=Off, 1=On
        // 0	BG and Window enable/priority	0=Off, 1=On
    }

    this.setStatus = () => {
        if (!this.isLCDEnabled()) {
            // set the mode to 1 during lcd disabled and reset scanline
            this.clock = 0;
            memory.io[LY_REG - 0xFF00] = 0;
            memory.io[STAT_REG - 0xFF00] &= 0b11111100;
            memory.io[STAT_REG - 0xFF00] |= 0b00000001;
            return;
        }

        let requestInterrupt = 0;
        const currentMode = memory.getByte(STAT_REG) & 0b11;
        let newMode = 0;

        if (memory.io[LY_REG - 0xFF00] >= 144) {
            newMode = 1;
            memory.io[STAT_REG - 0xFF00] &= 0b11111100;
            memory.io[STAT_REG - 0xFF00] |= 0b00000001;
            memory.io[IF_REG - 0xFF00] |= 0b10;
            requestInterrupt = memory.io[STAT_REG - 0xFF00] & 0b10000;
        } else {
            if (this.clock <= 80) {
                newMode = 2;
                memory.io[STAT_REG - 0xFF00] &= 0b11111100;
                memory.io[STAT_REG - 0xFF00] |= 0b00000010;
                requestInterrupt = memory.io[STAT_REG - 0xFF00] & 0b100000;
            } else if (this.clock <= 252) {
                newMode = 3;
                memory.io[STAT_REG - 0xFF00] &= 0b11111100;
                memory.io[STAT_REG - 0xFF00] |= 0b00000011;
            } else if (this.clock <= 456) {
                newMode = 0;
                memory.io[STAT_REG - 0xFF00] &= 0b11111100;
                memory.io[STAT_REG - 0xFF00] |= 0b00000001;
                requestInterrupt = memory.io[STAT_REG - 0xFF00] & 0b1000;
            }
        }

        if (currentMode != newMode && requestInterrupt) {
            memory.io[IF_REG - 0xFF00] |= 0b10;
        }

        // check the conincidence flag
        if (memory.io[LY_REG - 0xFF00] == memory.io[LYC_REG - 0xFF00]) {
            memory.io[STAT_REG - 0xFF00] |= 0b100;

            if (memory.io[STAT_REG - 0xFF00] & 0b1000000) {
                memory.io[IF_REG - 0xFF00] |= 0b10;
            }
        } else {
            memory.io[STAT_REG - 0xFF00] &= 0b11111011;
        }
    }
    
    this.step = (t) => {
        this.setStatus();

        if (!this.isLCDEnabled()) return;
        
        this.clock += t;
        
        // 456 cycles = 1 scanline
        if (this.clock >= 456) {
        // time to move onto next scanline
            this.clock = 0;

            memory.io[LY_REG - 0xFF00] = (memory.io[LY_REG - 0xFF00] + 1) & 0xFF;
            
            if (memory.io[LY_REG - 0xFF00] < 144) {
                // DRAW LINE
                screen.renderLine();
            } else if (memory.io[LY_REG - 0xFF00] > 153) {
                memory.io[LY_REG - 0xFF00] = 0;
            } else if (memory.io[LY_REG - 0xFF00] === 144) {
                // VBLANK INTERRUPT
                memory.io[IF_REG - 0xFF00] |= 0b1;
            }
        }
    }
}

module.exports = GPU;