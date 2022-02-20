const fs = require('fs');

function CPU (memory, debugOpts) {
    this.biosLoaded = 1;
    this.A = 0x11;
    this.B = 0x00;
    this.C = 0x13;
    this.D = 0x00;
    this.E = 0xD8;
    this.H = 0x01;
    this.L = 0x4D;
    this.F = 0xB0;
    this.SP = 0xFFFE;
    this.PC = 0x0100;

    this.clock = { t: 0, m: 0 } ;
    this.m = 0;
    this.pendingCycles = 0;
    this.IME = true;
    // this.dmaCycles = null;
    // this.lastDmaValueWritten = 0;
    this.imeChangeOpCounters = [];

    this.timestamp = debugOpts.timestamp || Date.now();
    this.lastPC = 0;
    this.lastOp = 0;
    this.recentPC = 0;
    this.recentOp = 0;

    this.setAdvanceCycles = (advanceCycles) => {
        this.advanceCycles = advanceCycles;
    }
    
    this.get8BitReg = (reg) => {
        if (reg === 0) {
            return this.B;
        } else if (reg === 1) {
            return this.C;
        } else if (reg === 2) {
            return this.D;
        } else if (reg === 3) {
            return this.E;
        } else if (reg === 4) {
            return this.H;
        } else if (reg === 5) {
            return this.L;
        } else if (reg === 6) {
            throw new Error('Cannot get register 6');
        } else if (reg === 7) {
            return this.A;
        } else {
            return null;
        }
    }

    this.set8BitReg = (reg, value) => {
        if (reg === 0) {
            this.B = value & 0xFF;
        } else if (reg === 1) {
            this.C = value & 0xFF;
        } else if (reg === 2) {
            this.D = value & 0xFF;
        } else if (reg === 3) {
            this.E = value & 0xFF;
        } else if (reg === 4) {
            this.H = value & 0xFF;
        } else if (reg === 5) {
            this.L = value & 0xFF;
        } else if (reg === 6) {
            throw new Error('Cannot set register 6');
        } else if (reg === 7) {
            this.A = value & 0xFF;
        } else {
            throw new Error('Invalid register');
        }
    }

    this.set16BitReg = (reg, value) => {
        if (reg === 0) {
            this.B = (value >> 8) & 0xFF;
            this.C = value & 0xFF;
        } else if (reg === 1) {
            this.D = (value >> 8) & 0xFF;
            this.E = value & 0xFF;
        } else if (reg === 2) {
            this.H = (value >> 8) & 0xFF;
            this.L = value & 0xFF;
        } else if (reg === 3) {
            this.SP = value & 0xFFFF;
        } else {
            throw new Error('Invalid register');
        }
    }

    this.get16BitReg = (reg) => {
        if (reg === 0) {
            return (this.B << 8) + this.C;
        } else if (reg === 1) {
            return (this.D << 8) + this.E;
        } else if (reg === 2) {
            return (this.H << 8) + this.L;
        } else if (reg === 3) {
            return this.SP;
        } else {
            throw new Error('Invalid register');
        }
    }

    this.incSP = () => {
        if (this.SP + 1 > 0xFFFF) {
            this.SP = 0;
        } else {
            this.SP++;
        }
    }

    this.decSP = () => {
        if (this.SP - 1 < 0) {
            this.SP = 0xFFFF;
        } else {
            this.SP--;
        }
    }

    this.getByte = (address) => {
        if (this.pendingCycles > 0) this.advanceCycles(this.pendingCycles);
        this.pendingCycles = 4;
        return memory.getByte(address);
    }

    this.setByte = (address, value) => {
        if (this.pendingCycles > 0) this.advanceCycles(this.pendingCycles);
        this.pendingCycles = 4;
        memory.setByte(address, value);
    }

    this.testHasPassed = () => this.B == 3 && this.C == 5 && this.D == 8 && this.E == 13 && this.H == 21 && this.L == 34;

    // 8-bit Load instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0x40 0x41 0x42 0x43 0x44 0x45 0x47
    // 0x50 0x51 0x52 0x53 0x54 0x55 0x57
    // 0x60 0x61 0x62 0x63 0x64 0x65 0x67
    // 0x48 0x49 0x4a 0x4b 0x4c 0x4d 0x4f
    // 0x58 0x59 0x5a 0x5b 0x5c 0x5d 0x5f
    // 0x68 0x69 0x6a 0x6b 0x6c 0x6d 0x6f
    // 0x78 0x79 0x7a 0x7b 0x7c 0x7d 0x7f
    // ld r,r	xx	4	––	r=r
    const ldrr = (op) => {
        this.pendingCycles = 4;
        const r1 = op >> 3 & 0b00000111;
        const r2 = op & 0b00000111;
        
        if (r1 === r2) {
            if (op === 0x40) {
                debugOpts.testCallback(this.testHasPassed());
            }

            return;
        }

        this.set8BitReg(r1, this.get8BitReg(r2));
    }

    // 0x06 0x0E 0x16 0x1E 0x26 0x2E 0x3E
    // ld r,n	xx nn	8	––	r=n
    const ldrn = (op) => {
        this.pendingCycles = 4;
        const r1 = op >> 3 & 0b00000111;
        const nn = this.getByte(this.PC++);
        this.set8BitReg(r1, nn);
    }

    // 0x46 0x4e 0x56 0x5e 0x66 0x6e 0x7e
    // ld r,(HL)	xx	8	––	r=(HL)
    const ldrHL = (op) => {
        this.pendingCycles = 4;
        const r1 = op >> 3 & 0b00000111;
        const value = this.getByte(this.get16BitReg(2));
        this.set8BitReg(r1, value);
    }

    // 0x70 0x71 0x72 0x73 0x74 0x75 0x77
    // ld (HL),r	7x	8	––	(HL)=r
    const ldHLr = (op) => {
        this.pendingCycles = 4;
        const r1 = op & 0b00000111;
        this.setByte(this.get16BitReg(2), this.get8BitReg(r1));
    }

    // 0x36
    // ld (HL),n	36 nn	12	––	(HL)=n
    const ldHLn = (op) => {
        this.pendingCycles = 4; 
        const nn = this.getByte(this.PC++);
        this.setByte(this.get16BitReg(2), nn);
    }

    // 0x0A
    // ld A,(BC)	0A	8	––	A=(BC)
    const ldABC = (op) => {
        this.pendingCycles = 4;
        this.A = this.getByte(this.get16BitReg(0));
    }

    // 0x1A
    // ld A,(DE)	1A	8	––	A=(DE)
    const ldADE = (op) => {
        this.pendingCycles = 4;
        this.A = this.getByte(this.get16BitReg(1));
    }

    // 0xFA
    // ld A,(nn)	FA	16	––	A=(nn)
    const ldAnn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC) | (this.getByte(this.PC + 1) << 8);
        this.A = this.getByte(nn);
        this.PC += 2;
    }

    // 0x02
    // ld (BC),A	02	8	––	(BC)=A
    const ldBCA = (op) => {
        this.pendingCycles = 4;
        this.setByte(this.get16BitReg(0), this.A);
    }

    // 0x12
    // ld (DE),A	12	8	––	(DE)=A
    const ldDEA = (op) => {
        this.pendingCycles = 4;
        this.setByte(this.get16BitReg(1), this.A);
    }

    // 0xEA
    // ld (nn),A	EA	16	––	(nn)=A
    const ldnnA = (op) => {
        this.pendingCycles = 4;
        const n1 = this.getByte(this.PC++);
        const n2 = this.getByte(this.PC++);
        this.setByte((n2 << 8) + n1, this.A);
    }

    // 0xF0
    // ld A,(FF00+n)	F0 nn	12	––	read from io-port n (memory FF00+n)
    const ldhAn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        this.A = this.getByte(0xFF00 + nn);
    }
    // 0xE0
    // ld (FF00+n),A	E0 nn	12	––	write to io-port n (memory FF00+n)
    const ldhnA = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        this.setByte(0xFF00 + nn, this.A);
    }

    // 0xF2
    // ld A,(FF00+C)	F2	8	––	read from io-port C (memory FF00+C)
    const ldhAC = (op) => {
        this.pendingCycles = 4;
        this.A = this.getByte(0xFF00 + this.C);
    }

    // 0xE2
    // ld (FF00+C),A	E2	8	––	write to io-port C (memory FF00+C)
    const ldhCA = (op) => {
        this.pendingCycles = 4;
        this.setByte(0xFF00 + this.C, this.A);
    }

    // 0x22
    // ldi (HL),A	22	8	––	(HL)=A, HL=HL+1
    const ldiHLA = (op) => {
        this.pendingCycles = 4;
        const HL = this.get16BitReg(2);
        this.setByte(HL, this.A);
        this.set16BitReg(2, HL + 1);
    }

    // 0x2A
    // ldi A,(HL)	2A	8	––	A=(HL), HL=HL+1
    const ldiAHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.get16BitReg(2);
        this.A = this.getByte(HL);
        this.set16BitReg(2, HL + 1);
    }

    // 0x32
    // ldd (HL),A	32	8	––	(HL)=A, HL=HL-1
    const lddHLA = (op) => {
        this.pendingCycles = 4;
        const HL = this.get16BitReg(2);
        this.setByte(HL, this.A);
        this.set16BitReg(2, HL - 1);
    }

    // 0x3A
    // ldd A,(HL)	3A	8	––	A=(HL), HL=HL-1
    const lddAHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.get16BitReg(2);
        this.A = this.getByte(HL);
        this.set16BitReg(2, HL - 1);
    }

    // 16-bit Load instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0x01 0x11 0x21 0x31
    // ld rr,nn	x1 nn nn	12	––	rr=nn (rr may be BC,DE,HL or SP)
    const ldrrnn = (op) => {
        this.pendingCycles = 4;
        const rr = op >> 4 & 0b0000011;
        const nn = this.getByte(this.PC) | (this.getByte(this.PC + 1) << 8);
        this.set16BitReg(rr, nn);
        this.PC += 2;
    }

    // 0x08
    // ld (nn),SP	08 nn nn	20	––	(nn)=SP
    const ldnnSP = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC) | (this.getByte(this.PC + 1) << 8);
        // memory.setWord(nn, this.SP);
        this.setByte(nn, this.SP & 0xFF);
        this.setByte(nn + 1, this.SP >> 8);
        this.PC += 2;
    }

    // 0xF9
    // ld SP,HL	F9	8	––	SP=HL
    const ldSPHL = (op) => {
        this.SP = this.get16BitReg(2);
        this.pendingCycles += 8;
    }

    // 0xC5 0xD5 0xE5 0xF5
    // push rr	x5	16	––	SP=SP-2 (SP)=rr ; rr may be BC,DE,HL,AF
    const pushrr = (op) => {
        const rr = op >> 4 & 0b0000011;

        this.pendingCycles = 8;

        if (rr === 0b11) { // AF special case
            this.decSP();
            this.setByte(this.SP, this.A);
            this.decSP();
            this.setByte(this.SP, this.F);
        } else {
            const value = this.get16BitReg(rr);
            this.decSP();
            this.setByte(this.SP, value >> 8);
            this.decSP();
            this.setByte(this.SP, value & 0xFF);
        }
    }

    // 0xC1 0xD1 0xE1 0xF1
    // pop rr	x1	12	(AF)	rr=(SP) SP=SP+2 ; rr may be BC,DE,HL,AF
    const poprr = (op) => {
        this.pendingCycles = 4;
        const rr = op >> 4 & 0b00000011;
        
        if (rr === 0b11) { // AF special case
            this.F = this.getByte(this.SP) & 0b11110000;
            this.incSP();
            this.A = this.getByte(this.SP);
            this.incSP();
        } else {
            const value1 = this.getByte(this.SP);
            this.incSP();
            const value2 = this.getByte(this.SP);
            this.incSP();
            this.set16BitReg(rr, (value2 << 8) | value1);
        }
    }

    // 8-bit Arithmetic/Logic instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description


    // 0x80 0x81 0x82 0x83 0x84 0x85 0x87 
    // add A,r	8x	4	z0hc	A=A+r
    const addAr = (op) => {
        const r = op & 0b111;
        const h = ((this.A & 0b1111) + (this.get8BitReg(r) & 0b1111)) & 0b10000;
        const c = (this.A + this.get8BitReg(r)) & 0b100000000;
        
        this.A = (this.A + this.get8BitReg(r)) & 0b11111111;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
        this.pendingCycles = 4;
    }

    // 0xC6
    // add A,n	C6 nn	8	z0hc	A=A+n
    const addAn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        const h = ((this.A & 0b1111) + (nn & 0b1111)) & 0b10000;
        const c = (this.A + nn) & 0b100000000;
        
        this.A = (this.A + nn) & 0b11111111;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x86
    // add A,(HL)	86	8	z0hc	A=A+(HL)
    const addAHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        const h = ((this.A & 0b1111) + (HL & 0b1111)) & 0b10000;
        const c = (this.A + HL) & 0b100000000;
        
        this.A = (this.A + HL) & 0b11111111;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x88 0x89 0x8A 0x8B 0x8C 0x8D 0x8F
    // adc A,r	8x	4	z0hc	A=A+r+cy
    const adcAr = (op) => {
        const r = op & 0b111;
        const cy = this.F & 0b00010000 === 0 ? 0 : 1;
        const h = ((this.A & 0b1111) + (this.get8BitReg(r) & 0b1111) + cy) & 0b10000;
        const c = (this.A + this.get8BitReg(r) + cy) & 0b100000000;

        this.A = (this.A + this.get8BitReg(r) + cy) & 0b11111111;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
        this.pendingCycles = 4;
    }

    // 0xCE
    // adc A,n	CE nn	8	z0hc	A=A+n+cy
    const adcAn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        const cy = this.F & 0b00010000 === 0 ? 0 : 1;
        const h = ((this.A & 0b1111) + (nn & 0b1111) + cy) & 0b10000;
        const c = (this.A + nn + cy) & 0b100000000;

        this.A = (this.A + nn + cy) & 0b11111111;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x8E
    // adc A,(HL)	8E	8	z0hc	A=A+(HL)+cy
    const adcAHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        const cy = this.F & 0b00010000 === 0 ? 0 : 1;
        const h = ((this.A & 0b1111) + (HL & 0b1111) + cy) & 0b10000;
        const c = (this.A + HL + cy) & 0b100000000;

        this.A = (this.A + HL + cy) & 0b11111111;

        this.F = 0b00000000;
        if (A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x90 0x91 0x92 0x93 0x94 0x95 0x97
    // sub r	9x	4	z1hc	A=A-r
    const subr = (op) => {
        const r = op & 0b111;
        const c = this.A < this.get8BitReg(r);
        const h = (this.A & 0b1111) < (this.get8BitReg(r) & 0b1111);

        this.A = (this.A - this.get8BitReg(r)) & 0b11111111;

        this.F = 0b01000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
        this.pendingCycles = 4;
    }

    // 0xD6
    // sub n	D6 nn	8	z1hc	A=A-n
    const subn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        const c = this.A < nn;
        const h = (this.A & 0b1111) < (nn & 0b1111);

        this.A = (this.A - nn) & 0b11111111;

        this.F = 0b01000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x96
    // sub (HL)	96	8	z1hc	A=A-(HL)
    const subHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        const c = this.A < HL;
        const h = (this.A & 0b1111) < (HL & 0b1111);
        
        this.A = (this.A - HL) & 0b11111111;

        this.F = 0b01000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x98 0x99 0x9A 0x9B 0x9C 0x9D 0x9F
    // sbc A,r	9x	4	z1hc	A=A-r-cy
    const sbcAr = (op) => {
        const r = op & 0b111;
        const cy = this.F & 0b00010000 === 0 ? 0 : 1;
        const c = this.A < (this.get8BitReg(r) + cy);
        const h = (this.A & 0b1111) < (this.get8BitReg(r) & 0b1111) + cy;

        this.A = (this.A - this.get8BitReg(r) - cy) & 0b11111111;

        this.F = 0b01000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
        this.pendingCycles = 4;
    }

    // 0xDE
    // sbc A,n	DE nn	8	z1hc	A=A-n-cy
    const sbcAn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        const cy = this.F & 0b00010000 === 0 ? 0 : 1;
        const c = this.A < (nn + cy);
        const h = (this.A & 0b1111) < (nn & 0b1111) + cy;

        this.A = (this.A - nn - cy) & 0b11111111;

        this.F = 0b01000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0x9E
    // sbc A,(HL)	9E	8	z1hc	A=A-(HL)-cy
    const sbcAHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        const cy = this.F & 0b00010000 === 0 ? 0 : 1;
        const c = this.A < (HL + cy);
        const h = (this.A & 0b1111) < (HL & 0b1111) + cy;

        this.A = (this.A - HL - cy) & 0b11111111;

        this.F = 0b01000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        if (c) this.F = this.F | 0b00010000;
    }

    // 0xA0 0xA1 0xA2 0xA3 0xA4 0xA5 0xA7
    // and r	Ax	4	z010	A=A & r
    const andr = (op) => {
        const r = op & 0b111;
        
        this.A = this.A & this.get8BitReg(r);

        this.F = 0b00100000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 4;
    }

    // 0xE6
    // and n	E6 nn	8	z010	A=A & n
    const andn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        this.A = this.A & nn;

        this.F = 0b00100000;
        if (this.A === 0) this.F = this.F | 0b10000000;
    }

    // 0xA6
    // and (HL)	A6	8	z010	A=A & (HL)
    const andHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        this.A = this.A & HL;

        this.F = 0b00100000;
        if (this.A === 0) this.F = this.F | 0b10000000;
    }

    // 0xA8 0xA9 0xAA 0xAB 0xAC 0xAD 0xAF
    // xor r	Ax	4	z000	A=A xor r
    const xorr = (op) => {
        const r = op & 0b111;
        this.A = this.A ^ this.get8BitReg(r);

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 4;
    }

    // 0xEE
    // xor n	EE nn	8	z000	A=A xor n
    const xorn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        this.A = this.A ^ nn;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
    }

    // 0xAE
    // xor (HL)	AE	8	z000	A=A xor (HL)
    const xorHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        this.A = this.A ^ HL;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
    }

    // 0xB0 0xB1 0xB2 0xB3 0xB4 0xB5 0xB7
    // or r	Bx	4	z000	A=A | r
    const orr = (op) => {
        const r = op & 0b111;
        this.A = this.A | this.get8BitReg(r);

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 4;
    }

    // 0xF6
    // or n	F6 nn	8	z000	A=A | n
    const orn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        this.A = this.A | nn;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
    }

    // 0xB6
    // or (HL)	B6	8	z000	A=A | (HL)
    const orHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        this.A = this.A | HL;

        this.F = 0b00000000;
        if (this.A === 0) this.F = this.F | 0b10000000;
    }

    // 0xB8 0xB9 0xBA 0xBB 0xBC 0xBD 0xBF
    // cp r	Bx	4	z1hc	compare A-r
    const cpr = (op) => {
        const r = op & 0b111;
        const c = this.A < this.get8BitReg(r);
        const z = this.A === this.get8BitReg(r);
        const h = (this.A & 0b1111) < (this.get8BitReg(r) & 0b1111);

        this.F = 0b01000000;
        if (z) this.F = this.F | 0b10000000;
        if (c) this.F = this.F | 0b00010000;
        if (h) this.F = this.F | 0b00100000;
        this.pendingCycles = 4;
    }

    // 0xFE
    // cp n	FE nn	8	z1hc	compare A-n
    const cpn = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC++);
        const c = this.A < nn;
        const z = this.A === nn;
        const h = (this.A & 0b1111) < (nn & 0b1111);

        this.F = 0b01000000;
        if (z) this.F = this.F | 0b10000000;
        if (c) this.F = this.F | 0b00010000;
        if (h) this.F = this.F | 0b00100000;
    }

    // 0xBE
    // cp (HL)	BE	8	z1hc	compare A-(HL)
    const cpHL = (op) => {
        this.pendingCycles = 4;
        const HL = this.getByte(this.get16BitReg(2));
        const c = this.A < HL;
        const z = this.A === HL;
        const h = (this.A & 0b1111) < (HL & 0b1111);

        this.F = 0b01000000;
        if (z) this.F = this.F | 0b10000000;
        if (c) this.F = this.F | 0b00010000;
        if (h) this.F = this.F | 0b00100000;
    }

    // 0x04 0x14 0x24 0x0C 0x1C 0x2C 0x3C
    // inc r	xx	4	z0h-	r=r+1
    const incr = (op) => {
        const r = op >> 3 & 0b111;
        const h = ((this.get8BitReg(r) & 0b1111) + 1) & 0b10000;

        this.set8BitReg(r, (this.get8BitReg(r) + 1) & 0b11111111);

        this.F = this.F & 0b00010000;
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        this.pendingCycles = 4;
    }

    // 0x34
    // inc (HL)	34	12	z0h-	(HL)=(HL)+1
    const incHL = (op) => {
        this.pendingCycles = 4;
        let HL = this.getByte(this.get16BitReg(2));
        const h = ((HL & 0b1111) + 1) & 0b10000;

        HL = (HL + 1) & 0b11111111;
        this.setByte(this.get16BitReg(2), HL);

        this.F = this.F & 0b00010000;
        if (HL === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
    }

    // 0x05 0x15 0x25 0x0D 0x1D 0x2D 0x3D
    // dec r	xx	4	z1h-	r=r-1
    const decr = (op) => {
        const r = op >> 3 & 0b111;
        const h = ((this.get8BitReg(r) & 0b1111) - 1) & 0b10000;

        this.set8BitReg(r, (this.get8BitReg(r) - 1) & 0b11111111);

        this.F = this.F & 0b00010000;
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
        this.pendingCycles = 4;
    }

    // 0x35
    // dec (HL)	35	12	z1h-	(HL)=(HL)-1
    const decHL = (op) => {
        this.pendingCycles = 4;
        let HL = this.getByte(this.get16BitReg(2));
        const h = ((HL & 0b1111) - 1) & 0b10000;

        HL = (HL - 1) & 0b11111111;
        this.setByte(this.get16BitReg(2), HL);

        this.F = this.F & 0b00010000;
        this.F = this.F | 0b01000000;

        if (HL === 0) this.F = this.F | 0b10000000;
        if (h) this.F = this.F | 0b00100000;
    }

    // 0x27
    // daa	27	4	z-0c	decimal adjust A
    const daa = (op) => {
        let correction = 0;

        if ((this.F & 0b00100000) || ((this.F & 0b01000000) == 0 && (this.A & 0xf) > 9)) {
            correction += 0x6;
        }

        if ((this.F & 0b00010000) || ((this.F & 0b01000000) == 0 && this.A > 0x99)) {
            correction += 0x60;
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        this.A += (this.F & 0b01000000) != 0 ? -correction : correction;
        this.A &= 0xFF;

        if (this.A === 0) {
            this.F |= 0b10000000;
        } else {
            this.F &= 0b01111111;
        }

        this.F &= 0b11011111;
        this.pendingCycles = 4;
    }

    // 0x2F
    // cpl	2F	4	-11-	A = A xor FF
    const cpl = (op) => {
        this.A = this.A ^ 0b11111111;
        this.F = this.F & 0b10010000;
        this.F = this.F | 0b01100000;
        this.pendingCycles = 4;
    }

    // 16-bit Arithmetic/Logic instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0x09 0x19 0x29 0x39
    // add HL,rr	x9	8	-0hc	HL = HL+rr ; rr may be BC,DE,HL,SP
    const addHLrr = (op) => {
        const rr = this.get16BitReg(op >> 4 & 0b11);
        const HL = this.get16BitReg(2);

        const h = ((HL & 0b1111) + (rr & 0b1111)) & 0b10000;
        const c = (HL + rr) & 0b100000000;

        const result = (HL + rr) & 0b1111111111111111;
        
        this.set16BitReg(2, result);
        
        this.F = this.F & 0b10000000;
        if (c) this.F = this.F | 0b00010000;
        if (h) this.F = this.F | 0b00100000;
        this.pendingCycles = 8;
    }

    // 0x03 0x13 0x23 0x33
    // inc rr	x3	8	––	rr = rr+1 ; rr may be BC,DE,HL,SP
    const incrr = (op) => {
        const rr = this.get16BitReg(op >> 4 & 0b11);
        this.set16BitReg(op >> 4 & 0b11, rr + 1);
        this.pendingCycles = 8;
    }


    // 0x0B 0x1B 0x2B 0x3B
    // dec rr	xB	8	––	rr = rr-1 ; rr may be BC,DE,HL,SP
    const decrr = (op) => {
        const rr = this.get16BitReg(op >> 4 & 0b11);
        this.set16BitReg(op >> 4 & 0b11, rr - 1);
        this.pendingCycles = 8;
    }

    // 0xE8
    // add SP,dd	E8	16	00hc	SP = SP +/- dd ; dd is 8-bit signed number
    const addSPdd = (op) => {
        this.pendingCycles = 4;
        const dd = this.getByte(this.PC++) << 24 >> 24;
        
        const h = ((this.SP & 0b1111) + (dd & 0b1111)) > 0b1111;
        const c = (this.SP + dd) > 0b11111111;

        this.SP = (this.SP + dd) & 0b11111111;

        this.F = 0b00000000;
        if (c) this.F = this.F | 0b00010000;
        if (h) this.F = this.F | 0b00100000;
        this.pendingCycles += 8;
    }

    // 0xF8
    // ld HL,SP+dd	F8	12	00hc	HL = SP +/- dd ; dd is 8-bit signed number
    const ldHLSPdd = (op) => {
        this.pendingCycles = 4;
        const dd = this.getByte(this.PC++) << 24 >> 24;

        const h = ((this.SP & 0b1111) + (dd & 0b1111)) > 0b1111;
        const c = (this.SP + dd) > 0b11111111;
        
        const value = (this.SP + dd) & 0b11111111;
        
        this.set16BitReg(2, value);
        
        this.F = 0b00000000;
        if (c) this.F = this.F | 0b00010000;
        if (h) this.F = this.F | 0b00100000;
        this.pendingCycles += 4;
    }

    // Rotate and Shift instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0x07
    // rlca	07	4	000c	rotate A left
    const rlca = (op) => {
        const c = this.A & 0b10000000 ? 1 : 0;
        this.A = ((this.A << 1) + c) & 0b11111111;
        this.F = 0b00000000;
        if (c) this.F = this.F | 0b00010000;
        this.pendingCycles = 4;
    }

    // 0x17
    // rla	17	4	000c	rotate A left through carry
    const rla = (op) => {
        const c = (this.F & 0b00010000) ? 1 : 0;
        this.F = 0b00000000;

        const out = this.A & 0b10000000;

        if (out) {
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        this.A = ((this.A << 1) + c) & 0b11111111;
        this.pendingCycles = 4;
    }

    // 0x0F
    // rrca	0F	4	000c	rotate A right
    const rrca = (op) => {
        this.F = 0b00000000;
        const c = this.A & 0b00000001 ? 1 : 0;
        if (c) this.F = this.F | 0b00010000;
        this.A = (this.A >> 1) | (c * 0b10000000);
        this.pendingCycles = 4;
    }


    // 0x1F
    // rra	1F	4	000c	rotate A right through carry
    const rra = (op) => {
        const c = (this.F & 0b00010000) ? 1 : 0;
        
        this.F = 0b00000000;

        const out = this.A & 0b00000001;

        if (out) {
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        this.A = (this.A >> 1) | (c * 0b10000000);
        this.pendingCycles = 4;
    }

    // 0xCB01 0xCB02 0xCB03 0xCB04 0xCB05 0xCB07
    // rlc r	CB 0x	8	z00c	rotate left
    const rlcr = (op) => {
        const r = op & 0b00000111;
        const c = this.get8BitReg(r) & 0b10000000 ? 1 : 0;
        this.A = ((this.get8BitReg(r) << 1) + c) & 0b11111111;
        this.F = 0b00000000;
        if (c) this.F = this.F | 0b00010000;
        if (this.A === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB06
    // rlc (HL)	CB 06	16	z00c	rotate left
    const rlcHL = (op) => {
        this.pendingCycles = 4;
        let value = this.getByte(this.get16BitReg(2));
        const c = value & 0b10000000 ? 1 : 0;
        value = ((value << 1) + c) & 0b11111111;
        
        this.setByte(this.get16BitReg(2), value);
        
        this.F = 0b00000000;
        if (c) this.F = this.F | 0b00010000;
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB10 0xCB11 0xCB12 0xCB13 0xCB14 0xCB15 0xCB17
    // rl r	CB 1x	8	z00c	rotate left through carry
    const rlr = (op) => {
        const r = op & 0b00000111;
        const c = (this.F & 0b00010000) ? 1 : 0;
        this.F = 0b00000000;

        const out = this.get8BitReg(r) & 0b10000000;

        if (out) {
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        this.set8BitReg(r, ((this.get8BitReg(r) << 1) + c) & 0b11111111);

        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB16
    // rl (HL)	CB 16	16	z00c	rotate left through carry
    const rlHL = (op) => {
        this.pendingCycles = 4;
        const value = this.getByte(this.get16BitReg(2));
        const c = (this.F & 0b00010000) ? 1 : 0;
        this.F = 0b00000000;

        const out = value & 0b10000000;

        if (out) {
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        value = ((value << 1) + c) & 0b11111111;
        this.setByte(this.get16BitReg(2), value);
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB08 0xCB09 0xCB0A 0xCB0B 0xCB0C 0xCB0D 0xCB0F
    // rrc r	CB 0x	8	z00c	rotate right
    const rrcr = (op) => {
        const r = op & 0b00000111;
        this.F = 0b00000000;
        const c = this.get8BitReg(r) & 0b00000001 ? 1 : 0;
        if (c) this.F = this.F | 0b00010000;
        this.set8BitReg(r, (this.get8BitReg(r) >> 1) | (c * 0b10000000));
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB0E
    // rrc (HL)	CB 0E	16	z00c	rotate right
    const rrcHL = (op) => {
        this.pendingCycles = 4;
        let value = this.getByte(this.get16BitReg(2));
        const c = value & 0b00000001 ? 1 : 0;
        value = (value >> 1) | (c * 0b10000000);
        
        this.setByte(this.get16BitReg(2), value);
        
        this.F = 0b00000000;
        if (c) this.F = this.F | 0b00010000;
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB18 0xCB19 0xCB1A 0xCB1B 0xCB1C 0xCB1D 0xCB1F
    // rr r	CB 1x	8	z00c	rotate right through carry
    const rrr = (op) => {
        const r = op & 0b00000111;
        const c = (this.F & 0b00010000) ? 1 : 0;
        this.F = 0b00000000;

        const out = this.get8BitReg(r) & 0b10000000;

        if (out) {
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        this.set8BitReg(r, (this.get8BitReg(r) >> 1) | (c * 0b10000000));

        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB1E
    // rr (HL)	CB 1E	16	z00c	rotate right through carry
    const rrHL = (op) => {
        this.pendingCycles = 4;
        const value = this.getByte(this.get16BitReg(2));
        const c = (this.F & 0b00010000) ? 1 : 0;
        this.F = 0b00000000;

        const out = value & 0b10000000;

        if (out) {
            this.F = this.F | 0b00010000;
        } else {
            this.F = this.F & 0b11101111;
        }

        value = (value >> 1) | (c * 0b10000000);

        this.setByte(this.get16BitReg(2), value);

        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB20 0xCB21 0xCB22 0xCB23 0xCB24 0xCB25 0xCB27
    // sla r	CB 2x	8	z00c	shift left arithmetic (b0=0)
    const slar = (op) => {
        const r = op & 0b00000111;
        this.F = 0b00000000;
        if (this.get8BitReg(r) & 0b10000000) this.F = this.F | 0b00010000;
        this.set8BitReg(r, (this.get8BitReg(r) << 1) & 0b11111110);
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB26
    // sla (HL)	CB 26	16	z00c	shift left arithmetic (b0=0)
    const slaHL = (op) => {
        this.pendingCycles = 4;
        const value = this.getByte(this.get16BitReg(2));
        this.F = 0b00000000;
        if (value & 0b10000000) this.F = this.F | 0b00010000;
        value = (value << 1) & 0b11111110;
        this.setByte(this.get16BitReg(2), value);
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB30 0xCB31 0xCB32 0xCB33 0xCB34 0xCB35 0xCB37
    // swap r	CB 3x	8	z000	exchange low/hi-nibble
    const swapr = (op) => {
        this.F = 0b00000000;
        const r = op & 0b00000111;
        const value = this.get8BitReg(r);
        const low = value & 0b00001111;
        const high = (value & 0b11110000) >> 4;
        this.set8BitReg(r, (low << 4) | high);
        // this.set8BitReg(r, ((value & 0b11110000) >> 4) | ((value & 0b00001111) << 4));
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB36
    // swap (HL)	CB 36	16	z000	exchange low/hi-nibble
    const swapHL = (op) => {
        this.pendingCycles = 4;
        this.F = 0b00000000;
        let value = this.getByte(this.get16BitReg(2));
        value = ((value & 0b11110000) >> 4) | ((value & 0b00001111) << 4);
        this.setByte(this.get16BitReg(2), value);
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB28 0xCB29 0xCB2A 0xCB2B 0xCB2C 0xCB2D 0xCB2F
    // sra r	CB 2x	8	z00c	shift right arithmetic (b7=b7)
    const srar = (op) => {
        const r = op & 0b00000111;
        this.F = 0b00000000;
        if (this.get8BitReg(r) & 0b00000001) this.F = this.F | 0b00010000;
        this.set8BitReg(r, (this.get8BitReg(r) >> 1) | (this.get8BitReg(r) & 0b10000000));
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB2E
    // sra (HL)	CB 2E	16	z00c	shift right arithmetic (b7=b7)
    const sraHL = (op) => {
        this.pendingCycles = 4;
        const value = this.getByte(this.get16BitReg(2));
        this.F = 0b00000000;
        if (value & 0b00000001) this.F = this.F | 0b00010000;
        value = (value >> 1) | (value & 0b10000000);
        this.setByte(this.get16BitReg(2), value);
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCB38 0xCB39 0xCB3A 0xCB3B 0xCB3C 0xCB3D 0xCB3F
    // srl r	CB 3x	8	z00c	shift right logical (b7=0)
    const srlr = (op) => {
        const r = op & 0b00000111;
        this.F = 0b00000000;
        if (this.get8BitReg(r) & 0b00000001) this.F = this.F | 0b00010000;
        this.set8BitReg(r, this.get8BitReg(r) >> 1);
        if (this.get8BitReg(r) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB3E
    // srl (HL)	CB 3E	16	z00c	shift right logical (b7=0)
    const srlHL = (op) => {
        this.pendingCycles = 4;
        const value = this.getByte(this.get16BitReg(2));
        this.F = 0b00000000;
        if (value & 0b00000001) this.F = this.F | 0b00010000;
        value = value >> 1;
        this.setByte(this.get16BitReg(2), value);
        if (value === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // Single-bit Operation instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0xCB40 0xCB41 0xCB42 0xCB43 0xCB44 0xCB45 0xCB47
    // 0xCB48 0xCB49 0xCB4A 0xCB4B 0xCB4C 0xCB4D 0xCB4F
    // 0xCB50 0xCB51 0xCB52 0xCB53 0xCB54 0xCB55 0xCB57
    // 0xCB58 0xCB59 0xCB5A 0xCB5B 0xCB5C 0xCB5D 0xCB5F
    // 0xCB60 0xCB61 0xCB62 0xCB63 0xCB64 0xCB65 0xCB67
    // 0xCB68 0xCB69 0xCB6A 0xCB6B 0xCB6C 0xCB6D 0xCB6F
    // 0xCB70 0xCB71 0xCB72 0xCB73 0xCB74 0xCB75 0xCB77
    // 0xCB78 0xCB79 0xCB7A 0xCB7B 0xCB7C 0xCB7D 0xCB7F
    // bit n,r	CB xx	8	z01-	test bit n
    const bitr = (op) => {
        const n = (op >> 3) & 0b00000111;
        const r = op & 0b00000111;
        this.F = this.F & 0b00010000;
        this.F = this.F | 0b00100000;

        if ((this.get8BitReg(r) & (1 << n)) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles = 8;
    }

    // 0xCB46 0xCB4E 0xCB56 0xCB5E 0xCB66 0xCB6E 0xCB76 0xCB7E
    // bit n,(HL)	CB xx	12	z01-	test bit n
    const bitnHL = (op) => {
        this.pendingCycles = 4;
        const n = (op >> 3) & 0b00000111;
        const value = this.getByte(this.get16BitReg(2));
        this.F = this.F & 0b00010000;
        this.F = this.F | 0b00100000;

        if ((value & (1 << n)) === 0) this.F = this.F | 0b10000000;
        this.pendingCycles += 4;
    }

    // 0xCBC0 0xCBC1 0xCBC2 0xCBC3 0xCBC4 0xCBC5 0xCBC7
    // 0xCBC8 0xCBC9 0xCBCA 0xCBCB 0xCBCC 0xCBCD 0xCBCF
    // 0xCBD0 0xCBD1 0xCBD2 0xCBD3 0xCBD4 0xCBD5 0xCBD7
    // 0xCBD8 0xCBD9 0xCBDA 0xCBDB 0xCBDC 0xCBDD 0xCBDF
    // 0xCBE0 0xCBE1 0xCBE2 0xCBE3 0xCBE4 0xCBE5 0xCBE7
    // 0xCBE8 0xCBE9 0xCBEA 0xCBEB 0xCBEC 0xCBED 0xCBEF
    // 0xCBF0 0xCBF1 0xCBF2 0xCBF3 0xCBF4 0xCBF5 0xCBF7
    // 0xCBF8 0xCBF9 0xCBFA 0xCBFB 0xCBFC 0xCBFD 0xCBFF
    // set n,r	CB xx	8	––	set bit n
    const setnr = (op) => {
        const n = (op >> 3) & 0b00000111;
        const r = op & 0b00000111;
        this.set8BitReg(r, this.get8BitReg(r) | (1 << n));
        this.pendingCycles = 8;
    }

    // 0xCBC6 0xCBCE 0xCBD6 0xCBDE 0xCBE6 0xCBEE 0xCBF6 0xCBFE
    // set n,(HL)	CB xx	16	––	set bit n
    const setnHL = (op) => {
        this.pendingCycles = 4;
        const n = (op >> 3) & 0b00000111;
        let value = this.getByte(this.get16BitReg(2));
        value = value | (1 << n);
        this.setByte(this.get16BitReg(2), value);
        this.pendingCycles += 4;
    }

    // 0xCB80 0xCB81 0xCB82 0xCB83 0xCB84 0xCB85 0xCB87
    // 0xCB88 0xCB89 0xCB8A 0xCB8B 0xCB8C 0xCB8D 0xCB8F
    // 0xCB90 0xCB91 0xCB92 0xCB93 0xCB94 0xCB95 0xCB97
    // 0xCB98 0xCB99 0xCB9A 0xCB9B 0xCB9C 0xCB9D 0xCB9F
    // 0xCBA0 0xCBA1 0xCBA2 0xCBA3 0xCBA4 0xCBA5 0xCBA7
    // 0xCBA8 0xCBA9 0xCBAA 0xCBAB 0xCBAC 0xCBAD 0xCBAF
    // 0xCBB0 0xCBB1 0xCBB2 0xCBB3 0xCBB4 0xCBB5 0xCBB7
    // 0xCBB8 0xCBB9 0xCBBA 0xCBBB 0xCBBC 0xCBBD 0xCBBF
    // res n,r	CB xx	8	––	reset bit n
    const resnr = (op) => {
        const n = (op >> 3) & 0b00000111;
        const r = op & 0b00000111;
        this.set8BitReg(r, this.get8BitReg(r) & ~(1 << n));
        this.pendingCycles = 8;
    }

    // 0xCB86 0xCB8E 0xCB96 0xCB9E 0xCBA6 0xCBAA 0xCBAE 0xCBB6 0xCBBE
    // res n,(HL)	CB xx	16	––	reset bit n
    const resnHL = (op) => {
        this.pendingCycles = 4;
        const n = (op >> 3) & 0b00000111;
        let value = this.getByte(this.get16BitReg(2));
        value = value & ~(1 << n);
        this.setByte(this.get16BitReg(2), value);
        this.pendingCycles += 4;
    }

    // CPU Control instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0x3F
    // ccf	3F	4	-00c	cy=cy xor 1
    const ccf = (op) => {
        this.F = this.F & 0b10010000;
        this.F = this.F ^ 0b00010001;
        this.pendingCycles = 4;
    }

    // 0x37
    // scf	37	4	-001	cy=1
    const scf = (op) => {
        this.F = this.F & 0b10000000;
        this.F = this.F | 0b00010000;
        this.pendingCycles = 4;
    }

    // 0x00
    // nop	00	4	––	no operation
    const nop = (op) => {
        this.pendingCycles = 4;
    }

    // 0x76
    // halt	76	N*4	––	halt until interrupt occurs (low power)
    const halt = (op) => {
        this.halted = true;
        console.log("HALTED");
        // process.exit(0);
        this.pendingCycles = 4;
    }

    // 0x1000 
    // stop	10 00	?	––	low power standby mode (VERY low power)
    const stop = (op) => {
        console.log("STOPPED");
        // process.exit(0);
        this.halted = true;
    }

    // 0xF3
    // di	F3	4	––	disable interrupts, IME=0
    const di = (op) => {
        // if (this.imeChangeOpCounter === 0) {

        if (
            this.imeChangeOpCounters.length > 0 
            && this.imeChangeOpCounters[this.imeChangeOpCounters.length - 1][0] === 1
            && this.imeChangeOpCounters[this.imeChangeOpCounters.length - 1][1] === true
        ) {
            this.imeChangeOpCounters[this.imeChangeOpCounters.length - 1] = [2, false];
        } else {
            this.imeChangeOpCounters.push([2, false]);
        }
            // this.newIME = false;
        // } 

        // }

        this.pendingCycles = 4;
    }

    // 0xFB
    // ei	FB	4	––	enable interrupts, IME=1
    const ei = (op) => {

        // If this call is a follow to an DI then we shoudl cancel the EI
        if (
            this.imeChangeOpCounters.length > 0 
            && this.imeChangeOpCounters[this.imeChangeOpCounters.length - 1][0] === 1
            && this.imeChangeOpCounters[this.imeChangeOpCounters.length - 1][1] === false
        ) {
            this.imeChangeOpCounters[this.imeChangeOpCounters.length - 1] = [2, true];
        } else {
            this.imeChangeOpCounters.push([2, true]);
        }

        this.pendingCycles = 4;
    }

    // Jump instructions
    // Mnemonic	Encoding	Clock cycles	Flags	Description

    // 0xC3
    // jp nn	C3 nn nn	12	––	jump to nn, this.PC=nn
    const jp = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC) | (this.getByte(this.PC + 1) << 8);
        this.PC = nn;
    }

    // 0xE9
    // jp HL	E9	4	––	jump to HL, this.PC=HL
    const jpHL = (op) => {
        this.PC = this.get16BitReg(2);
        this.pendingCycles = 4;
    }

    // 0xC2 0xD2 0xCA 0xDA
    // jp f,nn	xx nn nn	16/12	––	conditional jump if nz,z,nc,c
    const jpf = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC) | (this.getByte(this.PC + 1) << 8);

        if (op === 0xC2 && (this.F & 0b10000000) === 0) {
            this.PC = nn;
            this.pendingCycles += 4;
        } else if (op === 0xCA && (this.F & 0b10000000) !== 0) {
            this.PC = nn;
            this.pendingCycles += 4;
        } else if (op === 0xD2 && (this.F & 0b00010000) === 0) {
            this.PC = nn;
            this.pendingCycles += 4;
        } else if (op === 0xDA && (this.F & 0b00010000) !== 0) {
            this.PC = nn;
            this.pendingCycles += 4;
        } else {
            this.PC += 2;
        }

        
    }

    // 0x18
    // jr PC+dd	18 dd	12	––	relative jump to nn (PC=PC+8-bit signed)
    const jr = (op) => {
        this.pendingCycles = 4;
        const dd = this.getByte(this.PC++) << 24 >> 24;
        this.PC += dd;
        this.pendingCycles += 4;
    }

    // 0x20 0x28 0x30 0x38
    // jr f,PC+dd	xx dd	12/8	––	conditional relative jump if nz,z,nc,c
    const jrf = (op) => {
        this.pendingCycles = 4;
        const dd = this.getByte(this.PC++) << 24 >> 24;
        
        if (op === 0x20 && (this.F & 0b10000000) === 0) {
            this.PC += dd;
            this.pendingCycles += 4;
        } else if (op === 0x28 && (this.F & 0b10000000) !== 0) {
            this.PC += dd;
            this.pendingCycles += 4;
        } else if (op === 0x30 && (this.F & 0b00010000) === 0) {
            this.PC += dd;
            this.pendingCycles += 4;
        } else if (op === 0x38 && (this.F & 0b00010000) !== 0) {
            this.PC += dd;
            this.pendingCycles += 4;
        }
    }

    // 0xCD
    // call nn	CD nn nn	24	––	call to nn, SP=SP-2, (SP)=this.PC, this.PC=nn
    const call = (op) => {
        this.pendingCycles = 4;
        const nn = this.getByte(this.PC) | (this.getByte(this.PC + 1) << 8);
        const retPC = this.PC + 2;

        this.decSP();
        this.setByte(this.SP, retPC >> 8);
        this.decSP();
        this.setByte(this.SP, retPC & 0xFF);

        this.PC = nn;
        this.pendingCycles += 4;
    }

    // 0xC4 0xCC 0xD4 0xDC
    // call f,nn	xx nn nn	24/12	––	conditional call if nz,z,nc,c
    const callfnn = (op) => {
        this.pendingCycles = 12;
        if (op === 0xC4 && (F & 0b10000000) === 0) {
            call(op);
        } else if (op === 0xCC && (this.F & 0b10000000) !== 0) {
            call(op);
        } else if (op === 0xD4 && (this.F & 0b00010000) === 0) {
            call(op);
        } else if (op === 0xDC && (this.F & 0b00010000) !== 0) {
            call(op);
        } else {
            this.PC += 2;
        }
    }

    // 0xC9
    // ret	C9	16	––	return, this.PC=(SP), SP=SP+2
    const ret = (op) => {
        this.pendingCycles = 4;
        const n1 = this.getByte(this.SP);
        this.incSP();
        const n2 = this.getByte(this.SP);
        this.incSP();
        this.PC = n1 | (n2 << 8);
        this.pendingCycles += 4;
    }

    // 0xC0 0xC8 0xD0 0xD8
    // ret f	xx	20/8	––	conditional return if nz,z,nc,c
    const retf = (op) => {
        this.pendingCycles = 4;
        let shouldRet = false;

        if (op === 0xC0 && (this.F & 0b10000000) === 0) {
            shouldRet = true;
        } else if (op === 0xC8 && (this.F & 0b10000000) !== 0) {
            shouldRet = true;
        } else if (op === 0xD0 && (this.F & 0b00010000) === 0) {
            shouldRet = true;
        } else if (op === 0xD8 && (this.F & 0b00010000) !== 0) {
            shouldRet = true;
        } else {
            this.pendingCycles += 4;
        }

        if (shouldRet) {
            const n1 = this.getByte(this.SP);
            this.incSP();
            const n2 = this.getByte(this.SP);
            this.incSP();
            this.PC = n1 | (n2 << 8);
            this.pendingCycles += 8;
        }
    }

    // 0xD9
    // reti	D9	16	––	return and enable interrupts (IME=1)
    const reti = (op) => {
        ret();
        this.IME = true;
    }

    // 0xC7 0xCF 0xD7 0xDF 0xE7 0xEF 0xF7 0xFF
    // rst n	xx	16	––	
    const rstn = (op) => {
        this.pendingCycles = 8;
        
        this.decSP();
        this.setByte(this.SP, this.PC >> 8);
        this.decSP();
        this.setByte(this.SP, this.PC & 0xFF);

        if (op === 0xC7) {
            this.PC = 0x0000;
        } else if (op === 0xCF) {
            this.PC = 0x0008;
        } else if (op === 0xD7) {
            this.PC = 0x0010;
        } else if (op === 0xDF) {
            this.PC = 0x0018;
        } else if (op === 0xE7) {
            this.PC = 0x0020;
        } else if (op === 0xEF) {
            this.PC = 0x0028;
        } else if (op === 0xF7) {
            this.PC = 0x0030;
        } else if (op === 0xFF) {
            this.PC = 0x0038;
        }
    }

    this.opcodesMap = {
        0x00: nop,
        0x40: ldrr,
        0x41: ldrr,
        0x42: ldrr,
        0x43: ldrr,
        0x44: ldrr,
        0x45: ldrr,
        0x47: ldrr,
        0x50: ldrr,
        0x51: ldrr,
        0x52: ldrr,
        0x53: ldrr,
        0x54: ldrr,
        0x55: ldrr,
        0x57: ldrr,
        0x60: ldrr,
        0x61: ldrr,
        0x62: ldrr,
        0x63: ldrr,
        0x64: ldrr,
        0x65: ldrr,
        0x67: ldrr,
        0x48: ldrr,
        0x49: ldrr,
        0x4a: ldrr,
        0x4b: ldrr,
        0x4c: ldrr,
        0x4d: ldrr,
        0x4f: ldrr,
        0x58: ldrr,
        0x59: ldrr,
        0x5a: ldrr,
        0x5b: ldrr,
        0x5c: ldrr,
        0x5d: ldrr,
        0x5f: ldrr,
        0x68: ldrr,
        0x69: ldrr,
        0x6a: ldrr,
        0x6b: ldrr,
        0x6c: ldrr,
        0x6d: ldrr,
        0x6f: ldrr,
        0x78: ldrr,
        0x79: ldrr,
        0x7a: ldrr,
        0x7b: ldrr,
        0x7c: ldrr,
        0x7d: ldrr,
        0x7f: ldrr,
        0x06: ldrn,
        0x0E: ldrn,
        0x16: ldrn,
        0x1E: ldrn,
        0x26: ldrn,
        0x2E: ldrn,
        0x3E: ldrn,
        0x46: ldrHL,
        0x4e: ldrHL,
        0x56: ldrHL,
        0x5e: ldrHL,
        0x66: ldrHL,
        0x6e: ldrHL,
        0x7e: ldrHL,
        0x70: ldHLr,
        0x71: ldHLr,
        0x72: ldHLr,
        0x73: ldHLr,
        0x74: ldHLr,
        0x75: ldHLr,
        0x77: ldHLr,
        0x36: ldHLn,
        0x0A: ldABC,
        0x1A: ldADE,
        0xFA: ldAnn,
        0x02: ldBCA,
        0x12: ldDEA,
        0xEA: ldnnA,
        0xF0: ldhAn,
        0xE0: ldhnA,
        0xF2: ldhAC,
        0xE2: ldhCA,
        0x22: ldiHLA,
        0x2A: ldiAHL,
        0x32: lddHLA,
        0x3A: lddAHL,
        0x01: ldrrnn,
        0x11: ldrrnn,
        0x21: ldrrnn,
        0x31: ldrrnn,
        0x08: ldnnSP,
        0xF9: ldSPHL,
        0xC5: pushrr,
        0xD5: pushrr,
        0xE5: pushrr,
        0xF5: pushrr,
        0xC1: poprr,
        0xD1: poprr,
        0xE1: poprr,
        0xF1: poprr,
        0x80: addAr,
        0x81: addAr,
        0x82: addAr,
        0x83: addAr,
        0x84: addAr,
        0x85: addAr,
        0x87: addAr, 
        0xC6: addAn,
        0x86: addAHL,
        0x88: adcAr,
        0x89: adcAr,
        0x8A: adcAr,
        0x8B: adcAr,
        0x8C: adcAr,
        0x8D: adcAr,
        0x8F: adcAr,
        0xCE: adcAn,
        0x8E: adcAHL,
        0x90: subr,
        0x91: subr,
        0x92: subr,
        0x93: subr,
        0x94: subr,
        0x95: subr,
        0x97: subr,
        0xD6: subn,
        0x96: subHL,
        0x98: sbcAr,
        0x99: sbcAr,
        0x9A: sbcAr,
        0x9B: sbcAr,
        0x9C: sbcAr,
        0x9D: sbcAr,
        0x9F: sbcAr,
        0xDE: sbcAn,
        0x9E: sbcAHL,
        0xA0: andr,
        0xA1: andr,
        0xA2: andr,
        0xA3: andr,
        0xA4: andr,
        0xA5: andr,
        0xA7: andr,
        0xE6: andn,
        0xA6: andHL,
        0xA8: xorr,
        0xA9: xorr,
        0xAA: xorr,
        0xAB: xorr,
        0xAC: xorr,
        0xAD: xorr,
        0xAF: xorr,
        0xEE: xorn,
        0xAE: xorHL,
        0xB0: orr,
        0xB1: orr,
        0xB2: orr,
        0xB3: orr,
        0xB4: orr,
        0xB5: orr,
        0xB7: orr,
        0xF6: orn,
        0xB6: orHL,
        0xB8: cpr,
        0xB9: cpr,
        0xBA: cpr,
        0xBB: cpr,
        0xBC: cpr,
        0xBD: cpr,
        0xBF: cpr,
        0xFE: cpn,
        0xBE: cpHL,
        0x04: incr,
        0x14: incr,
        0x24: incr,
        0x0C: incr,
        0x1C: incr,
        0x2C: incr,
        0x3C: incr,
        0x34: incHL,
        0x05: decr,
        0x15: decr,
        0x25: decr,
        0x0D: decr,
        0x1D: decr,
        0x2D: decr,
        0x3D: decr,
        0x35: decHL,
        0x27: daa,
        0x2F: cpl,
        0x09: addHLrr,
        0x19: addHLrr,
        0x29: addHLrr,
        0x39: addHLrr,
        0x03: incrr,
        0x13: incrr,
        0x23: incrr,
        0x33: incrr,
        0x0B: decrr,
        0x1B: decrr,
        0x2B: decrr,
        0x3B: decrr,
        0xE8: addSPdd,
        0xF8: ldHLSPdd,
        0x07: rlca,
        0x17: rla,
        0x0F: rrca,
        0x1F: rra,
        0xCB01: rlcr, 
        0xCB02: rlcr, 
        0xCB03: rlcr, 
        0xCB04: rlcr, 
        0xCB05: rlcr, 
        0xCB07: rlcr,
        0xCB06: rlcHL,
        0xCB10: rlr, 
        0xCB11: rlr, 
        0xCB12: rlr, 
        0xCB13: rlr, 
        0xCB14: rlr, 
        0xCB15: rlr, 
        0xCB17: rlr,
        0xCB16: rlHL,
        0xCB08: rrcr, 
        0xCB09: rrcr, 
        0xCB0A: rrcr, 
        0xCB0B: rrcr, 
        0xCB0C: rrcr, 
        0xCB0D: rrcr, 
        0xCB0F: rrcr,
        0xCB0E: rrcHL,
        0xCB18: rrr, 
        0xCB19: rrr, 
        0xCB1A: rrr, 
        0xCB1B: rrr, 
        0xCB1C: rrr, 
        0xCB1D: rrr, 
        0xCB1F: rrr,
        0xCB1E: rrHL,
        0xCB20: slar, 
        0xCB21: slar, 
        0xCB22: slar, 
        0xCB23: slar, 
        0xCB24: slar, 
        0xCB25: slar, 
        0xCB27: slar,
        0xCB26: slaHL,
        0xCB30: swapr, 
        0xCB31: swapr, 
        0xCB32: swapr, 
        0xCB33: swapr, 
        0xCB34: swapr, 
        0xCB35: swapr, 
        0xCB37: swapr,
        0xCB36: swapHL,
        0xCB28: srar, 
        0xCB29: srar, 
        0xCB2A: srar, 
        0xCB2B: srar, 
        0xCB2C: srar, 
        0xCB2D: srar, 
        0xCB2F: srar,
        0xCB2E: sraHL,
        0xCB38: srlr, 
        0xCB39: srlr, 
        0xCB3A: srlr, 
        0xCB3B: srlr, 
        0xCB3C: srlr, 
        0xCB3D: srlr, 
        0xCB3F: srlr,
        0xCB3E: srlHL,
        0xCB40: bitr, 
        0xCB41: bitr, 
        0xCB42: bitr, 
        0xCB43: bitr, 
        0xCB44: bitr, 
        0xCB45: bitr, 
        0xCB47: bitr,
        0xCB48: bitr, 
        0xCB49: bitr, 
        0xCB4A: bitr, 
        0xCB4B: bitr, 
        0xCB4C: bitr, 
        0xCB4D: bitr, 
        0xCB4F: bitr,
        0xCB50: bitr, 
        0xCB51: bitr, 
        0xCB52: bitr, 
        0xCB53: bitr, 
        0xCB54: bitr, 
        0xCB55: bitr, 
        0xCB57: bitr,
        0xCB58: bitr, 
        0xCB59: bitr, 
        0xCB5A: bitr, 
        0xCB5B: bitr, 
        0xCB5C: bitr, 
        0xCB5D: bitr, 
        0xCB5F: bitr,
        0xCB60: bitr, 
        0xCB61: bitr, 
        0xCB62: bitr, 
        0xCB63: bitr, 
        0xCB64: bitr, 
        0xCB65: bitr, 
        0xCB67: bitr,
        0xCB68: bitr, 
        0xCB69: bitr, 
        0xCB6A: bitr, 
        0xCB6B: bitr, 
        0xCB6C: bitr, 
        0xCB6D: bitr, 
        0xCB6F: bitr,
        0xCB70: bitr, 
        0xCB71: bitr, 
        0xCB72: bitr, 
        0xCB73: bitr, 
        0xCB74: bitr, 
        0xCB75: bitr, 
        0xCB77: bitr,
        0xCB78: bitr, 
        0xCB79: bitr, 
        0xCB7A: bitr, 
        0xCB7B: bitr, 
        0xCB7C: bitr, 
        0xCB7D: bitr, 
        0xCB7F: bitr,
        0xCB46: bitnHL, 
        0xCB4E: bitnHL, 
        0xCB56: bitnHL, 
        0xCB5E: bitnHL, 
        0xCB66: bitnHL, 
        0xCB6E: bitnHL, 
        0xCB76: bitnHL, 
        0xCB7E: bitnHL,
        0xCBC0: setnr, 
        0xCBC1: setnr, 
        0xCBC2: setnr, 
        0xCBC3: setnr, 
        0xCBC4: setnr, 
        0xCBC5: setnr, 
        0xCBC7: setnr,
        0xCBC8: setnr, 
        0xCBC9: setnr, 
        0xCBCA: setnr, 
        0xCBCB: setnr, 
        0xCBCC: setnr, 
        0xCBCD: setnr, 
        0xCBCF: setnr,
        0xCBD0: setnr, 
        0xCBD1: setnr, 
        0xCBD2: setnr, 
        0xCBD3: setnr, 
        0xCBD4: setnr, 
        0xCBD5: setnr, 
        0xCBD7: setnr,
        0xCBD8: setnr, 
        0xCBD9: setnr, 
        0xCBDA: setnr, 
        0xCBDB: setnr, 
        0xCBDC: setnr, 
        0xCBDD: setnr, 
        0xCBDF: setnr,
        0xCBE0: setnr, 
        0xCBE1: setnr, 
        0xCBE2: setnr, 
        0xCBE3: setnr, 
        0xCBE4: setnr, 
        0xCBE5: setnr, 
        0xCBE7: setnr,
        0xCBE8: setnr, 
        0xCBE9: setnr, 
        0xCBEA: setnr, 
        0xCBEB: setnr, 
        0xCBEC: setnr, 
        0xCBED: setnr, 
        0xCBEF: setnr,
        0xCBF0: setnr, 
        0xCBF1: setnr, 
        0xCBF2: setnr, 
        0xCBF3: setnr, 
        0xCBF4: setnr, 
        0xCBF5: setnr, 
        0xCBF7: setnr,
        0xCBF8: setnr, 
        0xCBF9: setnr, 
        0xCBFA: setnr, 
        0xCBFB: setnr, 
        0xCBFC: setnr, 
        0xCBFD: setnr, 
        0xCBFF: setnr,
        0xCBC6: setnHL, 
        0xCBCE: setnHL, 
        0xCBD6: setnHL, 
        0xCBDE: setnHL, 
        0xCBE6: setnHL, 
        0xCBEE: setnHL, 
        0xCBF6: setnHL, 
        0xCBFE: setnHL,
        0xCB80: resnr, 
        0xCB81: resnr, 
        0xCB82: resnr, 
        0xCB83: resnr, 
        0xCB84: resnr, 
        0xCB85: resnr, 
        0xCB87: resnr,
        0xCB88: resnr, 
        0xCB89: resnr, 
        0xCB8A: resnr, 
        0xCB8B: resnr, 
        0xCB8C: resnr, 
        0xCB8D: resnr, 
        0xCB8F: resnr,
        0xCB90: resnr, 
        0xCB91: resnr, 
        0xCB92: resnr, 
        0xCB93: resnr, 
        0xCB94: resnr, 
        0xCB95: resnr, 
        0xCB97: resnr,
        0xCB98: resnr, 
        0xCB99: resnr, 
        0xCB9A: resnr, 
        0xCB9B: resnr, 
        0xCB9C: resnr, 
        0xCB9D: resnr, 
        0xCB9F: resnr,
        0xCBA0: resnr, 
        0xCBA1: resnr, 
        0xCBA2: resnr, 
        0xCBA3: resnr, 
        0xCBA4: resnr, 
        0xCBA5: resnr, 
        0xCBA7: resnr,
        0xCBA8: resnr, 
        0xCBA9: resnr, 
        0xCBAA: resnr, 
        0xCBAB: resnr, 
        0xCBAC: resnr, 
        0xCBAD: resnr, 
        0xCBAF: resnr,
        0xCBB0: resnr, 
        0xCBB1: resnr, 
        0xCBB2: resnr, 
        0xCBB3: resnr, 
        0xCBB4: resnr, 
        0xCBB5: resnr, 
        0xCBB7: resnr,
        0xCBB8: resnr, 
        0xCBB9: resnr, 
        0xCBBA: resnr, 
        0xCBBB: resnr, 
        0xCBBC: resnr, 
        0xCBBD: resnr, 
        0xCBBF: resnr,
        0xCB86: resnHL, 
        0xCB8E: resnHL, 
        0xCB96: resnHL, 
        0xCB9E: resnHL, 
        0xCBA6: resnHL, 
        0xCBAA: resnHL, 
        0xCBAE: resnHL, 
        0xCBB6: resnHL, 
        0xCBBE: resnHL,
        0x3F: ccf,
        0x37: scf,
        0x76: halt,
        0x1000: stop,
        0xF3: di,
        0xFB: ei,
        0xC3: jp, 
        0xE9: jpHL,
        0xC2: jpf,
        0xD2: jpf,
        0xCA: jpf,
        0xDA: jpf,
        0x18: jr,
        0x20: jrf,
        0x28: jrf,
        0x30: jrf,
        0x38: jrf,
        0xCD: call,
        0xC4: callfnn,
        0xCC: callfnn,
        0xD4: callfnn,
        0xDC: callfnn,
        0xC9: ret,
        0xC0: retf,
        0xC8: retf,
        0xD0: retf,
        0xD8: retf,
        0xD9: reti,
        0xC7: rstn,
        0xCF: rstn,
        0xD7: rstn,
        0xDF: rstn,
        0xE7: rstn,
        0xEF: rstn,
        0xF7: rstn,
        0xFF: rstn
    }

    this.handleInterrupts = () => {
        this.pendingCycles = 0;

        if (this.IME) {
            if (memory.getByte(0xFFFF) & memory.getByte(0xFF0F)) {
                this.IME = false;

                this.decSP();
                this.setByte(this.SP, this.PC >> 8);
                this.decSP();
                this.setByte(this.SP, this.PC & 0xFF);
                // const interrupts = [];

                const ie_flags = this.getByte(0xFFFF);
                const if_flags = this.getByte(0xFF0F);
                
                if ((if_flags & 0b00000001) && (ie_flags & 0b00000001)) { // V-Blank
                    this.PC = 0x40;
                    this.setByte(0xFF0F, if_flags & 0b11111110);
                } else if ((if_flags & 0b00000010) && (ie_flags & 0b00000010)) { // LCDC (see STAT)
                    this.PC = 0x48;
                    this.setByte(0xFF0F, if_flags & 0b11111101);
                } else if ((if_flags & 0b00000100) && (ie_flags & 0b00000100)) { // Timer Overflow
                    this.PC = 0x50;
                    this.setByte(0xFF0F, if_flags & 0b11111011);
                } else if ((if_flags & 0b00001000) && (ie_flags & 0b00001000)) { // Serial I/O transfer complete
                    this.PC = 0x58;
                    this.setByte(0xFF0F, if_flags & 0b11110111);
                } else if ((if_flags & 0b00010000) && (ie_flags & 0b00010000)) { // Transition from High to Low of Pin number P10-P13
                    this.PC = 0x60;
                    this.setByte(0xFF0F, if_flags & 0b11101111);
                }

                // if ((if_flags & ie_flags) == 0) {
                //     this.PC = 0;
                // }

                // this.PC = interrupts[0];
                
                // interrupts.sort((a,b) => b - a);
                
                // interrupts.forEach(interrupt => {
                    // if (interrupt != this.PC) {
                        // const SP = this.get16BitReg(3);
                        // memory.setWord(SP - 2, interrupt);
                        // this.set16BitReg(3, SP - 2);
                    // }
                // });

            }
        }

        return this.pendingCycles;
    }

    const dumpDebug = (text) => {
        fs.writeFileSync(
            `./dump_${this.timestamp}`,
            `${text}\n`,
            { flag: 'a+' }
        );
    }

    const dumpOp = () => {
        fs.writeFileSync(
            `./dump_${this.timestamp}`,
            `- ${this.opcodesMap[this.recentOp].name} ${this.recentOp.toString(16)}
               SP: ${this.SP.toString(16)} PC: ${this.recentPC.toString(16)}
               A: ${this.A.toString(16)} F: ${this.F.toString(16)}
               B: ${this.B.toString(16)} C: ${this.C.toString(16)}
               D: ${this.D.toString(16)} E: ${this.E.toString(16)}
               H: ${this.H.toString(16)} L: ${this.L.toString(16)}
            \n`,
            { flag: 'a+' }
        );
    }

    this.handleIMEChange = () => {
        // Maybe we can do it with just 1 counter
        // Handle EI/DI requests, should change IME after the next instruction from DI/EI was executed
        // In case of a sequence of EI/DI calls we should change the IME delayed
        for (let i = 0; i < this.imeChangeOpCounters.length; i++) {
            this.imeChangeOpCounters[i][0]--;

            if (this.imeChangeOpCounters[i][0] === 0) {
                this.IME = this.imeChangeOpCounters[i][1];
            }
        }

        if (this.imeChangeOpCounters.length > 0 && this.imeChangeOpCounters[0][0] === 0) {
            this.imeChangeOpCounters.shift();
        }
    }

    this.fetchAndExecute = () => {
        if (this.halted) return;

        if (this.PC === 0x0100) {
            memory.unloadBios();
            this.biosLoaded = 0;
        }

        this.lastOp = this.recentOp;
        this.lastPC = this.recentPC;

        this.recentPC = this.PC;

        this.pendingCycles = 0;

        let op = memory.getByte(this.PC++);
        
        if (op === undefined) {
            throw new Error('No opcode found');
        }
        
        if (op === 0xCB) {
            op = memory.getByte(this.PC++);
            this.opcodesMap[(0xCB << 8) + op](op);
            this.recentOp = (0xCB << 8) + op;
        } else if (op === 0x10) {
            op = memory.getByte(this.PC++);
            this.opcodesMap[(0x10 << 8) + op](op);
            this.recentOp = (0x10 << 8) + op;
        } else {
            this.opcodesMap[op](op);
            this.recentOp = op;
        }

        this.handleIMEChange();

        if (debugOpts.dump) {
            dumpOp();
        }

        this.clock.t = (this.clock.t + this.pendingCycles) & Number.MAX_SAFE_INTEGER;
        
        return this.pendingCycles;
    }


    this.getState = () => {
        return  `
            Last Op: ${this.opcodesMap[this.lastOp].name} ${this.lastOp.toString(16)} Last PC: ${this.lastPC.toString(16)}
            Clock: T-${this.clock.t} M-${this.clock.m}
            OP: ${this.opcodesMap[this.recentOp].name} ${this.recentOp.toString(16)}
            PC ${this.recentPC.toString(16)}
            SP ${this.SP.toString(16)}
            A ${this.A.toString(16)} F ${this.F.toString(16)}
            B ${this.B.toString(16)} C ${this.C.toString(16)}
            D ${this.D.toString(16)} E ${this.E.toString(16)}
            H ${this.H.toString(16)} L ${this.L.toString(16)}
            IME ${this.IME}
            BIOS ${this.biosLoaded}
        `;
    } 
}

// console.log(window)
module.exports = CPU;