document.addEventListener('DOMContentLoaded', () => {
    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;
    const listen = window.__TAURI__.event ? window.__TAURI__.event.listen : null;

    const u = {
        escapeHtml: (str) => str ? String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : '',
        showToast: (m, e) => {
            const t = document.getElementById('toast');
            t.textContent = m; t.className = 'toast show '+(e?'error':'success');
            setTimeout(()=>t.classList.remove('show'), 4000);
        },
        showAlert: (t, m) => {
            const modal = document.getElementById('alertModal');
            const btnOk = document.getElementById('btnAlertOk');
            const titleEl = document.getElementById('alertTitle');
            const msgEl = document.getElementById('alertMessage');
            
            if (titleEl) titleEl.textContent = t;
            if (msgEl) msgEl.textContent = m;
            
            if (modal) {
                modal.style.display = 'flex'; 
                setTimeout(() => modal.classList.add('show'), 10);
            }
            if (btnOk && modal) {
                btnOk.onclick = () => {
                    modal.classList.remove('show');
                    setTimeout(() => modal.style.display = 'none', 300);
                };
            }
        }
    };

    const progressArea = document.getElementById('progressArea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    if (listen) {
        listen('js_import_progress', (event) => {
            const data = event.payload;
            if (progressArea) progressArea.style.display = 'flex';
            if (progressText) progressText.textContent = data.message;
            if (progressBar) progressBar.style.width = (data.current / data.total * 100) + '%';
        });
    }

    let scannedData = [];
    let importMode = 'list'; 
    let currentZipPassword = ""; // ★ 展開用のパスワード保持変数

    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
            importMode = tab.dataset.tab === 'tab-list' ? 'list' : 'zip';
        });
    });

    function setupDragAndDrop(element, callback) {
        if (!element) return;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            element.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            element.addEventListener(eventName, () => element.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            element.addEventListener(eventName, () => element.classList.remove('dragover'), false);
        });
        element.addEventListener('drop', e => {
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) callback(e.dataTransfer.files[0]);
        });
    }

    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const btnScanList = document.getElementById('btnScanList');
    const fileInfo = document.getElementById('fileInfo');
    const listResultSection = document.getElementById('listResultSection');
    const listUploadSection = document.getElementById('listUploadSection');

    if(dropArea) dropArea.onclick = () => fileInput.click();
    if(fileInput) fileInput.onchange = (e) => handleListFile(e.target.files[0]);
    setupDragAndDrop(dropArea, handleListFile);

    function handleListFile(file) {
        if (!file) return;
        document.getElementById('fileName').textContent = file.name;
        dropArea.style.display = 'none';
        fileInfo.style.display = 'flex';
        btnScanList.disabled = false;
        window._selectedFile = file;
    }

    btnScanList.onclick = () => {
        const file = window._selectedFile;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const res = await invoke("parse_list_import", { content: e.target.result, fileType: ext });
            if (res.status === 'success') {
                scannedData = res.data;
                renderTable('list');
                listUploadSection.style.display = 'none';
                listResultSection.style.display = 'block';
            } else { u.showAlert("エラー", res.message); }
        };
        reader.readAsText(file);
    };

    const btnExecList = document.getElementById('btnExecListImport');
    if(btnExecList) btnExecList.onclick = () => handleFinalImportWithCheck('list');


    const dropAreaZip = document.getElementById('dropAreaZip');
    const fileInputZip = document.getElementById('fileInputZip');
    const zipFileInfo = document.getElementById('zipFileInfo');
    const zipFileName = document.getElementById('zipFileName');
    const btnClearZipFile = document.getElementById('btnClearZipFile');
    const btnScanZip = document.getElementById('btnScanZip');
    const zipUploadSection = document.getElementById('zipUploadSection');
    const zipResultSection = document.getElementById('zipResultSection');

    if(dropAreaZip) dropAreaZip.onclick = () => fileInputZip.click();
    if(fileInputZip) fileInputZip.onchange = (e) => handleZipFile(e.target.files[0]);
    setupDragAndDrop(dropAreaZip, handleZipFile);

    function handleZipFile(file) {
        if (!file) return;
        if (zipFileName) zipFileName.textContent = file.name;
        if (dropAreaZip) dropAreaZip.style.display = 'none';
        if (zipFileInfo) zipFileInfo.style.display = 'flex';
        if (btnScanZip) btnScanZip.disabled = false;
        window._selectedZipFile = file;
        currentZipPassword = ""; // ファイル変更時にパスワードをリセット
    }

    if(btnClearZipFile) {
        btnClearZipFile.onclick = () => {
            if(fileInputZip) fileInputZip.value = '';
            window._selectedZipFile = null;
            currentZipPassword = "";
            if(zipFileInfo) zipFileInfo.style.display = 'none';
            if(dropAreaZip) dropAreaZip.style.display = 'block';
            if(btnScanZip) btnScanZip.disabled = true;
            if(zipResultSection) zipResultSection.style.display = 'none';
            if(zipUploadSection) zipUploadSection.style.display = 'block';
        };
    }

    // ★ 修正：パスワード入力モーダルの制御
    if(btnScanZip) btnScanZip.onclick = () => {
        const file = window._selectedZipFile;
        if (!file) return;
        document.getElementById('zipPassword').value = '';
        const pModal = document.getElementById('passwordModal');
        pModal.style.display = 'flex';
        setTimeout(() => pModal.classList.add('show'), 10);
    };

    document.getElementById('btnCancelPass').onclick = () => {
        const pModal = document.getElementById('passwordModal');
        pModal.classList.remove('show');
        setTimeout(() => pModal.style.display = 'none', 300);
    };

    document.getElementById('btnSubmitPass').onclick = async () => {
        const passVal = document.getElementById('zipPassword').value;
        if (passVal.length > 128) {
            u.showToast("パスワードは128文字以内にしてください", true);
            return;
        }
        currentZipPassword = passVal;

        const pModal = document.getElementById('passwordModal');
        pModal.classList.remove('show');
        setTimeout(() => pModal.style.display = 'none', 300);

        const file = window._selectedZipFile;
        if (progressArea) progressArea.style.display = 'flex';
        if (progressText) progressText.textContent = "ZIPファイルを解析中...";
        
        try {
            const base64Data = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result.split(',')[1]);
                reader.readAsDataURL(file);
            });
            // パスワードを付与して解析
            const res = await invoke("scan_zip_import", { zipDataB64: base64Data, password: currentZipPassword });
            if (res.status === 'success') {
                scannedData = res.data;
                renderTable('zip');
                if(zipUploadSection) zipUploadSection.style.display = 'none';
                if(zipResultSection) zipResultSection.style.display = 'block';
            } else {
                u.showAlert("エラー", res.message);
            }
        } catch(err) {
            u.showAlert("エラー", "ZIP解析中にエラーが発生しました: " + err);
        } finally {
            if (progressArea) progressArea.style.display = 'none';
        }
    };

    const btnExecZipImport = document.getElementById('btnExecZipImport');
    if(btnExecZipImport) btnExecZipImport.onclick = () => handleFinalImportWithCheck('zip');

    async function handleFinalImportWithCheck(type) {
        const duplicates = await invoke("check_import_duplicates", { importList: scannedData });
        if (duplicates.length === 0) {
            executeRegistration(type, scannedData);
            return;
        }
        u.showToast(`${duplicates.length}曲が重複しています。全て上書き/追加登録します。`, true);
        executeRegistration(type, scannedData);
    }

    async function executeRegistration(type, dataList) {
        if (progressArea) progressArea.style.display = 'flex';
        if (progressText) progressText.textContent = "ライブラリへ登録中...";
        
        let res;
        if (type === 'list') {
            res = await invoke("execute_final_list_import", { importDataList: dataList });
        } else if (type === 'zip') {
            const file = window._selectedZipFile;
            const b64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result.split(',')[1]);
                reader.readAsDataURL(file);
            });
            res = await invoke("execute_zip_import", { zipDataB64: b64, importDataList: dataList, password: currentZipPassword });
        }
        
        if (progressArea) progressArea.style.display = 'none';
        if (res && res.status === 'success') {
            u.showAlert("完了", `${res.count}曲の登録が完了しました。`);
            if (type === 'list') {
                const btnClearFile = document.getElementById('btnClearFile');
                if(btnClearFile) btnClearFile.click();
            } else {
                const btnClearZipFile2 = document.getElementById('btnClearZipFile');
                if(btnClearZipFile2) btnClearZipFile2.click();
            }
        } else {
            u.showAlert("エラー", res ? res.message : "不明なエラーが発生しました");
        }
    }

    function renderTable(type) {
        const tbody = document.getElementById(type === 'list' ? 'listTableBody' : 'mp3TableBody');
        if(!tbody) return;
        tbody.innerHTML = '';
        scannedData.forEach((item, idx) => {
            const tr = document.createElement('tr');
            const pathName = item.musicFilename || item.relPath || '';
            const artImg = item.artworkBase64 || item.imageData || 'icon/Chordia.png';
            tr.innerHTML = `
                <td>${item.status || 'OK'}</td>
                <td>${idx+1}</td>
                <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis;" title="${u.escapeHtml(pathName)}">${u.escapeHtml(pathName)}</td>
                <td><img src="${artImg}" width="30" height="30" style="object-fit:cover; border-radius:4px;"></td>
                <td>${u.escapeHtml(item.title || '--')}</td>
                <td>${u.escapeHtml(item.artist || '--')}</td>
                <td>--</td>
            `;
            tbody.appendChild(tr);
        });
    }

    let currentEditIndex = -1;
    const btnAutoLyric = document.getElementById('btnAutoLyric');
    if (btnAutoLyric) {
        btnAutoLyric.onclick = async () => {
            const item = scannedData[currentEditIndex];
            if (!item || !item.title || !item.artist) {
                u.showToast("タイトルとアーティストが必要です", true);
                return;
            }
            const orgText = btnAutoLyric.textContent;
            btnAutoLyric.textContent = "検索中...";
            btnAutoLyric.disabled = true;

            try {
                const data = await invoke("search_lyrics_online", { title: item.title, artist: item.artist });

                if (data.statusCode === 404 || data.error) {
                    u.showToast("見つかりませんでした", true);
                    return;
                }

                if (!Array.isArray(data) || data.length === 0) {
                    u.showToast("見つかりませんでした", true);
                    return;
                }

                const filtered = data.filter(d => d.plainLyrics);
                if (filtered.length > 0) {
                    const list = document.getElementById('lyricResultList');
                    list.innerHTML = '';
                    filtered.forEach(d => {
                        const li = document.createElement('li');
                        li.style.padding = '10px'; li.style.cursor = 'pointer'; li.style.borderBottom = '1px solid rgba(128,128,128,0.2)';
                        li.innerHTML = `<strong>${u.escapeHtml(d.trackName)}</strong><br><small>${u.escapeHtml(d.artistName)}</small>`;
                        li.onclick = () => {
                            document.getElementById('lyricTextArea').value = d.plainLyrics;
                            document.getElementById('lyricSearchModal').classList.remove('show');
                        };
                        list.appendChild(li);
                    });
                    document.getElementById('lyricSearchModal').classList.add('show');
                } else {
                    u.showToast("見つかりませんでした", true);
                }
            } catch (e) {
                u.showToast("通信エラーが発生しました", true);
            } finally {
                btnAutoLyric.textContent = orgText;
                btnAutoLyric.disabled = false;
            }
        };
    }
});