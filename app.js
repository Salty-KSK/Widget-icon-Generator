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
        radiusSlider: document.getElementById('radius'),
        radiusVal: document.getElementById('radius-val'),
        radiusControlGroup: document.getElementById('radius-control-group'),
        bgModeRadios: document.querySelectorAll('input[name="bg-mode"]'),
        bgColorGroup: document.getElementById('bg-color-group'),
        bgColorPicker: document.getElementById('bg-color'),
        markColorRadios: document.querySelectorAll('input[name="mark-color"]'),
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

    UI.radiusSlider.addEventListener('input', (e) => {
        UI.radiusVal.textContent = e.target.value + '%';
        updatePreview();
    });

    UI.bgModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'transparent') {
                UI.bgColorGroup.style.display = 'none';
            } else {
                UI.bgColorGroup.style.display = 'flex';
            }
            updatePreview();
        });
    });

    UI.bgColorPicker.addEventListener('input', updatePreview);
    
    UI.markColorRadios.forEach(radio => {
        radio.addEventListener('change', updatePreview);
    });

    UI.thresholdSlider.addEventListener('input', (e) => {
        UI.thresholdVal.textContent = e.target.value;
        updatePreview();
    });

    UI.invertToggle.addEventListener('change', updatePreview);
    
    UI.shapeRadios.forEach(radio => {
        radio.addEventListener('change', updatePreview);
    });

    function updatePreview() {
        if (!croppedImageData) return;

        const invert = UI.invertToggle.checked;
        const shape = document.querySelector('input[name="shape"]:checked').value;
        const bgMode = document.querySelector('input[name="bg-mode"]:checked').value;
        const markColor = document.querySelector('input[name="mark-color"]:checked').value;
        const threshold = parseInt(UI.thresholdSlider.value, 10);
        
        // Background color parsing
        const bgColorHex = UI.bgColorPicker.value;
        const bgR = parseInt(bgColorHex.substr(1, 2), 16) || 224;
        const bgG = parseInt(bgColorHex.substr(3, 2), 16) || 224;
        const bgB = parseInt(bgColorHex.substr(5, 2), 16) || 224;

        const ctx = UI.previewCanvas.getContext('2d');
        const width = OUTPUT_SIZE;
        const height = OUTPUT_SIZE;

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
            
            const isBright = luminance > threshold;
            // When invert is checked, darker pixels are treated as background
            const isBackground = invert ? !isBright : isBright;
            
            if (a < 50 || isBackground) {
                if (bgMode === 'transparent') {
                    // Make pixels fully transparent
                    outData.data[i] = 0;
                    outData.data[i+1] = 0;
                    outData.data[i+2] = 0;
                    outData.data[i+3] = 0;
                } else {
                    // Fill with solid background color
                    outData.data[i] = bgR;
                    outData.data[i+1] = bgG;
                    outData.data[i+2] = bgB;
                    outData.data[i+3] = 255;
                }
            } else {
                // Processing for the logo mark
                let outLum = invert ? (255 - luminance) : luminance;
                
                let targetR, targetG, targetB;
                if (markColor === 'black') {
                    targetR = 0; targetG = 0; targetB = 0;
                } else if (markColor === 'white') {
                    targetR = 255; targetG = 255; targetB = 255;
                } else {
                    targetR = outLum; targetG = outLum; targetB = outLum;
                }

                if (bgMode === 'transparent') {
                    outData.data[i] = targetR;
                    outData.data[i+1] = targetG;
                    outData.data[i+2] = targetB;
                    outData.data[i+3] = a; // keep original alpha
                } else {
                    let alphaFactor = a / 255.0; // Blend original transparent pixels neatly against the solid background
                    outData.data[i] = Math.round((targetR * alphaFactor) + (bgR * (1 - alphaFactor)));
                    outData.data[i+1] = Math.round((targetG * alphaFactor) + (bgG * (1 - alphaFactor)));
                    outData.data[i+2] = Math.round((targetB * alphaFactor) + (bgB * (1 - alphaFactor)));
                    outData.data[i+3] = 255;
                }
            }
        }
        
        procCtx.putImageData(outData, 0, 0);

        // UI toggles
        if (shape === 'squircle') {
            UI.radiusControlGroup.style.display = 'flex';
        } else {
            UI.radiusControlGroup.style.display = 'none';
        }

        // 2. Draw to preview canvas with masking
        ctx.clearRect(0, 0, width, height);

        ctx.save();
        if (shape !== 'square') {
            ctx.beginPath();
            if (shape === 'squircle') {
                const radiusPct = parseFloat(UI.radiusSlider.value);
                const radius = width * (radiusPct / 100);
                ctx.roundRect(0, 0, width, height, radius);
            } else if (shape === 'circle') {
                ctx.arc(width/2, height/2, width/2, 0, Math.PI * 2);
            }
            ctx.closePath();
            ctx.clip();
        }

        // Draw processed image directly
        // Removing the manual background fill fixes the weird color borders on aliased edges
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
