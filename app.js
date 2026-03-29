document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM Elements ---
    const UI = {
        stepUpload: document.getElementById('step-upload'),
        stepCrop: document.getElementById('step-crop'),
        stepProcess: document.getElementById('step-process'),
        dropZone: document.getElementById('drop-zone'),
        fileInput: document.getElementById('file-input'),
        imageToCrop: document.getElementById('image-to-crop'),
        btnCancelCrop: document.getElementById('btn-cancel-crop'),
        btnConfirmCrop: document.getElementById('btn-confirm-crop'),
        btnBackToCrop: document.getElementById('btn-back-to-crop'),
        btnSave: document.getElementById('btn-save'),
        processCanvas: document.getElementById('process-canvas'),
        previewCanvas: document.getElementById('preview-canvas'),
        thresholdSlider: document.getElementById('threshold'),
        thresholdVal: document.getElementById('threshold-val'),
        invertToggle: document.getElementById('invert'),
        shapeRadios: document.querySelectorAll('input[name="shape"]'),
    };

    let cropper = null;
    let croppedImageData = null; // store the 512x512 image data array
    const OUTPUT_SIZE = 512;

    // --- Navigation Functions ---
    const showStep = (stepElement) => {
        [UI.stepUpload, UI.stepCrop, UI.stepProcess].forEach(el => {
            if (el === stepElement) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    };

    // --- Step 1: Upload ---
    UI.dropZone.addEventListener('click', () => UI.fileInput.click());

    UI.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        UI.dropZone.classList.add('drag-over');
    });

    UI.dropZone.addEventListener('dragleave', () => {
        UI.dropZone.classList.remove('drag-over');
    });

    UI.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        UI.dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    UI.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    });

    const handleFile = (file) => {
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            initCropper(e.target.result);
            showStep(UI.stepCrop);
        };
        reader.readAsDataURL(file);
    };

    // --- Step 2: Crop ---
    const initCropper = (imageSrc) => {
        UI.imageToCrop.src = imageSrc;
        if (cropper) {
            cropper.destroy();
        }
        cropper = new Cropper(UI.imageToCrop, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 0.8,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    };

    UI.btnCancelCrop.addEventListener('click', () => {
        UI.fileInput.value = '';
        showStep(UI.stepUpload);
    });

    UI.btnConfirmCrop.addEventListener('click', () => {
        if (!cropper) return;
        
        // Get cropped canvas at high resolution
        const cropCanvas = cropper.getCroppedCanvas({
            width: OUTPUT_SIZE,
            height: OUTPUT_SIZE,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        const ctx = UI.processCanvas.getContext('2d');
        ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        ctx.drawImage(cropCanvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        
        croppedImageData = ctx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        
        showStep(UI.stepProcess);
        updatePreview();
    });

    // --- Step 3: Process & Preview ---
    
    // Controls mapping
    UI.btnBackToCrop.addEventListener('click', () => {
        showStep(UI.stepCrop);
    });

    UI.thresholdSlider.addEventListener('input', (e) => {
        UI.thresholdVal.textContent = e.target.value;
        updatePreview(); // Fast update
    });

    UI.invertToggle.addEventListener('change', updatePreview);
    
    UI.shapeRadios.forEach(radio => {
        radio.addEventListener('change', updatePreview);
    });

    function updatePreview() {
        if (!croppedImageData) return;

        const threshold = parseInt(UI.thresholdSlider.value, 10);
        const invert = UI.invertToggle.checked;
        const shape = document.querySelector('input[name="shape"]:checked').value;

        const ctx = UI.previewCanvas.getContext('2d');
        const width = OUTPUT_SIZE;
        const height = OUTPUT_SIZE;

        // Colors
        // C1: White background (#FFFFFF)
        // C2: Charcoal Gray icon (#333333)
        // By default, bright original pixels -> Background (White)
        // Dark original pixels -> Icon (Charcoal)
        // If invert is True, swap the output.
        const colorWhite = {r: 255, g: 255, b: 255, a: 255};
        const colorCharcoal = {r: 51, g: 51, b: 51, a: 255};
        
        let bgOut = invert ? colorCharcoal : colorWhite;
        let fgOut = invert ? colorWhite : colorCharcoal;

        // 1. Process pixels into a temporary offscreen canvas (or reusing processCanvas)
        const procCtx = UI.processCanvas.getContext('2d');
        const outData = procCtx.createImageData(width, height);
        
        for (let i = 0; i < croppedImageData.data.length; i += 4) {
            const r = croppedImageData.data[i];
            const g = croppedImageData.data[i+1];
            const b = croppedImageData.data[i+2];
            const a = croppedImageData.data[i+3];

            // Luminance formula
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            
            // Determine if pixel is background (higher lum) or foreground (lower lum)
            // Wait, usually the icon logo is white (high lum) on a colored background.
            // But sometimes the icon is dark on a white background.
            // Using a simple threshold to binary.
            
            const isBright = luminance > threshold;
            const targetColor = isBright ? colorWhite : colorCharcoal;
            
            // To make it flexible with the invert toggle:
            let outC = isBright ? bgOut : fgOut;
            
            if (a < 50) {
                // Keep purely transparent pixels (if the image had them, which screenshots don't)
                outData.data[i] = 255;
                outData.data[i+1] = 255;
                outData.data[i+2] = 255;
                outData.data[i+3] = 0;
            } else {
                outData.data[i] = outC.r;
                outData.data[i+1] = outC.g;
                outData.data[i+2] = outC.b;
                outData.data[i+3] = outC.a;
            }
        }
        
        procCtx.putImageData(outData, 0, 0);

        // 2. Draw to preview canvas with masking
        ctx.clearRect(0, 0, width, height);
        
        // Draw the shape path
        ctx.beginPath();
        if (shape === 'squircle') {
            const radius = width * 0.225; // iOS standard approximation
            ctx.roundRect(0, 0, width, height, radius);
        } else {
            // Circle
            ctx.arc(width/2, height/2, width/2, 0, Math.PI * 2);
        }
        ctx.closePath();
        
        // Fill base (in case image has transparency holes, though we filled them)
        ctx.fillStyle = `rgb(${bgOut.r}, ${bgOut.g}, ${bgOut.b})`;
        ctx.fill();

        // Clip and draw processed image
        ctx.save();
        ctx.clip();
        ctx.drawImage(UI.processCanvas, 0, 0);
        ctx.restore();
    }

    // --- Step 4: Save / Download ---
    UI.btnSave.addEventListener('click', async () => {
        const dataUrl = UI.previewCanvas.toDataURL('image/png');
        const filename = `icon-${Date.now()}.png`;

        // Attempt to use Web Share API if supported and on mobile
        if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
            try {
                // Convert dataUrl to File
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const file = new File([blob], filename, { type: 'image/png' });
                
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: '生成したアイコン',
                        text: 'アイコン画像を保存しますか？'
                    });
                    return; // Success, don't fallback to download
                }
            } catch (err) {
                console.log("Share failed, falling back to download", err);
            }
        }

        // Fallback: regular download link
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
});
