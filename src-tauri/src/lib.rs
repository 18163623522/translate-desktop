// 沉浸式免费翻译 · 桌面版（Tauri 2）
// M0/M1：托盘 + 主窗口 + HTTP 代理命令（绕过 webview CORS，直连服务商 API）

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

/// 系统级 HTTP POST（webview 直连服务商会撞 CORS，统一走 Rust 侧转发）
/// 返回响应体文本；非 2xx 时返回 Err("HTTP <code> <body前300字>")
#[tauri::command]
fn http_post_json(url: String, body: String, key: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("仅允许 https 请求".into());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build();
    let mut req = agent.post(&url).set("Content-Type", "application/json");
    if !key.is_empty() {
        req = req.set("Authorization", &format!("Bearer {}", key));
    }
    match req.send_string(&body) {
        Ok(res) => res.into_string().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, res)) => {
            let text = res.into_string().unwrap_or_default();
            let short: String = text.chars().take(300).collect();
            Err(format!("HTTP {} {}", code, short))
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn greet(name: String) -> String {
    format!("你好，{}！", name)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![http_post_json, greet])
        .setup(|app| {
            // 托盘：关闭窗口 = 最小化到托盘，不退出
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("沉浸式免费翻译")
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    } else if event.id() == "show" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;
            let main = app.get_webview_window("main").unwrap();
            main.clone().on_window_event(move |event| {
                // 点关闭 = 隐藏到托盘（不退出）
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let _ = api.prevent_close();
                    let _ = main.hide();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
