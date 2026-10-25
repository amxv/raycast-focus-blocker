//! Local, read-only configuration bridge. The browser enforces all URL rules.
//! This service never proxies, records, or receives visited URLs.

use std::{
    env, fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    thread,
    time::{Duration, Instant},
};

const PORT: u16 = 47846;
const MAX_CLIENTS: usize = 24;

struct Shared {
    generation: Mutex<u64>,
    signal: Condvar,
    clients: Mutex<usize>,
    config_path: PathBuf,
}

struct ClientGuard(Arc<Shared>);

impl Drop for ClientGuard {
    fn drop(&mut self) {
        if let Ok(mut clients) = self.0.clients.lock() {
            *clients -= 1;
        }
    }
}

fn config_path() -> PathBuf {
    if let Some(root) = env::var_os("FOCUS_BLOCKER_HOME") {
        return PathBuf::from(root).join("state.json");
    }
    let home = env::var_os("HOME").expect("HOME must be set");
    PathBuf::from(home)
        .join(".config")
        .join("focus-blocker")
        .join("state.json")
}

fn read_config(file: &PathBuf) -> std::io::Result<(Vec<u8>, u64)> {
    let bytes = fs::read(file)?;
    if bytes.len() > 512 * 1024 {
        return Err(std::io::Error::other("State file too large"));
    }
    let data: serde_json::Value = serde_json::from_slice(&bytes)?;
    let revision = data
        .get("revision")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| std::io::Error::other("State revision is missing"))?;
    if data.get("version").and_then(serde_json::Value::as_u64) != Some(1)
        || !data.get("rules").is_some_and(serde_json::Value::is_array)
    {
        return Err(std::io::Error::other("Invalid state"));
    }
    Ok((bytes, revision))
}

fn response(stream: &mut TcpStream, status: &str, body: &[u8]) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        body.len()
    )?;
    stream.write_all(body)
}

fn serve(mut stream: TcpStream, shared: Arc<Shared>) {
    let _guard = ClientGuard(shared.clone());
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let mut header = [0u8; 8192];
    let Ok(length) = stream.read(&mut header) else {
        return;
    };
    let Some(head) = std::str::from_utf8(&header[..length]).ok() else {
        return;
    };
    if !head.contains("\r\n\r\n")
        || !head.contains(&format!("\r\nHost: 127.0.0.1:{PORT}\r\n"))
            && !head.contains(&format!("\r\nhost: 127.0.0.1:{PORT}\r\n"))
    {
        let _ = response(&mut stream, "403 Forbidden", br#"{"error":"Invalid host"}"#);
        return;
    }
    let Some(request_line) = head.lines().next() else {
        return;
    };

    if request_line == "POST /changed HTTP/1.1" {
        // No request body is accepted; callers may only wake existing watchers.
        if let Ok(mut generation) = shared.generation.lock() {
            *generation += 1;
            shared.signal.notify_all();
        }
        let _ = response(&mut stream, "200 OK", br#"{"ok":true}"#);
        return;
    }

    let is_watch = request_line.starts_with("GET /watch?since=");
    if request_line != "GET /state HTTP/1.1" && !is_watch {
        let _ = response(&mut stream, "404 Not Found", br#"{"error":"Not found"}"#);
        return;
    }

    if is_watch {
        let since = request_line
            .strip_prefix("GET /watch?since=")
            .and_then(|s| s.strip_suffix(" HTTP/1.1"))
            .and_then(|s| s.parse::<u64>().ok());
        let Some(since) = since else {
            let _ = response(
                &mut stream,
                "400 Bad Request",
                br#"{"error":"Invalid revision"}"#,
            );
            return;
        };
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut generation = shared.generation.lock().unwrap();
        while let Ok((_, revision)) = read_config(&shared.config_path) {
            if revision > since || Instant::now() >= deadline {
                break;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            let (guard, _) = shared.signal.wait_timeout(generation, remaining).unwrap();
            generation = guard;
        }
        drop(generation);
    }

    match read_config(&shared.config_path) {
        Ok((data, _)) => {
            let _ = response(&mut stream, "200 OK", &data);
        }
        Err(error) => {
            eprintln!("Focus Blocker state unavailable: {error}");
            let _ = response(
                &mut stream,
                "503 Service Unavailable",
                br#"{"error":"State unavailable"}"#,
            );
        }
    }
}

fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", PORT))?;
    let shared = Arc::new(Shared {
        generation: Mutex::new(0),
        signal: Condvar::new(),
        clients: Mutex::new(0),
        config_path: config_path(),
    });
    for incoming in listener.incoming() {
        let stream = incoming?;
        let mut clients = shared.clients.lock().unwrap();
        if *clients >= MAX_CLIENTS {
            drop(clients);
            let _ = stream.shutdown(std::net::Shutdown::Both);
            continue;
        }
        *clients += 1;
        drop(clients);
        let state = shared.clone();
        thread::spawn(move || serve(stream, state));
    }
    Ok(())
}
