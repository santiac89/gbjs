function ROM(romData) {
    this.ramBanks = romData[0x148];

    this.getRAMBankNumber = () => {
        return 0;
    }
    
    this.setByte = (address, value) => {
        romData[address] = value & 0xFF;
    }

    this.readByte = (address) => {
        return romData[address] ;
    }
}

module.exports = ROM;