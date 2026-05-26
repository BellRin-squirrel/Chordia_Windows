window.BulkController = {
    scannedData:[],
    activeTags:[],
    currentEditIndex: -1,
    
    init: async function() {
        const u = window.AddMusicUtils;
        const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.tauri.invoke;
        
        // タブ切り替えの設定
        document.querySelectorAll('.tab-menu .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-menu .tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).style.display = 'block';
            });
        });

        // ボタンイベント
        document.getElementById('btnFetchBulk').addEventListener('click', () => this.fetchPlaylist());
        document.getElementById('btnSubmitBulk').addEventListener('click', () => this.executeBulkImport());

        // モーダルの共通閉じる処理
        const closeModals = () => {
            document.querySelectorAll('.modal-overlay').forEach(m => {
                if (m.classList.contains('show')) {
                    m.classList.remove('show');
                    setTimeout(() => m.style.display = 'none', 300);
                    if (m.id === 'youtubeModal') {
                        document.getElementById('youtubeIframe').src = "";
                    }
                }
            });
        };
        
        const setClose = (id) => { const el = document.getElementById(id); if(el) el.onclick = closeModals; };
        setClose('btnCloseYoutube');
        setClose('btnCancelBulkLyric');
        setClose('btnCloseBulkLyricModalX');
        setClose('btnCancelBulkArt');
        setClose('btnCloseBulkArtModalX');
        setClose('btnCancelBulkDelete');
        
        // 歌詞保存
        document.getElementById('btnSaveBulkLyric').onclick = () => {
            this.scannedData[this.currentEditIndex].lyric = document.getElementById('bulkLyricTextArea').value;
            closeModals();
            u.showToast("反映しました", false);
        };
        
        // 自動歌詞取得 (LRCLIB)
        document.getElementById('btnAutoBulkLyric').onclick = async () => {
            const item = this.scannedData[this.currentEditIndex];
            if(!item.title || !item.artist) { u.showToast("タイトルとアーティストが必要です", true); return; }
            const btn = document.getElementById('btnAutoBulkLyric');
            const orgText = btn.textContent;
            btn.textContent = "検索中..."; btn.disabled = true;
            try {
                const res = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(item.title)}&artist_name=${encodeURIComponent(item.artist)}`);
                const data = await res.json();
                const filtered = data.filter(d => d.plainLyrics);
                if(filtered.length > 0) {
                    document.getElementById('bulkLyricTextArea').value = filtered[0].plainLyrics;
                    u.showToast("歌詞を取得しました", false);
                } else { u.showToast("見つかりませんでした", true); }
            } catch(e) { u.showToast("エラー", true); } finally { btn.textContent = orgText; btn.disabled = false; }
        };

        // --- 新規：一括アートワークモーダル ミニタブ切り替え ---
        const bulkArtMiniTabs = document.querySelectorAll('#bulkArtTabsMini .art-mini-tab-btn');
        bulkArtMiniTabs.forEach(btn => {
            btn.onclick = () => {
                const target = btn.dataset.target;
                bulkArtMiniTabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.art-mini-tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const targetContent = document.getElementById(target);
                if (targetContent) targetContent.classList.add('active');
                showBulkArtError("");
            };
        });

        // アートワークローカルファイル選択
        const artPreview = document.getElementById('currentBulkArtPreview');
        document.getElementById('newBulkArtInput').onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                artPreview.src = ev.target.result;
                document.getElementById('bulkArtStatusText').textContent = "新しい画像 (反映前)";
                showBulkArtError("");
            };
            reader.readAsDataURL(file);
        };

        // 新規：動画サムネイルを取得
        document.getElementById('btnFetchBulkVideoArt').onclick = async () => {
            const url = document.getElementById('bulkMiniVideoUrl').value.trim();
            showBulkArtError("");
            if (!url) { showBulkArtError("URLを入力してください"); return; }

            const btn = document.getElementById('btnFetchBulkVideoArt');
            const orgText = btn.textContent;
            btn.disabled = true; btn.textContent = "確認中...";

            try {
                const status = await invoke("check_tools_status");
                if (!status['yt-dlp'] || !status['ffmpeg']) {
                    showBulkArtError("拡張機能が不足しています");
                    return;
                }

                btn.textContent = "取得中...";
                const info = await invoke("fetch_video_info", { url: url });
                if (info.status === 'success' && info.thumbnail) {
                    btn.textContent = "画像を変換中...";
                    const b64 = await invoke("fetch_and_crop_thumbnail", { url: info.thumbnail });
                    if (b64) {
                        artPreview.src = b64;
                        document.getElementById('bulkArtStatusText').textContent = "動画サムネイル (反映前)";
                        u.showToast("サムネイルを取得しました");
                    } else { showBulkArtError("画像の加工に失敗しました"); }
                } else { showBulkArtError(info.message || "動画情報の取得に失敗しました"); }
            } catch(e) { showBulkArtError("エラーが発生しました"); }
            finally { btn.disabled = false; btn.textContent = orgText; }
        };

        // 新規：画像URLから直接取得
        document.getElementById('btnFetchBulkDirectArt').onclick = async () => {
            const url = document.getElementById('bulkMiniImageUrl').value.trim();
            showBulkArtError("");
            if (!url) { showBulkArtError("URLを入力してください"); return; }

            const btn = document.getElementById('btnFetchBulkDirectArt');
            const orgText = btn.textContent;
            btn.disabled = true; btn.textContent = "取得中...";

            try {
                const res = await invoke("fetch_and_crop_image_url", { url: url });
                if (res.status === 'success') {
                    artPreview.src = res.data;
                    document.getElementById('bulkArtStatusText').textContent = "画像URL (反映前)";
                    u.showToast("画像を取得しました");
                } else { showBulkArtError("取得失敗: " + res.message); }
            } catch(e) { showBulkArtError("通信エラーが発生しました"); }
            finally { btn.disabled = false; btn.textContent = orgText; }
        };

        // 新規：画像を削除（初期化）
        document.getElementById('btnExecBulkRemoveArt').onclick = () => {
            artPreview.src = "REMOVE";
            document.getElementById('bulkArtStatusText').textContent = "削除予定 (反映前)";
            showBulkArtError("");
        };

        // 反映保存
        document.getElementById('btnSaveBulkArt').onclick = async () => {
            const isRemove = (artPreview.src === "REMOVE" || artPreview.src.includes("REMOVE"));
            const defaultArt = await invoke("get_default_art_url");
            const src = isRemove ? defaultArt : artPreview.src;
            
            this.scannedData[this.currentEditIndex].artwork_base64 = src;
            closeModals();
            this.renderTable();
            u.showToast("反映しました", false);
        };

        // ヘルパー：エラー表示制御
        function showBulkArtError(msg) {
            const errEl = document.getElementById('bulkArtErrorDisplay');
            if (!errEl) return;
            if (msg) {
                errEl.textContent = "⚠️ " + msg;
                errEl.style.display = 'block';
            } else {
                errEl.style.display = 'none';
                errEl.textContent = "";
            }
        }
    },

    updateData: function(idx, key, val) {
        if (this.scannedData[idx]) {
            this.scannedData[idx][key] = val;
        }
    }
};