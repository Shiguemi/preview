#!/usr/bin/env python3
"""
EXR Image Conversion Microservice
Receives EXR images and returns thumbnails with gamma correction
"""

import sys
import io
import base64
import os

# Set environment variable to enable OpenEXR support (important for some setups)
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"

from flask import Flask, request, jsonify
from PIL import Image
import numpy as np
import cv2

app = Flask(__name__)

# Increase max content length to 100MB for large EXR files
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB

def exr_from_bytes(file_bytes):
    """Convert EXR bytes to numpy array using OpenCV"""
    # Decode EXR from bytes using OpenCV
    # OpenCV uses BGR format, we'll convert to RGB later
    nparr = np.frombuffer(file_bytes, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)

    if img_array is None:
        raise RuntimeError('OpenCV failed to decode EXR image')

    # OpenCV loads in BGR, convert to RGB if it's a color image
    if len(img_array.shape) == 3 and img_array.shape[2] == 3:
        img_array = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)

    return img_array

def apply_gamma(img_array, gamma=2.2):
    """Apply gamma correction to image array"""
    # Clip negative values
    img_array = np.maximum(img_array, 0)

    # Apply gamma correction
    img_corrected = np.power(img_array, 1.0 / gamma)

    # Clip to [0, 1] range
    img_corrected = np.clip(img_corrected, 0, 1)

    # Convert to 8-bit
    img_8bit = (img_corrected * 255).astype(np.uint8)

    return img_8bit

def resize_image(img_array, max_size):
    """Resize image maintaining aspect ratio"""
    img = Image.fromarray(img_array)

    # Convert RGBA to RGB for JPEG compatibility
    if img.mode == 'RGBA':
        # Create white background
        background = Image.new('RGB', img.size, (255, 255, 255))
        background.paste(img, mask=img.split()[3])  # Use alpha channel as mask
        img = background
    elif img.mode not in ('RGB', 'L'):
        # Convert any other mode to RGB
        img = img.convert('RGB')

    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    return img

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'backend': 'OpenCV',
        'cv2_version': cv2.__version__
    })

@app.route('/convert', methods=['POST'])
def convert_exr():
    """
    Convert EXR to JPEG with gamma correction

    Request JSON:
    {
        "file_path": "/path/to/image.exr",
        "max_size": 800,  // optional, default 800
        "gamma": 2.2      // optional, default 2.2
    }

    Response JSON:
    {
        "success": true,
        "data": "base64_encoded_jpeg"
    }
    """
    try:
        print('[SERVER] Received conversion request', flush=True)
        data = request.get_json()

        if not data:
            print('[SERVER] Error: no data', flush=True)
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        file_path = data.get('file_path')
        if not file_path:
            print('[SERVER] Error: file_path not provided', flush=True)
            return jsonify({'success': False, 'error': 'file_path is required'}), 400

        max_size = data.get('max_size', 800)
        gamma = data.get('gamma', 2.2)

        print(f'[SERVER] Parameters: file_path={file_path}, max_size={max_size}, gamma={gamma}', flush=True)

        # Read EXR directly from disk using OpenCV
        print(f'[SERVER] Reading EXR from disk with OpenCV: {file_path}...', flush=True)
        img_array = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)

        if img_array is None:
            raise RuntimeError(f'OpenCV failed to read or decode EXR image at: {file_path}')

        print(f'[SERVER] EXR loaded from disk, shape: {img_array.shape}, dtype: {img_array.dtype}', flush=True)

        # OpenCV loads in BGR, convert to RGB if it's a color image
        if len(img_array.shape) == 3 and img_array.shape[2] in [3, 4]:
             img_array = cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB)

        # Apply gamma correction
        print('[SERVER] Applying gamma correction...', flush=True)
        img_corrected = apply_gamma(img_array, gamma)

        # Resize if needed
        if max_size:
            print(f'[SERVER] Resizing to max_size={max_size}...', flush=True)
            img_pil = resize_image(img_corrected, max_size)
        else:
            print('[SERVER] No resize requested', flush=True)
            img_pil = Image.fromarray(img_corrected)

            # Convert RGBA to RGB for JPEG compatibility (when no resize)
            if img_pil.mode == 'RGBA':
                background = Image.new('RGB', img_pil.size, (255, 255, 255))
                background.paste(img_pil, mask=img_pil.split()[3])
                img_pil = background
            elif img_pil.mode not in ('RGB', 'L'):
                img_pil = img_pil.convert('RGB')

        # Convert to JPEG and encode as base64
        print('[SERVER] Converting to JPEG...', flush=True)
        buffer = io.BytesIO()
        img_pil.save(buffer, format='JPEG', quality=90)
        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

        print(f'[SERVER] Conversion successful, output size: {len(img_base64)} chars', flush=True)

        return jsonify({
            'success': True,
            'data': f'data:image/jpeg;base64,{img_base64}'
        })

    except FileNotFoundError as e:
        print(f'[SERVER] File not found: {e}', flush=True)
        return jsonify({'success': False, 'error': 'File not found'}), 404
    except Exception as e:
        print(f'[SERVER] Error during conversion: {str(e)}', flush=True)
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # Get port from command line argument, default to 5000
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    print(f'Starting EXR conversion server on port {port}', flush=True)
    print(f'Using OpenCV version: {cv2.__version__}', flush=True)
    app.run(host='127.0.0.1', port=port, debug=False)
