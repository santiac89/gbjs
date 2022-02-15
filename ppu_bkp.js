function PPU (memory) {
    const VRAM_BASE =  0x8000;
    const OAM_BASE = 0xFE00;

    const STAT_REG = 0xFF41;
    const LCDC_REG = 0xFF40;
    const LY_REG = 0xFF44;
    const LYC_REG = 0xFF45;
    const IF_REG = 0xFF0F;
    const SCROLLY_REG = 0xFF42;
    const SCROLLX_REG = 0xFF43;
    const WINDOWY_REG = 0xFF4A;
    const WINDOWX_REG = 0xFF4B;
    const BACKGROUND_PALETTE_REG = 0xFF47
    const TILE_DATA_REG_1 = 0x8000;
    const TILE_DATA_REG_2 = 0x8800;
    const SPRITE_PALETTE_REG_1 = 0xFF48;
    const SPRITE_PALETTE_REG_2 = 0xFF49;
    const OAM_START = 0xFE00;
    const SCREEN_WIDTH = 160;
    const SCREEN_HEIGHT = 144;
    
    this.screenData = [];
    this.clock = 0;
    this.windowLineCounter = 0;

    for (let i = 0; i < SCREEN_HEIGHT; i++) {
        for (let j = 0; j < SCREEN_WIDTH; j++) {
            if (!this.screenData[i]) this.screenData[i] = [];
            this.screenData[i][j] = [0,0,0];
        }
    }

    this.getState = () => {
        return `
            STAT: ${memory.io[STAT_REG - 0xFF00].toString(16)}
            LY: ${memory.io[LY_REG - 0xFF00].toString(16)}
            LCDC: ${memory.io[LCDC_REG - 0xFF00].toString(16)}
            
        `;
    }

    this.isLCDEnabled = () => {
        return (memory.io[LCDC_REG - 0xFF00] & 0b10000000) !== 0; 
        // 7   LCD and PPU enable	0=Off, 1=On
        // 6	Window tile map area	0=9800-9BFF, 1=9C00-9FFF
        // 5	Window enable	0=Off, 1=On
        // 4	BG and Window tile data area	0=8800-97FF, 1=8000-8FFF
        // 3	BG tile map area	0=9800-9BFF, 1=9C00-9FFF
        // 2	OBJ size	0=8x8, 1=8x16
        // 1	OBJ enable	0=Off, 1=On
        // 0	BG and Window enable/priority	0=Off, 1=On
    }

    this.isWindowEnabled = () => {
        return (memory.io[LCDC_REG - 0xFF00] & 0b00100000) !== 0;
    }

    this.canAccessVRAM = () => {
        return (memory.io[STAT_REG - 0xFF00] & 0b00000011) !== 3;
    }

    this.canAccessOAM = () => {
        return (memory.io[STAT_REG - 0xFF00] & 0b00000011) <= 1;
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
        const currentMode = memory.io[STAT_REG - 0xFF00] & 0b11;
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

            if (memory.io[LY_REG - 0xFF00] < 144) {
                // DRAW LINE
                this.renderLine();
            } else if (memory.io[LY_REG - 0xFF00] === 144) {
                // VBLANK INTERRUPT
                memory.io[IF_REG - 0xFF00] |= 0b1;
            }

            memory.io[LY_REG - 0xFF00] = (memory.io[LY_REG - 0xFF00] + 1) & 0xFF;

            if (memory.io[LY_REG - 0xFF00] > 153) {
                memory.io[LY_REG - 0xFF00] = 0;
                this.windowLineCounter = 0;
            }

            if (this.isWindowEnabled()) {
                this.windowLineCounter++;

                if (this.windowLineCounter > 153) {
                    this.windowLineCounter = 0;
                }
            }
        }
    }

    this.renderLine = () => {
        if (memory.getByte(LCDC_REG) & 0b00000001) {
            // console.log(memory.getByte(LY_REG));
            this.renderTiles();
        }

        if (memory.getByte(LCDC_REG) & 0b00000010) {
            // this.renderSprites();
        }
    }

    this.getColor = (colorId, paletteAddress) => {
        const palette = memory.getByte(paletteAddress);
        let hi = 0 ;
        let lo = 0 ;

        // which bits of the colour palette does the colour id map to?
        switch (colorId) {
            case 0: hi = 1 ; lo = 0 ;break ;
            case 1: hi = 3 ; lo = 2 ;break ;
            case 2: hi = 5 ; lo = 4 ;break ;
            case 3: hi = 7 ; lo = 6 ;break ;
        }

        // use the palette to get the colour
        // convert the game colour to emulator colour
        const bit1 = (palette & (1 << hi)) === 0 ? 0 : 1;
        const bit2 = (palette & (1 << lo)) === 0 ? 0 : 1;
        return (bit2 << 1) | bit1;
    }

    // this.renderSprites = () => {
    //     let use8x16 = false;

    //     if (memory.getByte(LCDC_REG) & 0b00000100) {
    //         use8x16 = true;
    //     }

    //     for (let sprite = 0 ; sprite < 40; sprite++) {
    //         let spriteIndex = sprite * 4;
    //         let positionY = memory.getByte(OAM_START + spriteIndex) - 16;
    //         let positionX = memory.getByte(OAM_START + spriteIndex + 1) - 8;
    //         let tileLocation = memory.getByte(OAM_START + spriteIndex + 2);
    //         let attributes = memory.getByte(OAM_START + spriteIndex + 3);

    //         let yFlip = attributes & 0b01000000;
    //         let xFlip = attributes & 0b00100000;

    //         const scanline = memory.getByte(LY_REG);

    //         let ysize = use8x16 ? 16 : 8;

    //         // does this sprite intercept with the scanline, if not, skip to next sprite
    //         if ((scanline < positionY) || (scanline >= (positionY + ysize))) continue;
            
    //         let line = scanline - positionY ;

    //         // read the sprite in backwards in the y axis
    //         if (yFlip) {
    //             line -= ysize ;
    //             line *= -1 ;
    //         }

    //         line *= 2; // same as for tiles
    //         const dataAddress = (0x8000 + (tileLocation * 16)) + line;
    //         const tileData1 = memory.getByte(dataAddress);
    //         const tileData2 = memory.getByte(dataAddress + 1)

    //        // its easier to read in from right to left as pixel 0 is
    //        // bit 7 in the colour data, pixel 1 is bit 6 etc...
    //         for (let tilePixel = 7; tilePixel >= 0; tilePixel--) {
    //             let colorBit = tilePixel ;
             
    //             // read the sprite in backwards for the x axis
    //             if (xFlip) {
    //                 colorBit -= 7 ;
    //                 colorBit *= -1 ;
    //             }

    //             // the rest is the same as for tiles
    //             const bit1 = (tileData1 & (1 << colorBit)) === 0 ? 0 : 1;
    //             const bit2 = (tileData2 & (1 << colorBit)) === 0 ? 0 : 1;
    //             const colorId = (bit2 << 1) | bit1;

    //             const paletteAddress = attributes & 0b10000 ? SPRITE_PALETTE_REG_2 : SPRITE_PALETTE_REG_1;
    //             const color = this.getColor(colorId, paletteAddress);

    //             // white is transparent for sprites.
    //             if (color === 0) continue;

    //             const pixel = positionX - tilePixel + 7;

    //             // sanity check
    //             if ((scanline<0)||(scanline>143)||(pixel<0)||(pixel>159)) {
    //                 continue ;
    //             }

    //             this.screenData[line][pixel] = color;
    //         }
    //     }
    // }

    this.renderTiles = () => {
        // where to draw the visual area and the window
        const scrollX = memory.getByte(SCROLLX_REG);
        const scrollY = memory.getByte(SCROLLY_REG);
        const windowX = memory.getByte(WINDOWX_REG) - 7;
        const windowY = memory.getByte(WINDOWY_REG);
        
        let usingWindow = false ;

        // is the window enabled?
        if (this.isWindowEnabled()) {
            // is the current scanline we're drawing within the windows Y pos?,
            usingWindow = windowY <= memory.getByte(LY_REG);
        }

        // which tile data are we using?
        // IMPORTANT: This memory region TILE_DATA_REG_2 uses signed bytes as tile identifiers
        const tileDataReg = memory.getByte(LCDC_REG) & 0b00010000 ? TILE_DATA_REG_1 : TILE_DATA_REG_2;
        const isSigned = (memory.getByte(LCDC_REG) & 0b00010000) === 0;
        
        let tileMapReg;

        // which background mem?
        if (usingWindow) {
            tileMapReg = memory.getByte(LCDC_REG) & 0b1000000 ? 0x9C00 : 0x9800;
        } else {
            tileMapReg = memory.getByte(LCDC_REG) & 0b00001000 ? 0x9C00 : 0x9800;
        }

        // positionY is used to calculate which of 32 vertical tiles the current scanline is drawing
        let positionY = usingWindow ? this.windowLineCounter - windowY : scrollY + memory.getByte(LY_REG);

        // which of the 8 vertical pixels of the current tile is the scanline on?
        const tileRow = Math.floor(positionY / 8) * 32;

        // time to start drawing the 160 horizontal pixels for this scanline
        for (let pixel = 0 ; pixel < 160; pixel++) {
            let positionX = pixel + scrollX;

            if (usingWindow && pixel >= windowX) {
                positionX = pixel - windowX;
            }

            // which of the 32 horizontal tiles does this xPos fall within?
            const tileColumn = Math.floor(positionX / 8);

            const tileAddress = tileMapReg + (tileColumn + tileRow);
            const tileNum = isSigned ? memory.getByte(tileAddress) << 24 >> 24 : memory.getByte(tileAddress);
            
            // deduce where this tile identifier is in memory.
            const tileLocation = tileDataReg + (isSigned ? ((tileNum + 128) * 16) : (tileNum * 16));

            // find the correct vertical line we're on of the tile to get the tile data from in memory
            const tileLine = (positionY % 8) * 2;
            const tileData1 = memory.getByte(tileLocation + tileLine);
            const tileData2 = memory.getByte(tileLocation + tileLine + 1);
            
            // Pixel 0 in the tile is it 7 of data 1 and data2.
            // Pixel 1 is bit 6 etc..
            const colorBit = ((positionX % 8) - 7) * -1; // Reverse order

            // combine data 2 and data 1 to get the colour id for this pixel in the tile
            const bit1 = (tileData1 & (1 << colorBit)) === 0 ? 0 : 1;
            const bit2 = (tileData2 & (1 << colorBit)) === 0 ? 0 : 1;
            const colorId = (bit2 << 1) | bit1;

            const color = this.getColor(colorId, BACKGROUND_PALETTE_REG);

            // safety check to make sure what im about to set is int the 160x144 bounds
            const line = memory.getByte(LY_REG);

            if ((line<0)||(line>143)||(pixel<0)||(pixel>159)) {
                continue ;
            }

            this.screenData[line][pixel] = color;
        }

    }
}

module.exports = PPU;