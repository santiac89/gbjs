const ROM = require("./rom");
const MBC1 = require("./mbc1");
const fs = require('fs')
// GB BIOS
const BOOT_ROM = [
    0x31, 0xFE, 0xFF, 0xAF, 0x21, 0xFF, 0x9F, 0x32, 0xCB, 0x7C, 0x20, 0xFB, 0x21, 0x26, 0xFF, 0x0E,
    0x11, 0x3E, 0x80, 0x32, 0xE2, 0x0C, 0x3E, 0xF3, 0xE2, 0x32, 0x3E, 0x77, 0x77, 0x3E, 0xFC, 0xE0,
    0x47, 0x11, 0x04, 0x01, 0x21, 0x10, 0x80, 0x1A, 0xCD, 0x95, 0x00, 0xCD, 0x96, 0x00, 0x13, 0x7B,
    0xFE, 0x34, 0x20, 0xF3, 0x11, 0xD8, 0x00, 0x06, 0x08, 0x1A, 0x13, 0x22, 0x23, 0x05, 0x20, 0xF9,
    0x3E, 0x19, 0xEA, 0x10, 0x99, 0x21, 0x2F, 0x99, 0x0E, 0x0C, 0x3D, 0x28, 0x08, 0x32, 0x0D, 0x20,
    0xF9, 0x2E, 0x0F, 0x18, 0xF3, 0x67, 0x3E, 0x64, 0x57, 0xE0, 0x42, 0x3E, 0x91, 0xE0, 0x40, 0x04,
    0x1E, 0x02, 0x0E, 0x0C, 0xF0, 0x44, 0xFE, 0x90, 0x20, 0xFA, 0x0D, 0x20, 0xF7, 0x1D, 0x20, 0xF2,
    0x0E, 0x13, 0x24, 0x7C, 0x1E, 0x83, 0xFE, 0x62, 0x28, 0x06, 0x1E, 0xC1, 0xFE, 0x64, 0x20, 0x06,
    0x7B, 0xE2, 0x0C, 0x3E, 0x87, 0xF2, 0xF0, 0x42, 0x90, 0xE0, 0x42, 0x15, 0x20, 0xD2, 0x05, 0x20,
    0x4F, 0x16, 0x20, 0x18, 0xCB, 0x4F, 0x06, 0x04, 0xC5, 0xCB, 0x11, 0x17, 0xC1, 0xCB, 0x11, 0x17,
    0x05, 0x20, 0xF5, 0x22, 0x23, 0x22, 0x23, 0xC9, 0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B,
    0x03, 0x73, 0x00, 0x83, 0x00, 0x0C, 0x00, 0x0D, 0x00, 0x08, 0x11, 0x1F, 0x88, 0x89, 0x00, 0x0E,
    0xDC, 0xCC, 0x6E, 0xE6, 0xDD, 0xDD, 0xD9, 0x99, 0xBB, 0xBB, 0x67, 0x63, 0x6E, 0x0E, 0xEC, 0xCC,
    0xDD, 0xDC, 0x99, 0x9F, 0xBB, 0xB9, 0x33, 0x3E, 0x3c, 0x42, 0xB9, 0xA5, 0xB9, 0xA5, 0x42, 0x4C,
    0x21, 0x04, 0x01, 0x11, 0xA8, 0x00, 0x1A, 0x13, 0xBE, 0x20, 0xFE, 0x23, 0x7D, 0xFE, 0x34, 0x20,
    0xF5, 0x06, 0x19, 0x78, 0x86, 0x23, 0x05, 0x20, 0xFB, 0x86, 0x20, 0xFE, 0x3E, 0x01, 0xE0, 0x50
  ];


function Memory (debugOpts) {
    // this.lastDmaValueWritten = 0;
    this.dmaCycles = null;
    this.bootRomPresent = true;
    this.cartridgeMemory = [];
    this.timestamp = debugOpts.timestamp;
    this.bankControllers = {
        0: ROM,
        1: MBC1,
        2: MBC1,
        3: MBC1,
    }

    this.bankController = this.bankControllers[0];
    this.bootRoom = [...BOOT_ROM];
    
    // 0000	3FFF	16 KiB ROM bank 00	From cartridge, usually a fixed bank
    // 4000	7FFF	16 KiB ROM Bank 01~NN	From cartridge, switchable bank via mapper (if any)
    // this.bankN = Array(0X7FFF - 0x4000).fill(0);
    
    // 8000	9FFF	8 KiB Video RAM (VRAM)	In CGB mode, switchable bank 0/1
    this.vram = Array(0X9FFF - 0x8000).fill(0);

    // A000	BFFF	8 KiB External RAM	From cartridge, switchable bank if any
    this.eram = [
        Array(0XBFFF - 0xA000).fill(0),
        Array(0XBFFF - 0xA000).fill(0),
        Array(0XBFFF - 0xA000).fill(0),
        Array(0XBFFF - 0xA000).fill(0),
    ];

    // C000	CFFF	4 KiB Work RAM (WRAM)	
    this.wram = Array(0xCFFF - 0xC000).fill(0);
    
    // D000	DFFF	4 KiB Work RAM (WRAM)	In CGB mode, switchable bank 1~7
    this.wramN = Array(0XDFFF - 0xD000).fill(0);

    // E000	FDFF	Mirror of C000~DDFF (ECHO RAM)	Nintendo says use of this area is prohibited.
    this.echo = Array(0XFDFF - 0xE000).fill(0);

    // FE00	FE9F	Sprite attribute table (OAM)	
    this.oam = Array(0XFE9F - 0xFE00).fill(0);

    // FEA0	FEFF	Not Usable	Nintendo says use of this area is prohibited
    this.not_usable = Array(0XFEFF - 0xFEA0).fill(0);

    // FF00	FF7F	I/O Registers	
    this.io = Array(0xFF7F - 0xFF00).fill(0);

    // FF80	FFFE	High RAM (HRAM)	
    this.hram = Array(0xFFFE - 0xFF80).fill(0);

    // FFFF	FFFF	Interrupt Enable register (IE)
    this.ie = [0x00];

    const dumpDebug = (text) => {
        fs.writeFileSync(
            `./dump_${this.timestamp}`,
            `${text}\n`,
            { flag: 'a+' }
        );
    }

    this.setCpu = function (cpu) {
        this.cpu = cpu;
    }

    this.setTimer = (timer) => {
        this.timer = timer;
    }

    this.setPpu = (ppu) => {
        this.ppu = ppu;
    }

    this.getMemoryRegion = (address) => {
        if (0x0000 <= address && address <= 0x3FFF) {
            return { name: "bank0", base: 0x0000, size: 0x4000 };
        } else if (0x4000 <= address && address <= 0x7FFF) {
            return { name: "bankN", base: 0x4000 , size: 0x4000 };
        } else if (0x8000 <= address && address <= 0x9FFF) {
            return {name : "vram", base: 0x8000 , size: 0x2000 };
        } else if (0xA000 <= address && address <= 0xBFFF) {
            return { name: "eram", base: 0xA000, size: 0x2000 };
        } else if (0xC000 <= address && address <= 0xCFFF) {
            return { name: "wram", base: 0xC000, size: 0x2000 };
        } else if (0xD000 <= address && address <= 0xDFFF) {
            return { name: "wramN", base: 0xD000, size: 0x2000 };
        } else if (0xE000 <= address && address <= 0xFDFF) {
            return { name: "echo", base: 0xE000, size: 0x2000 };
        } else if (0xFE00 <= address && address <= 0xFE9F) {
            return { name: "oam", base: 0xFE00, size: 0xA0 };
        } else if (0xFEA0 <= address && address <= 0xFEFF) {
            return { name: "not_usable", base: 0xFEA0, size: 0x60 };
        } else if (0xFF00 <= address && address <= 0xFF7F) {
            return { name: "io", base: 0xFF00, size: 0x80 };
        } else if (0xFF80 <= address && address <= 0xFFFE) {
            return { name: "hram", base: 0xFF80, size: 0x7E };
        } else if (0xFFFF <= address && address <= 0xFFFF) {
            return { name: "ie", base: 0xFFFF, size: 0x1 };
        }

        throw new Error(`Invalid memory region 0x${address.toString(16)}`);
    };

    this.translate = (address) => {
        if (0x0000 <= address && address <= 0x3FFF) {
            return { name: "bank0", base: 0x0000, size: 0x4000 };
        } else if (0x4000 <= address && address <= 0x7FFF) {
            return { name: "bankN", base: 0x4000 , size: 0x4000 };
        } else if (0x8000 <= address && address <= 0x9FFF) {
            return {name : "vram", base: 0x8000 , size: 0x2000 };
        } else if (0xA000 <= address && address <= 0xBFFF) {
            return { name: "eram", base: 0xA000, size: 0x2000 };
        } else if (0xC000 <= address && address <= 0xCFFF) {
            return { name: "wram", base: 0xC000, size: 0x2000 };
        } else if (0xD000 <= address && address <= 0xDFFF) {
            return { name: "wramN", base: 0xD000, size: 0x2000 };
        } else if (0xE000 <= address && address <= 0xFDFF) {
            return { name: "echo", base: 0xE000, size: 0x2000 };
        } else if (0xFE00 <= address && address <= 0xFE9F) {
            return { name: "oam", base: 0xFE00, size: 0xA0 };
        } else if (0xFEA0 <= address && address <= 0xFEFF) {
            return { name: "not_usable", base: 0xFEA0, size: 0x60 };
        } else if (0xFF00 <= address && address <= 0xFF7F) {
            return { name: "io", base: 0xFF00, size: 0x80 };
        } else if (0xFF80 <= address && address <= 0xFFFE) {
            return { name: "hram", base: 0xFF80, size: 0x7E };
        } else if (0xFFFF <= address && address <= 0xFFFF) {
            return { name: "ie", base: 0xFFFF, size: 0x1 };
        }

        throw new Error(`Invalid memory region 0x${address.toString(16)}`);
    };

    this.startDmaTransfer = (address) => {
        this.dmaCycles = 160; // M-Cycles
        this.dmaDelay = 2; // M-Cycles
        // this.dmaRunning = true;
        this.sourceDmaAddress = address;
    }

    this.step = (t) => {
        
        for (let i = 0; i < (t / 4); i++) {
            if (this.dmaDelay > 0) {
                this.dmaDelay--;

                if (this.dmaDelay === 0) {
                    this.dmaRunning = true;
                }

                continue;
            }
            
            if (!this.dmaRunning) return;
            
            const byte = (160 - this.dmaCycles);
            const region = this.getMemoryRegion(this.sourceDmaAddress + byte);
            this.currentDmaAddress = this.sourceDmaAddress + byte;
            
            if (region.name === "bankN" || region.name === "bank0") {
                this.oam[byte] = this.bankController.readByte(this.sourceDmaAddress + byte);
            } else {
                this.oam[byte] = this[region.name][(this.sourceDmaAddress + byte) - region.base];
            }
                
            this.dmaCycles--;

            if (this.dmaCycles <= 0) {
                this.dmaRunning = false;
                break;
            }
        }
    }

    this.getByte = (address, fetch = false) => {
        const region = this.getMemoryRegion(address);

        // Should not consider the first 2 DMA cycles
        if (this.dmaRunning && region.name === 'oam') { // This should be better
            return 0xFF;
        }

        if (address >= 0x0000 && address <= 0x7FFF) { // Read from ROM bank
            if (this.bootRomPresent && address < 0x0100) {
                return this.bootRoom[address];
            } else {
                return this.bankController.readByte(address);
            }
        } else if (address >= 0xA000 && address < 0xC000) {
            const ramBank = this.bankController.getRAMBankNumber();
            return this.eram[ramBank][address - region.base];
        } else if (address >= 0x8000 && address < 0xA000) {
            if (!this.ppu.canAccessVRAM()) return 0xFF;
        } else if (address >= 0xFE00 && address < 0xFEA0) {
            if (!this.ppu.canAccessOAM()) return 0xFF;
        }

        return this[region.name][address - region.base] 
            ? this[region.name][address - region.base] :
            0;
    };


    // 0000-1FFF	Enable external RAM	4 bits wide; value of 0x0A enables RAM, any other value disables
    // 2000-3FFF	ROM bank (low 5 bits)	Switch between banks 1-31 (value 0 is seen as 1)
    // 4000-5FFF	ROM bank (high 2 bits) RAM bank	
                                        // ROM mode: switch ROM bank "set" {1-31}-{97-127}
                                        // RAM mode: switch RAM bank 0-3
    // 6000-7FFF	Mode	   0: ROM mode (no RAM banks, up to 2MB ROM)
                            // 1: RAM mode (4 RAM banks, up to 512kB ROM)


    this.setByte = (address, value) => {
        const region = this.getMemoryRegion(address);
        
        if (this.dmaRunning && region !== "hram" && address !== 0xFF46) {
            return;
        }

        if (address >= 0x0000 && address < 0x8000) {
            this.bankController.setByte(address, value);
            return;
        } else if (address >= 0x8000 && address < 0xA000) {
            if (!this.ppu.canAccessVRAM()) return;
        } else if (address >= 0xA000 && address < 0xC000) {
            const ramBank = this.bankController.getRAMBankNumber();
            this.eram[ramBank][address - region.base] = value & 0xFF;
            return;
        } else if (address >= 0xFE00 && address < 0xFEA0) {
            if (!this.ppu.canAccessOAM()) return;
        } else if (address === 0xFF44) { // LY trap
            this[region.name][address - region.base] = 0;
            return;
        } else if (address === 0xFF04) { // DIV trap
            // this.timer.setDiv();
            this[region.name][address - region.base] = 0;
            this[region.name][address - region.base - 1] = 0;
            return;
        } else if (address === 0xFF46) { // DMA Transfer
            const dmaAddress = value << 8 ; // source address is data * 100
            this[region.name][address - region.base] = value & 0xFF;
            this.startDmaTransfer(dmaAddress);
            return;
        } else if (address === 0xFF05) { // TIMA trap
            this.timer.setTima(value);
            return;
        } else if (address === 0xFF06) { // TMA trap
            this.timer.setTma(value);
            return;
        } 

        this[region.name][address - region.base] = value & 0xFF;

        if (region.name === 'echo') {
            this.setByte(address - 0x2000, value & 0xFF);
        }
    };

    this.setWord = (address, value) => {
        this.setByte(address, value & 0xFF);
        this.setByte(address + 1, value >> 8);
    };

    this.getWord = (address) => {
        return this.getByte(address) | (this.getByte(address + 1) << 8);
    };

    this.loadROM = (romBytes) => {
        const cartridgeType = romBytes[0x0147];
        const controller = this.bankControllers[cartridgeType];
        this.bankController = controller ? new controller(romBytes) : new ROM(romBytes);
    }

    this.unloadBios = () => {
        this.bootRomPresent = false;
    }

    // Stack Pointer=$FFFE
    
    this.initialize = () => {
        this.io[0xFF05 - 0xFF00] = 0x00; // ; TIMA
        this.io[0xFF06 - 0xFF00] = 0x00; // ; TMA
        this.io[0xFF07 - 0xFF00] = 0x00; // ; TAC
        this.io[0xFF10 - 0xFF00] = 0x80; // ; NR10
        this.io[0xFF11 - 0xFF00] = 0xBF; // ; NR11
        this.io[0xFF12 - 0xFF00] = 0xF3; // ; NR12
        this.io[0xFF14 - 0xFF00] = 0xBF; // ; NR14
        this.io[0xFF16 - 0xFF00] = 0x3F; // ; NR21
        this.io[0xFF17 - 0xFF00] = 0x00; // ; NR22
        this.io[0xFF19 - 0xFF00] = 0xBF; // ; NR24
        this.io[0xFF1A - 0xFF00] = 0x7F; // ; NR30
        this.io[0xFF1B - 0xFF00] = 0xFF; // ; NR31
        this.io[0xFF1C - 0xFF00] = 0x9F; // ; NR32
        this.io[0xFF1E - 0xFF00] = 0xBF; // ; NR33
        this.io[0xFF20 - 0xFF00] = 0xFF; // ; NR41
        this.io[0xFF21 - 0xFF00] = 0x00; // ; NR42
        this.io[0xFF22 - 0xFF00] = 0x00; // ; NR43
        this.io[0xFF23 - 0xFF00] = 0xBF; // ; NR30
        this.io[0xFF24 - 0xFF00] = 0x77; // ; NR50
        this.io[0xFF25 - 0xFF00] = 0xF3; // ; NR51
        this.io[0xFF26 - 0xFF00] = 0xF1; // ; NR52
        this.io[0xFF40 - 0xFF00] = 0x91; // ; LCDC
        this.io[0xFF42 - 0xFF00] = 0x00; // ; SCY
        this.io[0xFF43 - 0xFF00] = 0x00; // ; SCX
        this.io[0xFF45 - 0xFF00] = 0x00; // ; LYC
        this.io[0xFF47 - 0xFF00] = 0xFC; // ; BGP
        this.io[0xFF48 - 0xFF00] = 0xFF; // ; OBP0
        this.io[0xFF49 - 0xFF00] = 0xFF; // ; OBP1
        this.io[0xFF4A - 0xFF00] = 0x00; // ; WY
        this.io[0xFF4B - 0xFF00] = 0x00; // ; WX
        this.ie[0] = 0x00; // ; IE
    }
}

module.exports = Memory;