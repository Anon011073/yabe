document.addEventListener('DOMContentLoaded', () => {
  // --- Constants ---
  const DASHBOARD_FOLDER_NAME = "Dashboard Bookmarks";

  // --- Element Selectors ---
  const folderTreeContainer = document.getElementById('folder-tree');
  const bookmarkListContainer = document.getElementById('bookmark-list');
  const currentFolderNameEl = document.getElementById('current-folder-name');

  // --- State ---
  let dashboardFolder = null;

  // --- Helper Functions ---
  function getDashboardFolder() {
    return new Promise((resolve, reject) => {
      // Search for the folder by its title to find it anywhere in the tree.
      chrome.bookmarks.search({ title: DASHBOARD_FOLDER_NAME }, (results) => {
        const appFolderInfo = results.find(node => !node.url); // Ensure it's a folder

        if (appFolderInfo) {
          // Get the full folder node with its children to build the tree
          chrome.bookmarks.getSubTree(appFolderInfo.id, (subTree) => {
            if (subTree && subTree.length > 0) {
              resolve(subTree[0]);
            } else {
              reject("Could not retrieve the Dashboard Bookmarks folder tree.");
            }
          });
        } else {
          reject("Dashboard Bookmarks folder not found. Please add bookmarks or categories via the options page first.");
        }
      });
    });
  }

  // --- UI Functions ---

  /**
   * Recursively builds the folder tree in the sidebar.
   * @param {BookmarkTreeNode} node The current bookmark node.
   * @param {HTMLElement} parentElement The HTML element to append the tree to.
   * @param {number} level The current depth for indentation.
   */
  function buildFolderTree(node, parentElement, level = 0) {
    if (!node.children) return; // Only process folders

    const folderElement = document.createElement('div');
    folderElement.className = 'folder-item';
    folderElement.textContent = node.title === DASHBOARD_FOLDER_NAME ? 'All Bookmarks' : node.title;
    folderElement.style.paddingLeft = `${level * 15}px`;
    folderElement.dataset.folderId = node.id;

    folderElement.addEventListener('click', (e) => {
      e.stopPropagation();
      displayBookmarksForFolder(node.id);

      // Highlight selected folder
      document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('selected'));
      folderElement.classList.add('selected');
    });

    parentElement.appendChild(folderElement);

    node.children.filter(child => !child.url).forEach(childNode => {
        buildFolderTree(childNode, parentElement, level + 1);
    });
  }

  /**
   * Displays the bookmarks for a given folder ID in the main content area.
   * @param {string} folderId The ID of the folder to display.
   */
  function displayBookmarksForFolder(folderId) {
    bookmarkListContainer.innerHTML = '';
    chrome.bookmarks.getChildren(folderId, (children) => {
      const currentFolder = findFolderNode(dashboardFolder, folderId);
      currentFolderNameEl.textContent = currentFolder.title === DASHBOARD_FOLDER_NAME ? 'All Bookmarks' : currentFolder.title;

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
      // After displaying, ensure the action buttons are in the correct state
      updateActionButtonsState();
    });
  }

  /**
   * Helper to find a folder node in the tree by its ID.
   * @param {BookmarkTreeNode} rootNode
   * @param {string} folderId
   * @returns {BookmarkTreeNode | null}
   */
  function findFolderNode(rootNode, folderId) {
      if (rootNode.id === folderId) return rootNode;
      if (rootNode.children) {
          for (const child of rootNode.children) {
              if (!child.url) { // only search in folders
                  const found = findFolderNode(child, folderId);
                  if (found) return found;
              }
          }
      }
      return null;
  }

  // --- Action Handlers ---
  const selectAllBtn = document.getElementById('select-all-btn');
  const deleteBtn = document.getElementById('delete-btn');

  function updateActionButtonsState() {
    const selectedCheckboxes = bookmarkListContainer.querySelectorAll('input[type="checkbox"]:checked');
    deleteBtn.disabled = selectedCheckboxes.length === 0;
    // We can add edit button logic here later
  }

  bookmarkListContainer.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      updateActionButtonsState();
    }
  });

  selectAllBtn.addEventListener('click', () => {
    const allCheckboxes = bookmarkListContainer.querySelectorAll('input[type="checkbox"]');
    // If some are checked, uncheck all. Otherwise, check all.
    const shouldCheckAll = bookmarkListContainer.querySelectorAll('input[type="checkbox"]:not(:checked)').length > 0;
    allCheckboxes.forEach(cb => cb.checked = shouldCheckAll);
    updateActionButtonsState();
  });

  deleteBtn.addEventListener('click', async () => {
    const selectedCheckboxes = bookmarkListContainer.querySelectorAll('input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) return;

    if (confirm(`Are you sure you want to delete ${selectedCheckboxes.length} bookmark(s)?`)) {
      for (const cb of selectedCheckboxes) {
        await new Promise(resolve => chrome.bookmarks.remove(cb.dataset.id, resolve));
      }

      // Refresh the view
      const selectedFolder = document.querySelector('.folder-item.selected');
      if (selectedFolder) {
        displayBookmarksForFolder(selectedFolder.dataset.folderId);
      }
    }
  });

  // --- Initial Load ---
  async function init() {
    try {
      dashboardFolder = await getDashboardFolder();
      buildFolderTree(dashboardFolder, folderTreeContainer);
      displayBookmarksForFolder(dashboardFolder.id); // Display root by default
      document.querySelector('.folder-item').classList.add('selected'); // Highlight root
    } catch (error) {
      document.getElementById('main-content').innerHTML = `<h2>Error</h2><p>${error}</p>`;
      console.error(error);
    }
  }

  init();
});