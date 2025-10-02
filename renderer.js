document.addEventListener('DOMContentLoaded', () => {
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const gallery = document.getElementById('gallery');
  const hideUnknownCheckbox = document.getElementById('hide-unknown-checkbox');
  const zoomSlider = document.getElementById('zoom-slider');
  const currentFolder = document.getElementById('current-folder');
  const imageViewer = document.getElementById('image-viewer');
  const fullImage = document.getElementById('full-image');
  const closeBtn = document.querySelector('.close-btn');
  const prevBtn = document.querySelector('.prev-btn');
  const nextBtn = document.querySelector('.next-btn');

  let files = [];
  let imageExtensions = [];
  let currentImageIndex = -1;
  let scale = 1;
  let posX = 0;
  let posY = 0;
  let isDragging = false;
  let startDragX = 0;
  let startDragY = 0;

  const DEFAULT_THUMBNAIL_SIZE = 150;
  let thumbnailSize = DEFAULT_THUMBNAIL_SIZE;

  const getImageFiles = () => files.filter(file => imageExtensions.includes(file.name.split('.').pop().toLowerCase()));

  const updateThumbnailSize = () => {
    gallery.style.gridTemplateColumns = `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`;
  };

  const resetImageTransform = () => {
    scale = 1;
    posX = 0;
    posY = 0;
    fullImage.style.transform = '';
    fullImage.classList.remove('pannable');
  };

  const openImageViewer = async (index) => {
    const imageFiles = getImageFiles();
    if (index >= 0 && index < imageFiles.length) {
      currentImageIndex = index;
      try {
        const imageData = await window.electron.getImageData(imageFiles[currentImageIndex].path);
        fullImage.src = imageData;
        imageViewer.classList.add('visible');
        resetImageTransform(); // Reset transform when a new image is opened

        // Preload next and previous images
        const nextIndex = (currentImageIndex + 1) % imageFiles.length;
        const prevIndex = (currentImageIndex - 1 + imageFiles.length) % imageFiles.length;
        window.electron.preloadImages([
            imageFiles[nextIndex].path,
            imageFiles[prevIndex].path
        ]);

      } catch (error) {
        console.error('Error loading full image:', error);
        // Optionally, you can display an error message to the user in the UI
      }
    }
  };

  const closeImageViewer = () => {
    imageViewer.classList.remove('visible');
  };

  const showNextImage = () => {
    const imageFiles = getImageFiles();
    const nextIndex = (currentImageIndex + 1) % imageFiles.length;
    openImageViewer(nextIndex);
  };

  const showPrevImage = () => {
    const imageFiles = getImageFiles();
    const prevIndex = (currentImageIndex - 1 + imageFiles.length) % imageFiles.length;
    openImageViewer(prevIndex);
  };

  const renderGallery = () => {
    updateThumbnailSize();
    gallery.innerHTML = '';
    const hideUnknown = hideUnknownCheckbox.checked;
    const imageFiles = getImageFiles();
    let imageFileIndex = -1;

    files.forEach(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      const isImage = imageExtensions.includes(extension);

      if (hideUnknown && !isImage) {
        return;
      }

      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.title = file.name;

      if (isImage) {
        imageFileIndex++;
        const currentIndex = imageFileIndex;
        const img = document.createElement('img');
        window.electron.getThumbnail(file.path).then(thumbnailUrl => {
          if (thumbnailUrl) {
            img.src = thumbnailUrl;
          } else {
            img.src = file.url;
          }
        }).catch(error => {
            console.error('Error getting thumbnail:', error);
            img.src = file.url;
        });
        item.appendChild(img);
        item.addEventListener('click', () => openImageViewer(currentIndex));
      } else {
        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.textContent = extension.toUpperCase();
        item.appendChild(icon);
      }

      gallery.appendChild(item);
    });
  };

  const loadFolderContents = (result) => {
    if (result && result.files) {
      files = result.files;
      imageExtensions = result.imageExtensions || [];
      currentFolder.textContent = result.folderPath.split(/[\\/]/).pop();
      renderGallery();

      const imageFiles = getImageFiles();
      const imagePaths = imageFiles.map(file => file.path);
      window.electron.preloadImages(imagePaths);
    }
  };

  selectFolderBtn.addEventListener('click', async () => {
    const result = await window.electron.selectFolder();
    loadFolderContents(result);
  });

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const firstFile = droppedFiles[0];

      try {
        // Use webUtils.getPathForFile to get the actual file path
        const filePath = window.electron.getPathForFile(firstFile);
        console.log('Dropped file path:', filePath);

        if (filePath) {
          const result = await window.electron.openFolder(filePath);
          loadFolderContents(result);
        } else {
          console.error('Could not get path from dropped file');
        }
      } catch (error) {
        console.error('Error processing dropped file:', error);
      }
    }
  });

  hideUnknownCheckbox.addEventListener('change', renderGallery);
  closeBtn.addEventListener('click', closeImageViewer);
  prevBtn.addEventListener('click', showPrevImage);
  nextBtn.addEventListener('click', showNextImage);

  window.addEventListener('keydown', (e) => {
    if (imageViewer.classList.contains('visible')) {
      if (e.key === 'ArrowRight') {
        showNextImage();
      } else if (e.key === 'ArrowLeft') {
        showPrevImage();
      } else if (e.key === 'Escape') {
        closeImageViewer();
      } else if (e.key === '0') {
        resetImageTransform();
      }
    } else {
      if (e.key === '0') {
        thumbnailSize = DEFAULT_THUMBNAIL_SIZE;
        updateThumbnailSize();
      }
    }
  });

  imageViewer.addEventListener('wheel', (e) => {
    e.preventDefault();

    const rect = imageViewer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const newScale = Math.max(1, scale + wheel * zoomFactor);

    if (newScale === 1) {
      resetImageTransform();
      return;
    }

    // Adjust position to keep the point under the cursor stationary
    const imageRect = fullImage.getBoundingClientRect();
    // The transformations are applied to the top-left corner of the image.
    // To calculate the new position, we need to find the cursor's position relative to the image's top-left corner (including previous translations),
    // then scale this relative position by the zoom factor, and add it to the current position.
    const relativeMouseX = (e.clientX - imageRect.left);
    const relativeMouseY = (e.clientY - imageRect.top);

    const newPosX = posX - (relativeMouseX * (newScale - scale)) / scale;
    const newPosY = posY - (relativeMouseY * (newScale - scale)) / scale;

    posX = newPosX;
    posY = newPosY;
    scale = newScale;

    fullImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    fullImage.classList.add('pannable');
  });

  fullImage.addEventListener('mousedown', (e) => {
    if (scale > 1) {
      e.preventDefault();
      isDragging = true;
      startDragX = e.clientX - posX;
      startDragY = e.clientY - posY;
      fullImage.classList.add('panning');
    }
  });

  imageViewer.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      posX = e.clientX - startDragX;
      posY = e.clientY - startDragY;
      fullImage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
    }
  });

  imageViewer.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      fullImage.classList.remove('panning');
    }
  });

  imageViewer.addEventListener('mouseleave', () => {
    if (isDragging) {
      isDragging = false;
      fullImage.classList.remove('panning');
    }
  });

  window.addEventListener('wheel', (e) => {
    if (imageViewer.classList.contains('visible') || !e.target.closest('#gallery')) {
      return;
    }

    e.preventDefault();
    const zoomFactor = 10;
    if (e.deltaY < 0) {
      thumbnailSize += zoomFactor;
    } else {
      thumbnailSize = Math.max(50, thumbnailSize - zoomFactor); // Prevents thumbnails from becoming too small
    }
    zoomSlider.value = thumbnailSize;
    updateThumbnailSize();
  });

  zoomSlider.addEventListener('input', (e) => {
    thumbnailSize = parseInt(e.target.value, 10);
    updateThumbnailSize();
  });
});