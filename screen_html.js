// pixel# = 1 2 3 4 5 6 7 8
// data 2 = 1 0 1 0 1 1 1 0
// data 1 = 0 0 1 1 0 1 0 1

// Pixel 1 colour id: 10
// Pixel 2 colour id: 00
// Pixel 3 colour id: 11
// Pixel 4 colour id: 01
// Pixel 5 colour id: 10
// Pixel 6 colour id: 11
// Pixel 7 colour id: 10
// Pixel 8 colour id: 01


function Screen(memory) {
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

    const canvas = document.querySelector('#screen');
    this.ctx = canvas.getContext('2d');

    const SCREEN_WIDTH = 160;
    const SCREEN_HEIGHT = 144;

    this.screenData = [];

    for (let i = 0; i < SCREEN_WIDTH; i++) {
        for (let j = 0; j < SCREEN_HEIGHT; j++) {
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
            // RenderSprites( ) ;
        }
    }

    this.render = () => {
        // ctx.
        for (let column = 0; column < 160; column++) {
            for (let row = 0; row < 144; row++) {
      
                this.ctx.fillStyle = `rgb(${this.screenData[column][row][0]}, ${this.screenData[column][row][1]}, ${this.screenData[column][row][2]})`;
                this.ctx.fillRect(
                  column,
                  row,
                  1,
                  1
                );
      
                // this.canvasContext.fillStyle = 'black';
                // this.canvasContext.fillText(this.grid[row][column].toString(), column * this.getPixelSize() + 5, row * this.getPixelSize() + 5);
            }
          }
    }

    this.getColor = (colorId) => {
        const palette = memory.getByte(BACKGROUND_PALETTE_REG);
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
        return (palette & (1 << hi)) << 1 | (palette & (1 << lo));
//      case 0: res = WHITE ;break ;
//      case 1: res = LIGHT_GRAY ;break ;
//      case 2: res = DARK_GRAY ;break ;
//      case 3: res = BLACK ;break ;
//    }
    }

    this.renderTiles = () => {
        // where to draw the visual area and the window
        const scrollY = memory.getByte(SCROLLX_REG) ;
        const scrollX = memory.getByte(SCROLLY_REG) ;
        const windowY = memory.getByte(WINDOWX_REG) ;
        const windowX = memory.getByte(WINDOWY_REG) - 7;

        let usingWindow = false ;

        // is the window enabled?
        if (memory.getByte(LCDC_REG) & 0b00010000) {
            // is the current scanline we're drawing within the windows Y pos?,
            usingWindow = windowY <= memory.getByte(LY_REG);
        }

        // which tile data are we using?
        // IMPORTANT: This memory region TILE_DATA_REG_2 uses signed bytes as tile identifiers

        const tileDataReg = memory.getByte(LCDC_REG) & 0b00010000 ? TILE_DATA_REG_1 : TILE_DATA_REG_2;
        const isSigned = memory.getByte(LCDC_REG) & 0b00010000 === 0;
        
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
        const tileRow = ((positionY % 8) & 0xFF) * 32;

        // time to start drawing the 160 horizontal pixels for this scanline
        for (let pixel = 0 ; pixel < 160; pixel++) {
            let positionX = pixel + scrollX;

            if (usingWindow && pixel >= windowX) {
                positionX = pixel - windowX;
            }

            // which of the 32 horizontal tiles does this xPos fall within?
            const tileColumn = (positionX / 8);

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
            const colourBit = ((positionX % 8) - 7) * -1;

            // combine data 2 and data 1 to get the colour id for this pixel in the tile
            const colourNum = ((tileData2 & (1 << colourBit)) << 1) | (tileData1 & (1 << colourBit));

            const color = this.getColor(colourNum);

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

            this.screenData[pixel][line][0] = red;
            this.screenData[pixel][line][1] = green;
            this.screenData[pixel][line][1] = blue;
        }
    }

}