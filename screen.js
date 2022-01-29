// const logUpdate = require('log-update')

require('native-canvas')
// Provides the current running canvas

function Screen(memory, test) {
    
    // Bit 7 - LCD Display Enable (0=Off, 1=On)
    // Bit 6 - Window Tile Map Display Select (0=9800-9BFF, 1=9C00-9FFF)
    // Bit 5 - Window Display Enable (0=Off, 1=On)
    // Bit 4 - BG & Window Tile Data Select (0=8800-97FF, 1=8000-8FFF)
    // Bit 3 - BG Tile Map Display Select (0=9800-9BFF, 1=9C00-9FFF)
    // Bit 2 - OBJ (Sprite) Size (0=8x8, 1=8x16)
    // Bit 1 - OBJ (Sprite) Display Enable (0=Off, 1=On)
    // Bit 0 - BG Display (for CGB see below) (0=Off, 1=On)
    const LCDC_REG = 0xFF40;


    // ScrollY (0xFF42): The Y Position of the BACKGROUND where to start drawing the viewing area from
    const SCROLLY_REG = 0xFF42;
    // ScrollX (0xFF43): The X Position of the BACKGROUND to start drawing the viewing area from
    const SCROLLX_REG = 0xFF43;
    // WindowY (0xFF4A): The Y Position of the VIEWING AREA to start drawing the window from
    const WINDOWY_REG = 0xFF4A;
    // WindowX (0xFF4B): The X Positions -7 of the VIEWING AREA to start drawing the window from
    const WINDOWX_REG = 0xFF4B;

    const LY_REG = 0xFF44;

    const BACKGROUND_PALETTE_REG = 0xFF47

    const TILE_DATA_REG_1 = 0x8000;
    const TILE_DATA_REG_2 = 0x8800;
    const SPRITE_PALETTE_REG_1 = 0xFF48;
    const SPRITE_PALETTE_REG_2 = 0xFF49;
    const OAM_START = 0xFE00;

    // Sprite Attributes Byte
    // Bit7: Sprite to Background Priority
    // Bit6: Y flip
    // Bit5: X flip
    // Bit4: Palette number
    // Bit3: Not used in standard gameboy
    // Bit2-0: Not used in standard gameboy

    // const canvas = document.querySelector('#screen');
    const SCREEN_WIDTH = 160;
    const SCREEN_HEIGHT = 144;
    
    this.screenData = [];

    for (let i = 0; i < SCREEN_HEIGHT; i++) {
        for (let j = 0; j < SCREEN_WIDTH; j++) {
            if (!this.screenData[i]) {
                this.screenData[i] = [];
            }
                
            this.screenData[i][j] = [0,0,0];
        }
    }

    this.renderLine = () => {
        if (memory.getByte(LCDC_REG) & 0b00000001) {
            this.renderTiles();
        }

        if (memory.getByte(LCDC_REG) & 0b00000010) {
            this.renderSprites();
        }
    }

    this.render = () => {
        canvas.getContext('2d').fillStyle = 'white'
        canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height);
        const pixelWidth = canvas.width / 160;
        const pixelHeight = canvas.height / 144;
        const t = memory.getByte(LY_REG);
        for (let line = 0; line < 144; line++) {
            let nop = 0;
            for (let pixel = 0; pixel < 160; pixel++) {
                canvas.getContext('2d').fillStyle = `rgb(${this.screenData[line][pixel][0]}, ${this.screenData[line][pixel][1]}, ${this.screenData[line][pixel][2]})`;
                canvas.getContext('2d').fillRect(pixel * pixelWidth, line * pixelHeight, pixelWidth, pixelHeight);
            }
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

    this.renderSprites = () => {
        let use8x16 = false;

        if (memory.getByte(LCDC_REG) & 0b00000100) {
            use8x16 = true;
        }

        for (let sprite = 0 ; sprite < 40; sprite++) {
            let spriteIndex = sprite * 4;
            let positionY = memory.getByte(OAM_START + spriteIndex) - 16;
            let positionX = memory.getByte(OAM_START + spriteIndex + 1) - 8;
            let tileLocation = memory.getByte(OAM_START + spriteIndex + 2);
            let attributes = memory.getByte(OAM_START + spriteIndex + 3);

            let yFlip = attributes & 0b01000000;
            let xFlip = attributes & 0b00100000;

            const scanline = memory.getByte(LY_REG);

            let ysize = use8x16 ? 16 : 8;

            // does this sprite intercept with the scanline, if not, skip to next sprite
            if ((scanline < positionY) || (scanline >= (positionY + ysize))) continue;
            
            let line = scanline - positionY ;

            // read the sprite in backwards in the y axis
            if (yFlip) {
                line -= ysize ;
                line *= -1 ;
            }

            line *= 2; // same as for tiles
            const dataAddress = (0x8000 + (tileLocation * 16)) + line;
            const tileData1 = memory.getByte(dataAddress);
            const tileData2 = memory.getByte(dataAddress + 1)

           // its easier to read in from right to left as pixel 0 is
           // bit 7 in the colour data, pixel 1 is bit 6 etc...
            for (let tilePixel = 7; tilePixel >= 0; tilePixel--) {
                let colourBit = tilePixel ;
             
                // read the sprite in backwards for the x axis
                if (xFlip) {
                    colourBit -= 7 ;
                    colourBit *= -1 ;
                }

                // the rest is the same as for tiles
                const bit1 = (tileData1 & (1 << colourBit)) === 0 ? 0 : 1;
                const bit2 = (tileData2 & (1 << colourBit)) === 0 ? 0 : 1;
                const colourNum = (bit2 << 1) | bit1;

                const colourAddress = attributes & 0b10000 ? SPRITE_PALETTE_REG_2 : SPRITE_PALETTE_REG_1;
                const colour = this.getColor(colourNum, colourAddress);

                // white is transparent for sprites.
                if (colour === 0)
                    continue ;

                let red = 0;
                let green = 0;
                let blue = 0;

                switch(colour) {
                    case 0: red =255;green=255;blue=255;break ;
                    case 1:red =0xCC;green=0xCC ;blue=0xCC;break ;
                    case 2:red=0x77;green=0x77;blue=0x77;break ;
                }

                let xPix = 0 - tilePixel ;
                xPix += 7 ;

                let pixel = positionX + xPix ;

                // sanity check
                if ((scanline<0)||(scanline>143)||(pixel<0)||(pixel>159)) {
                    continue ;
                }

                this.screenData[line][pixel][0] = red;
                this.screenData[line][pixel][1] = green;
                this.screenData[line][pixel][2] = blue;
            }
        }
    }

    this.renderTiles = () => {
        // where to draw the visual area and the window
        const scrollY = memory.getByte(SCROLLX_REG) ;
        const scrollX = memory.getByte(SCROLLY_REG) ;
        const windowY = memory.getByte(WINDOWX_REG) ;
        const windowX = memory.getByte(WINDOWY_REG) - 7;

        let usingWindow = false ;

        // is the window enabled?
        if (memory.getByte(LCDC_REG) & 0b00100000) {
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
        let positionY = usingWindow ? memory.getByte(LY_REG) - windowY : scrollY + memory.getByte(LY_REG);

        // which of the 8 vertical pixels of the current tile is the scanline on?
        const tileRow = Math.floor(positionY / 8) * 32;

        // time to start drawing the 160 horizontal pixels for this scanline
        for (let pixel = 0 ; pixel < 160; pixel++) {
            let red = 0, green = 0, blue = 0;

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
            const colourBit = ((positionX % 8) - 7) * -1; // Reverse order

            // combine data 2 and data 1 to get the colour id for this pixel in the tile
            const bit1 = (tileData1 & (1 << colourBit)) === 0 ? 0 : 1;
            const bit2 = (tileData2 & (1 << colourBit)) === 0 ? 0 : 1;
            const colourNum = (bit2 << 1) | bit1;

            const color = this.getColor(colourNum, BACKGROUND_PALETTE_REG);

            switch(color) {
                case 0: red = 255; green = 255 ; blue = 255; break ;
                case 1: red = 0xCC; green = 0xCC ; blue = 0xCC; break ;
                case 2: red = 0x77; green = 0x77 ; blue = 0x77; break ;
            }

            
            // safety check to make sure what im about to set is int the 160x144 bounds
            const line = memory.getByte(LY_REG);

            if ((line<0)||(line>143)||(pixel<0)||(pixel>159)) {
                continue ;
            }

            this.screenData[line][pixel][0] = red;
            this.screenData[line][pixel][1] = green;
            this.screenData[line][pixel][2] = blue;
        }
    }

}

module.exports = Screen;