document.addEventListener('DOMContentLoaded', () => {
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const gallery = document.getElementById('gallery');
  const hideUnknownCheckbox = document.getElementById('hide-unknown-checkbox');
  const recursiveCheckbox = document.getElementById('recursive-checkbox');
  const zoomSlider = document.getElementById('zoom-slider');
  const progressIndicator = document.getElementById('progress-indicator');
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
  let currentFolderPath = null;
  let thumbnailObserver = null;
  let loadedThumbnailsCount = 0;

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
    progressIndicator.textContent = '';
    loadedThumbnailsCount = 0;

    // Disconnect previous observer if exists
    if (thumbnailObserver) {
      thumbnailObserver.disconnect();
    }

    const hideUnknown = hideUnknownCheckbox.checked;
    const imageFiles = getImageFiles();
    let imageFileIndex = -1;

    const filesToDisplay = files.filter(file => {
      const extension = file.name.split('.').pop().toLowerCase();
      const isImage = imageExtensions.includes(extension);
      return !hideUnknown || isImage;
    });

    const totalCount = filesToDisplay.length;

    const updateProgress = () => {
      loadedThumbnailsCount++;
      const percentage = Math.round((loadedThumbnailsCount / totalCount) * 100);
      progressIndicator.textContent = `${percentage}% (${loadedThumbnailsCount}/${totalCount})`;

      if (loadedThumbnailsCount === totalCount) {
        setTimeout(() => {
          progressIndicator.textContent = '';
        }, 2000);
      }
    };

    // Create Intersection Observer for lazy loading
    thumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          const filePath = item.dataset.filePath;
          const fileUrl = item.dataset.fileUrl;
          const isImage = item.dataset.isImage === 'true';

          if (isImage && !item.dataset.loaded) {
            item.dataset.loaded = 'true';
            const img = item.querySelector('img');

            window.electron.getThumbnail(filePath).then(thumbnailUrl => {
              if (thumbnailUrl) {
                img.src = thumbnailUrl;
              } else {
                img.src = fileUrl;
              }
              updateProgress();
            }).catch(error => {
              console.error('Error getting thumbnail:', error);
              img.src = fileUrl;
              updateProgress();
            });
          } else if (!isImage) {
            updateProgress();
          }

          thumbnailObserver.unobserve(item);
        }
      });
    }, {
      root: null,
      rootMargin: '200px',
      threshold: 0.01
    });

    // Create gallery items
    for (const file of filesToDisplay) {
      const extension = file.name.split('.').pop().toLowerCase();
      const isImage = imageExtensions.includes(extension);

      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.title = file.name;
      item.dataset.filePath = file.path;
      item.dataset.fileUrl = file.url;
      item.dataset.isImage = isImage;

      if (isImage) {
        imageFileIndex++;
        const currentIndex = imageFileIndex;
        const img = document.createElement('img');
        img.style.backgroundColor = '#f0f0f0'; // Placeholder background
        item.appendChild(img);
        item.addEventListener('click', () => openImageViewer(currentIndex));
      } else {
        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.textContent = extension.toUpperCase();
        item.appendChild(icon);
      }

      gallery.appendChild(item);
      thumbnailObserver.observe(item);
    }
  };

  const loadFolderContents = (result) => {
    if (result && result.files) {
      files = result.files;
      imageExtensions = result.imageExtensions || [];
      currentFolderPath = result.folderPath;
      currentFolder.textContent = result.folderPath.split(/[\\/]/).pop();
      renderGallery();

      const imageFiles = getImageFiles();
      const imagePaths = imageFiles.map(file => file.path);
      window.electron.preloadImages(imagePaths);
    }
  };

  selectFolderBtn.addEventListener('click', async () => {
    const recursive = recursiveCheckbox.checked;
    const result = await window.electron.selectFolder(recursive);
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
          const recursive = recursiveCheckbox.checked;
          const result = await window.electron.openFolder(filePath, recursive);
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

  recursiveCheckbox.addEventListener('change', async () => {
    if (currentFolderPath) {
      const recursive = recursiveCheckbox.checked;
      const result = await window.electron.openFolder(currentFolderPath, recursive);
      loadFolderContents(result);
    }
  });

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


  zoomSlider.addEventListener('input', (e) => {
    thumbnailSize = parseInt(e.target.value, 10);
    updateThumbnailSize();
  });
});