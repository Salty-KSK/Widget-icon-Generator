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

    UI.invertToggle.addEventListener('change', updatePreview);
    
    UI.shapeRadios.forEach(radio => {
        radio.addEventListener('change', updatePreview);
    });

    function updatePreview() {
        if (!croppedImageData) return;

        const invert = UI.invertToggle.checked;
        const shape = document.querySelector('input[name="shape"]:checked').value;

        const ctx = UI.previewCanvas.getContext('2d');
        const width = OUTPUT_SIZE;
        const height = OUTPUT_SIZE;

        // Colors
        // C1: White background (#FFFFFF)
        // C2: Black background for invert (#000000)
        const colorWhite = {r: 255, g: 255, b: 255};
        const colorBlack = {r: 0, g: 0, b: 0};
        
        let bgOut = invert ? colorBlack : colorWhite;

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
            
            // Grayscale or Inverted Grayscale
            let outLum = invert ? (255 - luminance) : luminance;
            
            if (a < 50) {
                // Keep purely transparent pixels
                outData.data[i] = 255;
                outData.data[i+1] = 255;
                outData.data[i+2] = 255;
                outData.data[i+3] = 0;
            } else {
                outData.data[i] = outLum;
                outData.data[i+1] = outLum;
                outData.data[i+2] = outLum;
                outData.data[i+3] = a;
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
