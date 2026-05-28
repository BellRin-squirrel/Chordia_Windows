use serde_json::Value;
use tauri::{AppHandle, Emitter};
use std::fs;
use std::io::Read;
use crate::utils::get_base_dir;

#[tauri::command]
pub async fn check_tool_updates() -> Result<Value, String> {
    let base = get_base_dir().join("userfiles/bin");
    let mut results = serde_json::Map::new();

    for tool in ["yt-dlp", "ffmpeg", "deno"] {
        let exe_path = base.join(format!("{}.exe", tool));
        let exists = exe_path.exists();
        let local = if exists { "インストール済み".to_string() } else { "未インストール".to_string() };
        results.insert(tool.to_string(), serde_json::json!({
            "updateNeeded": !exists,
            "localVersion": local,
            "latestVersion": "最新版"
        }));
    }
    Ok(Value::Object(results))
}

#[tauri::command]
pub async fn install_tool(tool_name: String, app: AppHandle) -> Result<(), String> {
    // ネットワークI/Oとファイル処理でUIをブロックしないように非同期スレッドへ逃がす
    tokio::task::spawn_blocking(move || {
        let base_dir = get_base_dir().join("userfiles/bin");
        let _ = fs::create_dir_all(&base_dir);
        
        let url = match tool_name.as_str() {
            "yt-dlp" => "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
            "ffmpeg" => "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
            "deno" => "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip",
            _ => return Err(format!("不明なツールです: {}", tool_name)),
        };

        let client = reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0")
            .build()
            .map_err(|e| e.to_string())?;
            
        let mut response = client.get(url).send().map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("ダウンロードに失敗しました: {}", response.status()));
        }
        
        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        let mut buffer = vec![0; 32768]; // 32KBバッファ
        let mut data = Vec::new();
        
        loop {
            let bytes_read = response.read(&mut buffer).map_err(|e| e.to_string())?;
            if bytes_read == 0 { break; }
            data.extend_from_slice(&buffer[..bytes_read]);
            downloaded += bytes_read as u64;
            
            // フロントエンドに進捗をリアルタイムで送信
            let _ = app.emit("update_ext_download_progress", serde_json::json!({
                "toolName": tool_name,
                "downloaded": downloaded,
                "total": total_size
            }));
        }

        // 解凍フェーズのUI更新シグナル
        let _ = app.emit("update_ext_download_progress", serde_json::json!({
            "toolName": tool_name,
            "downloaded": "extracting",
            "total": total_size
        }));

        let exe_path = base_dir.join(format!("{}.exe", tool_name));

        if url.ends_with(".zip") {
            let cursor = std::io::Cursor::new(data);
            let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
            let mut extracted = false;
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                let name = file.name().to_lowercase();
                if name.ends_with(&format!("{}.exe", tool_name)) {
                    let mut out = fs::File::create(&exe_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
                    extracted = true;
                    break;
                }
            }
            if !extracted {
                return Err(format!("ZIP内に {}.exe が見つかりませんでした", tool_name));
            }
        } else {
            fs::write(&exe_path, data).map_err(|e| e.to_string())?;
        }

        Ok(())
    }).await.map_err(|e| e.to_string())?
}