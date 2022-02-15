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
    
    const H_BLANK_MODE = 0;
    const V_BLANK_MODE = 1;
    const OAM_SEARCH_MODE = 2;
    const PIXEL_TRANSFER_MODE = 3;

    const READ_TILE_ID = 0;
    const READ_TILE_DATA_0 = 1;
    const READ_TILE_DATA_1 = 2;
    const PUSH = 3;
    
    this.clock = 0;
    this.nextPixel = 0;
    this.pixelFifo = [];
    this.fetcherTileIndex = 0;
    this.windowLineCounter = 0;
    this.scrollX = 0;
    this.scrollY = 0;
    this.screenData = [];
    this.scanline = 0;
    this.currentMode = OAM_SEARCH_MODE;
    this.currentFetcherStep = READ_TILE_ID;
    this.fetcherWaitCount = 2;
    this.insideWindowY = false;
    this.windowY = 0;

    for (let i = 0; i < SCREEN_HEIGHT; i++) {
        for (let j = 0; j < SCREEN_WIDTH; j++) {
            if (!this.screenData[i]) this.screenData[i] = [];
            this.screenData[i][j] = 0;
        }
    }

    this.isLCDEnabled = () => {
        return (memory.io[LCDC_REG - 0xFF00] & 0b10000000) !== 0; 
    }

    this.isWindowEnabled = () => {
        return (memory.io[LCDC_REG - 0xFF00] & 0b00100000) !== 0;
    }

    this.isBackgroundEnabled = () => {
        return (memory.getByte(LCDC_REG) & 0b00000001) !== 0;
    }

    this.isSpriteEnabled = () => {
        return (memory.getByte(LCDC_REG) & 0b00000010) !== 0;
    }

    this.canAccessVRAM = () => {
        return (memory.io[STAT_REG - 0xFF00] & 0b00000011) !== 3;
    }

    this.canAccessOAM = () => {
        return (memory.io[STAT_REG - 0xFF00] & 0b00000011) <= 1;
    }

    this.setMode = (mode) => {
        memory.io[STAT_REG - 0xFF00] &= 0b11111100;

        let requestInterrupt = 0;

        if (mode === H_BLANK_MODE) {
            memory.io[STAT_REG - 0xFF00] |= 0b00000001;
            requestInterrupt = memory.io[STAT_REG - 0xFF00] & 0b10000;
        } else if (mode === V_BLANK_MODE) {
            memory.io[STAT_REG - 0xFF00] |= 0b00000001;
            requestInterrupt = memory.io[STAT_REG - 0xFF00] & 0b1000;
        } else if (mode === OAM_SEARCH_MODE) {
            
            memory.io[STAT_REG - 0xFF00] |= 0b00000010;
            requestInterrupt = memory.io[STAT_REG - 0xFF00] & 0b100000;
        } else if (mode === PIXEL_TRANSFER_MODE) {
            memory.io[STAT_REG - 0xFF00] |= 0b00000011;
        }

        if (requestInterrupt) {
            memory.io[IF_REG - 0xFF00] |= 0b10;
        }

        this.currentMode = mode;
    }
    
    this.resetLineCounters = () => {
        memory.io[LY_REG - 0xFF00] = 0;
        this.scanline = 0;
        this.windowLineCounter = 0;
    }

    this.incLineCountersAndInterrupt = () => {
        memory.io[LY_REG - 0xFF00] = (memory.io[LY_REG - 0xFF00] + 1) & 0xFF;
        
        if (this.isWindowEnabled()) {
            this.windowLineCounter++;
            
            if (this.windowLineCounter > 153) {
                this.windowLineCounter = 0;
            }
        }
        
        if (memory.io[LY_REG - 0xFF00] === 144) {
            memory.io[IF_REG - 0xFF00] |= 0b1;
        } else if (memory.io[LY_REG - 0xFF00] > 153) {
            memory.io[LY_REG - 0xFF00] = 0;
            this.windowLineCounter = 0;
        }
        
        if (memory.io[LY_REG - 0xFF00] == memory.io[LYC_REG - 0xFF00]) {
            memory.io[STAT_REG - 0xFF00] |= 0b100;

            if (memory.io[STAT_REG - 0xFF00] & 0b1000000) {
                memory.io[IF_REG - 0xFF00] |= 0b10;
            }
        } else {
            memory.io[STAT_REG - 0xFF00] &= 0b11111011;
        }

        this.scanline = memory.io[LY_REG - 0xFF00];
    }

    this.getTileLinePixels = (tileData0, tileData1, palette) => {
        const result = [];

        for (let o = 0; o < 8; o++) {
            const colorBit = (o - 7) * -1; // Reverse order
            const bit1 = (tileData0 & (1 << colorBit)) === 0 ? 0 : 1;
            const bit2 = (tileData1 & (1 << colorBit)) === 0 ? 0 : 1;
            const colorId = (bit2 << 1) | bit1;
            const color = this.getColor(colorId, BACKGROUND_PALETTE_REG);
            result.push(color);
        }

        return result;
    }

    this.resetFifo = () => {
        this.nextPixel = 0;
        this.fetcherTileIndex = 0;
        this.pixelFifo = [];
        this.currentFetcherStep = READ_TILE_ID;
        this.fetcherWaitCount = 2;
    }

    this.stepFetcher = () => {
        this.fetcherWaitCount--;

        if (this.fetcherWaitCount <= 0) {
            this.fetcherWaitCount = 2;
            
            if (this.currentFetcherStep === READ_TILE_ID) {
                this.scrollX = memory.getByte(SCROLLX_REG);
                this.scrollY = memory.getByte(SCROLLY_REG);
                this.currentTileNumber = this.fetchTileNumber();
                this.currentFetcherStep = READ_TILE_DATA_0;
            } else if (this.currentFetcherStep === READ_TILE_DATA_0) {
                this.tileData0 = this.fetchTileData(this.currentTileNumber, 0);
                this.currentFetcherStep = READ_TILE_DATA_1;
            } else if (this.currentFetcherStep === READ_TILE_DATA_1) {
                this.tileData1 = this.fetchTileData(this.currentTileNumber, 1);
                this.currentFetcherStep = PUSH;
            } else if (this.currentFetcherStep === PUSH && this.pixelFifo.length <= 8) {
                const tileLinePixels = this.getTileLinePixels(this.tileData0, this.tileData1);
                this.pixelFifo = this.pixelFifo.concat(tileLinePixels);
                this.fetcherTileIndex++;
                this.currentFetcherStep = READ_TILE_ID;
            }
        }
    }

    this.step = (t) => {
        if (!this.isLCDEnabled()) {
            this.clock = 0;
            this.resetFifo();
            this.resetLineCounters();
            this.setMode(H_BLANK_MODE);
            return;
        }
        
        if (this.currentMode === OAM_SEARCH_MODE && this.clock === 0) {
            this.windowY = memory.getByte(WINDOWY_REG);
            this.insideWindowY = this.isWindowEnabled() ? (this.windowY <= this.scanline) : false;
            this.windowEnabled = this.isWindowEnabled();
        } 

        for (let i = 0; i < t; i++) { // For every clock tick

            this.clock++;

            if (this.currentMode === PIXEL_TRANSFER_MODE && this.isBackgroundEnabled()) {
                this.stepFetcher();
                
                if (this.pixelFifo.length > 8) {
                    this.screenData[this.scanline][this.nextPixel++] = this.pixelFifo.shift();
                } 
            }
            
            if (this.currentMode === OAM_SEARCH_MODE && this.clock === 80) { // End of OAM Search
                this.setMode(PIXEL_TRANSFER_MODE);
            } else if (this.currentMode === PIXEL_TRANSFER_MODE && this.nextPixel === 160) { // End of Pixel Transfer 
                this.setMode(H_BLANK_MODE);
            } else if (this.currentMode === H_BLANK_MODE && this.clock === 456) { // End of H-Blank 
                this.incLineCountersAndInterrupt();
                this.resetFifo();
    
                if (this.scanline > 143) {
                    this.setMode(V_BLANK_MODE);
                } else {
                    this.clock = 0;
                    this.setMode(OAM_SEARCH_MODE);
                }
            } else if (this.currentMode === V_BLANK_MODE && this.clock <= 4560) {
                if (this.clock % 456 === 0) {
                    this.incLineCountersAndInterrupt();
                    this.resetFifo();
                }
                
                if (this.clock === 4560) {
                    this.clock = 0;
                    this.incLineCountersAndInterrupt();
                    this.resetFifo();
                    this.setMode(OAM_SEARCH_MODE);
                }
            }
        }
    }

    this.getColor = (colorId, paletteAddress) => {
        const palette = memory.getByte(paletteAddress);
        let hi = 0 ;
        let lo = 0 ;

        // Which bits of the palette the color id maps to?
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

    this.fetchTileNumber = () => {
        const windowX = memory.getByte(WINDOWX_REG) - 7;
        const lcdc_flags = memory.getByte(LCDC_REG);
        
        const usingWindow = this.insideWindowY && (this.fetcherTileIndex * 8) >= windowX;
        const isSigned = (lcdc_flags & 0b00010000) === 0;
        
        const positionX = usingWindow ? (this.fetcherTileIndex * 8) - windowX : (this.fetcherTileIndex * 8) + this.scrollX;
        const positionY = usingWindow ? this.windowLineCounter - this.windowY : this.scanline + this.scrollY;

        let tileMapReg;

        if (usingWindow) {
            tileMapReg = lcdc_flags & 0b1000000 ? 0x9C00 : 0x9800;
        } else {
            tileMapReg = lcdc_flags & 0b00001000 ? 0x9C00 : 0x9800;
        }

        const tileRow = Math.floor(positionY / 8) * 32;
        const tileColumn = Math.floor(positionX / 8);

        const tileAddress = tileMapReg + (tileColumn + tileRow);
        const tileNum = isSigned ? memory.vram[tileAddress - 0x8000] << 24 >> 24 : memory.vram[tileAddress - 0x8000];
        return isSigned ? (tileNum + 128) : tileNum;
    }

    this.fetchTileData = (tileNumber, byte) => {
        const lcdc_flags = memory.getByte(LCDC_REG);
        const windowX = memory.getByte(WINDOWX_REG) - 7;

        const tileDataReg = lcdc_flags & 0b00010000 ? TILE_DATA_REG_1 : TILE_DATA_REG_2;
        const tileDataAddress = tileDataReg + tileNumber * 16;
        const usingWindow = this.insideWindowY && (this.fetcherTileIndex * 8) >= windowX;
        const positionY = usingWindow ? this.windowLineCounter - this.windowY : this.scanline + this.scrollY;
        const tileLine = (positionY % 8) * 2;
        return memory.vram[tileDataAddress + tileLine + byte - tileDataReg];
    }
}

module.exports = PPU;