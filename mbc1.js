function MBC1(romData) {
    this.romBankNumber = 0;
    this.ramBankNumber = 0;
    this.mode = 0;
    this.externalRamEnabled = false;
    this.ramBanks = romData[0x148];

    this.setByte = (address, value) => {
        if (address >= 0x0000 && address < 0x2000) { // Enable external RAM
            this.externalRamEnabled = (value & 0xF) === 0xA;
        } else if (address >= 0x2000 && address < 0x4000) { // Switch ROM bank
            this.romBankNumber = value & 0x1F;
        } else if (address >= 0x4000 && address < 0x6000) { // Switch RAM bank
            this.ramBankNumber = value & 0x3;
        } else if (address >= 0x6000 && address < 0x8000) { // Change mode
            this.mode = value & 0x1;
        }
    }

    this.readByte = (address) => {
        if (address >= 0x0000 && address < 0x4000) { 
            return romData[address];
        } else if (address >= 0x4000 && address < 0x8000) {
            // 4000-7FFF 16KB ROM Bank 01..NN (in cartridge, switchable bank number)
            return romData[address - 0x4000 + (this.romBankNumber * 0x4000)]
        } else if (address >= 0xA000 && address < 0xC000) { // Read from RAM bank
            // A000-BFFF 8KB External RAM (in cartridge, switchable bank, if any)
            return romData[address - 0xA000 + (this.ramBankNumber * 0x2000)]
        }
    }

    this.getRAMBankNumber = () => {
        return this.ramBankNumber;
    }

}

module.exports = MBC1;