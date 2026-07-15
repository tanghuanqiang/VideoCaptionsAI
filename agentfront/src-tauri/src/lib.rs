use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct PythonBackend(Mutex<Option<Child>>);

fn start_python_backend(app_handle: &tauri::AppHandle) -> Option<Child> {
    // Get the directory where the Tauri exe lives
    let exe_dir = app_handle
        .path()
        .resource_dir()
        .ok()?;

    // Look for bundled Python backend in resources/python-backend/
    let python_exe = exe_dir.join("python-backend").join("python.exe");
    let main_py = exe_dir.join("python-backend").join("main_exe.py");

    let child = if python_exe.exists() && main_py.exists() {
        println!("Starting bundled Python backend...");
        let mut cmd = Command::new(&python_exe);
        cmd.arg(&main_py)
            .current_dir(exe_dir.join("python-backend"))
            .env("PORT", "58000");
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.spawn().ok()?
    } else {
        // Dev mode: look for python in parent directories
        println!("Dev mode: looking for system Python...");
        let project_root = exe_dir
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .unwrap_or(&exe_dir)
            .to_path_buf();

        let mut cmd = Command::new("python");
        cmd.arg("VideoSubs/main_exe.py")
            .current_dir(&project_root)
            .env("PORT", "58000");
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        cmd.spawn().ok()?
    };

    println!("Python backend started (PID: {})", child.id());
    Some(child)
}

fn wait_for_server(url: &str, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_secs(timeout_secs) {
        match reqwest::blocking::get(url) {
            Ok(resp) if resp.status().is_success() => {
                println!("Server ready: {}", url);
                return true;
            }
            _ => std::thread::sleep(Duration::from_millis(500)),
        }
    }
    println!("Server did not start within {} seconds", timeout_secs);
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Start Python backend
            let child = start_python_backend(app.handle());
            app.manage(PythonBackend(Mutex::new(child)));

            // Wait up to 60 seconds for Python server to be ready
            wait_for_server("http://127.0.0.1:58000", 60);

            Ok(())
        })
        .on_window_event(|window, event| {
            use tauri::WindowEvent;
            if let WindowEvent::Destroyed = event {
                // Kill Python process when all windows close
                let app = window.app_handle();
                if let Some(state) = app.try_state::<PythonBackend>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(ref mut child) = *guard {
                            println!("Shutting down Python backend...");
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}