document.addEventListener('DOMContentLoaded', () => {
  const selectFolderBtn = document.getElementById('select-folder-btn');
  const gallery = document.getElementById('gallery');
  const hideUnknownCheckbox = document.getElementById('hide-unknown-checkbox');
  const imageViewer = document.getElementById('image-viewer');
  const fullImage = document.getElementById('full-image');
  const closeBtn = document.querySelector('.close-btn');
  const prevBtn = document.querySelector('.prev-btn');
  const nextBtn = document.querySelector('.next-btn');

  let files = [];
  let imageExtensions = [];
  let currentImageIndex = -1;

  const getImageFiles = () => files.filter(file => imageExtensions.includes(file.name.split('.').pop().toLowerCase()));

  const openImageViewer = (index) => {
    const imageFiles = getImageFiles();
    if (index >= 0 && index < imageFiles.length) {
      currentImageIndex = index;
      fullImage.src = imageFiles[currentImageIndex].url;
      imageViewer.style.display = 'block';
    }
  };

  const closeImageViewer = () => {
    imageViewer.style.display = 'none';
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

  selectFolderBtn.addEventListener('click', async () => {
    const result = await window.electron.selectFolder();
    if (result && result.files) {
      files = result.files;
      imageExtensions = result.imageExtensions || [];
      renderGallery();
    }
  });

  hideUnknownCheckbox.addEventListener('change', renderGallery);
  closeBtn.addEventListener('click', closeImageViewer);
  prevBtn.addEventListener('click', showPrevImage);
  nextBtn.addEventListener('click', showNextImage);

  window.addEventListener('keydown', (e) => {
    if (imageViewer.style.display === 'block') {
      if (e.key === 'ArrowRight') {
        showNextImage();
      } else if (e.key === 'ArrowLeft') {
        showPrevImage();
      } else if (e.key === 'Escape') {
        closeImageViewer();
      }
    }
  });
});