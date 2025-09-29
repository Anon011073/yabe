document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";

  // --- Element Selectors ---
  const folderTreeContainer = document.getElementById('folder-tree');
  const bookmarkListContainer = document.getElementById('bookmark-list');
  const currentFolderNameEl = document.getElementById('current-folder-name');
  const selectAllBtn = document.getElementById('select-all-btn');
  const editBtn = document.getElementById('edit-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const newCategoryBtn = document.getElementById('new-category-btn');
  const newBookmarkBtn = document.getElementById('new-bookmark-btn');

  // Bookmark Modal
  const editModalOverlay = document.getElementById('edit-modal-overlay');
  const editModalTitle = document.getElementById('edit-modal-title');
  const editForm = document.getElementById('edit-form');
  const editBookmarkId = document.getElementById('edit-bookmark-id');
  const editBookmarkTitle = document.getElementById('edit-bookmark-title');
  const editBookmarkUrl = document.getElementById('edit-bookmark-url');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');

  // Folder Modal
  const folderModalOverlay = document.getElementById('folder-modal-overlay');
  const folderModalTitle = document.getElementById('folder-modal-title');
  const folderForm = document.getElementById('folder-form');
  const editFolderId = document.getElementById('edit-folder-id');
  const folderNameInput = document.getElementById('folder-name-input');
  const cancelFolderBtn = document.getElementById('cancel-folder-btn');

  // --- State ---
  let dashboardFolder = null;

  // --- Helper Functions ---
  function getDashboardFolder() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.search({ title: DASHBOARD_FOLDER_NAME }, (results) => {
        const appFolderInfo = results.find(node => !node.url);
        if (appFolderInfo) {
          chrome.bookmarks.getSubTree(appFolderInfo.id, (subTree) => {
            resolve(subTree && subTree.length > 0 ? subTree[0] : null);
          });
        } else {
          reject("Dashboard Bookmarks folder not found. Please add bookmarks or categories via the options page first.");
        }
      });
    });
  }

  function findFolderNode(rootNode, folderId) {
    if (!rootNode) return null;
    if (rootNode.id === folderId) return rootNode;
    if (rootNode.children) {
      for (const child of rootNode.children) {
        if (!child.url) {
          const found = findFolderNode(child, folderId);
          if (found) return found;
        }
      }
    }
    return null;
  }

  // --- UI Functions ---
  function buildFolderTree(node, parentElement, level = 0) {
    if (!node || !node.children) return;

    const folderElement = document.createElement('div');
    folderElement.className = 'folder-item';
    folderElement.style.paddingLeft = `${level * 15}px`;
    folderElement.dataset.folderId = node.id;

    const folderNameSpan = document.createElement('span');
    folderNameSpan.className = 'folder-name';
    folderNameSpan.textContent = node.title === DASHBOARD_FOLDER_NAME ? 'All Bookmarks' : node.title;

    const folderActions = document.createElement('div');
    folderActions.className = 'folder-actions';

    if (node.id !== dashboardFolder.id) {
      folderActions.innerHTML = `
        <span class="edit-folder-btn" title="Rename">&#9998;</span>
        <span class="delete-folder-btn" title="Delete">&times;</span>
      `;
    }

    folderElement.appendChild(folderNameSpan);
    folderElement.appendChild(folderActions);
    parentElement.appendChild(folderElement);

    node.children.filter(child => !child.url).forEach(childNode => {
      buildFolderTree(childNode, parentElement, level + 1);
    });
  }

  function displayBookmarksForFolder(folderId) {
    bookmarkListContainer.innerHTML = '';
    chrome.bookmarks.getChildren(folderId, (children) => {
      const currentFolder = findFolderNode(dashboardFolder, folderId);
      currentFolderNameEl.textContent = currentFolder ? (currentFolder.title === DASHBOARD_FOLDER_NAME ? 'All Bookmarks' : currentFolder.title) : 'Folder not found';

      children.filter(child => child.url).forEach(bookmark => {
        const bookmarkElement = document.createElement('div');
        bookmarkElement.className = 'bookmark-row';
        bookmarkElement.innerHTML = `
          <input type="checkbox" data-id="${bookmark.id}">
          <span class="bookmark-title">${bookmark.title}</span>
          <span class="bookmark-url">${bookmark.url}</span>
        `;
        bookmarkListContainer.appendChild(bookmarkElement);
      });
      updateActionButtonsState();
    });
  }

  function updateActionButtonsState() {
    const selectedCheckboxes = bookmarkListContainer.querySelectorAll('input[type="checkbox"]:checked');
    const numSelected = selectedCheckboxes.length;
    deleteBtn.disabled = numSelected === 0;
    editBtn.disabled = numSelected !== 1;
  }

  function getSelectedFolderId() {
      const selectedFolder = document.querySelector('.folder-item.selected');
      return selectedFolder ? selectedFolder.dataset.folderId : dashboardFolder.id;
  }

  // --- Event Listeners ---
  folderTreeContainer.addEventListener('click', (e) => {
    const target = e.target;
    const folderItem = target.closest('.folder-item');
    if (!folderItem) return;

    const folderId = folderItem.dataset.folderId;
    const folderName = folderItem.querySelector('.folder-name').textContent;

    if (target.classList.contains('folder-name')) {
      displayBookmarksForFolder(folderId);
      document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('selected'));
      folderItem.classList.add('selected');
    } else if (target.classList.contains('delete-folder-btn')) {
      e.stopPropagation();
      if (confirm(`Are you sure you want to delete the "${folderName}" folder and all its contents?`)) {
        chrome.bookmarks.removeTree(folderId, () => init());
      }
    } else if (target.classList.contains('edit-folder-btn')) {
      e.stopPropagation();
      folderModalTitle.textContent = "Rename Folder";
      folderNameInput.value = folderName;
      editFolderId.value = folderId;
      folderModalOverlay.classList.remove('hidden');
    }
  });

  bookmarkListContainer.addEventListener('change', () => updateActionButtonsState());
  selectAllBtn.addEventListener('click', () => {
    const allCheckboxes = bookmarkListContainer.querySelectorAll('input[type="checkbox"]');
    const shouldCheckAll = bookmarkListContainer.querySelectorAll('input[type="checkbox"]:not(:checked)').length > 0;
    allCheckboxes.forEach(cb => cb.checked = shouldCheckAll);
    updateActionButtonsState();
  });

  deleteBtn.addEventListener('click', async () => {
    const selectedCheckboxes = Array.from(bookmarkListContainer.querySelectorAll('input[type="checkbox"]:checked'));
    if (selectedCheckboxes.length === 0) return;

    if (confirm(`Are you sure you want to delete ${selectedCheckboxes.length} bookmark(s)?`)) {
      for (const cb of selectedCheckboxes) {
        await new Promise(resolve => chrome.bookmarks.remove(cb.dataset.id, resolve));
      }
      displayBookmarksForFolder(getSelectedFolderId());
    }
  });

  editBtn.addEventListener('click', () => {
    const selectedCheckbox = bookmarkListContainer.querySelector('input[type="checkbox"]:checked');
    if (!selectedCheckbox) return;
    const bookmarkId = selectedCheckbox.dataset.id;
    chrome.bookmarks.get(bookmarkId, (bookmarks) => {
      if (bookmarks && bookmarks.length > 0) {
        const bookmark = bookmarks[0];
        editModalTitle.textContent = "Edit Bookmark";
        editBookmarkId.value = bookmark.id;
        editBookmarkTitle.value = bookmark.title;
        editBookmarkUrl.value = bookmark.url;
        editModalOverlay.classList.remove('hidden');
      }
    });
  });

  newBookmarkBtn.addEventListener('click', () => {
    editModalTitle.textContent = "New Bookmark";
    editForm.reset();
    editBookmarkId.value = '';
    editModalOverlay.classList.remove('hidden');
  });

  newCategoryBtn.addEventListener('click', () => {
    folderModalTitle.textContent = "New Category";
    folderForm.reset();
    editFolderId.value = '';
    folderModalOverlay.classList.remove('hidden');
  });

  cancelEditBtn.addEventListener('click', () => editModalOverlay.classList.add('hidden'));
  cancelFolderBtn.addEventListener('click', () => folderModalOverlay.classList.add('hidden'));

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = editBookmarkId.value;
    const title = editBookmarkTitle.value;
    const url = editBookmarkUrl.value;

    if (id) { // Editing
      chrome.bookmarks.update(id, { title, url }, () => {
        editModalOverlay.classList.add('hidden');
        displayBookmarksForFolder(getSelectedFolderId());
      });
    } else { // Creating
      chrome.bookmarks.create({ parentId: getSelectedFolderId(), title, url }, () => {
        editModalOverlay.classList.add('hidden');
        displayBookmarksForFolder(getSelectedFolderId());
      });
    }
  });

  folderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = editFolderId.value;
      const name = folderNameInput.value.trim();
      if (!name) return;

      if(id) { // Renaming
        chrome.bookmarks.update(id, { title: name }, () => {
            folderModalOverlay.classList.add('hidden');
            init();
        });
      } else { // Creating
        chrome.bookmarks.create({ parentId: getSelectedFolderId(), title: name }, () => {
            folderModalOverlay.classList.add('hidden');
            init();
        });
      }
  });

  // --- Initial Load ---
  async function init() {
    try {
      folderTreeContainer.innerHTML = '';
      dashboardFolder = await getDashboardFolder();
      if (dashboardFolder) {
        buildFolderTree(dashboardFolder, folderTreeContainer);
        const firstFolder = folderTreeContainer.querySelector('.folder-item');
        if (firstFolder) {
          firstFolder.classList.add('selected');
          displayBookmarksForFolder(firstFolder.dataset.folderId);
        }
      }
    } catch (error) {
      document.getElementById('main-content').innerHTML = `<h2>Error</h2><p>${error}</p>`;
      console.error(error);
    }
  }

  init();
});