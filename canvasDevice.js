
function CanvasOutputDevice() {
    require('native-canvas');
    document.title = 'GBJS';
    canvas.height = '144px';
    canvas.width = '160px';

    const ctx = canvas.getContext('2d');

    this.getRGBColor = (colorId) => {
        switch (colorId) {
            case 0:
                return '#000000';
            case 1:
                return '#0000FF';
            case 2:
                return '#00FF00';
            case 3:
                return '#00FFFF';
        }
    }

    this.render = (screenData) => {
        ctx.fillStyle = this.getRGBColor(0);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const pixelWidth = canvas.width / 160;
        const pixelHeight = canvas.height / 144;
        
        for (let line = 0; line < 144; line++) {
            for (let pixel = 0; pixel < 160; pixel++) {
                ctx.fillStyle = this.getRGBColor(screenData[line][pixel]);
                ctx.fillRect(pixel * pixelWidth, line * pixelHeight, pixelWidth, pixelHeight);
            }
        }
    }
}

module.exports = CanvasOutputDevice;