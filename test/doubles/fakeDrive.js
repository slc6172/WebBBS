// Minimal stand-in for the "drive" interface that imageStorage.js expects
// to be injected. Real DriveApp folder/file operations involve network
// calls to Google Drive we can't reproduce in Node — this fake keeps
// everything in memory instead, just enough to exercise
// getOrCreateRootFolder / getOrCreateMonthFolder / saveArticleImage /
// deleteArticleImage's orchestration logic.

function createFakeDrive() {
  var folders = {}; // id -> {id, name, parentId}
  var files = {};   // id -> {id, url, folderId, base64Data, mimeType, fileName}
  var nextId = 1;

  function makeId(prefix) {
    return prefix + '-' + (nextId++);
  }

  return {
    getFolderById: function (id) {
      return folders[id] || null;
    },
    createFolder: function (parentFolder, name) {
      var id = makeId('folder');
      var folder = { id: id, name: name, parentId: parentFolder ? parentFolder.id : null };
      folders[id] = folder;
      return folder;
    },
    listSubfolders: function (parentFolder) {
      return Object.keys(folders)
        .map(function (id) { return folders[id]; })
        .filter(function (f) { return f.parentId === parentFolder.id; })
        .map(function (f) { return { id: f.id, name: f.name }; });
    },
    saveFile: function (folder, base64Data, mimeType, fileName) {
      var id = makeId('file');
      var url = 'https://lh3.googleusercontent.com/d/' + id;
      files[id] = { id: id, url: url, folderId: folder.id, base64Data: base64Data, mimeType: mimeType, fileName: fileName };
      return { id: id, url: url };
    },
    deleteFile: function (id) {
      delete files[id];
    },
    // 測試專用的檢查窗口，不是介面的一部分
    _files: files,
    _folders: folders
  };
}

module.exports = { createFakeDrive: createFakeDrive };
