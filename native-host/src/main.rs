use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::process::{Command, Stdio};
use url::Url;

#[derive(Debug, Deserialize)]
struct Request {
    url: String,
}

#[derive(Debug, Serialize)]
struct Response {
    ok: bool,
    error: Option<String>,
}

fn read_message<R: Read>(input: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut len_bytes = [0_u8; 4];
    match input.read_exact(&mut len_bytes) {
        Ok(()) => {
            let len = u32::from_le_bytes(len_bytes) as usize;
            let mut buf = vec![0_u8; len];
            input.read_exact(&mut buf)?;
            Ok(Some(buf))
        }
        Err(err) if err.kind() == io::ErrorKind::UnexpectedEof => Ok(None),
        Err(err) => Err(err),
    }
}

fn write_message<W: Write>(output: &mut W, response: &Response) -> io::Result<()> {
    let payload = serde_json::to_vec(response).map_err(io::Error::other)?;
    let len = (payload.len() as u32).to_le_bytes();
    output.write_all(&len)?;
    output.write_all(&payload)?;
    output.flush()?;
    Ok(())
}

fn validate_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|e| format!("Invalid URL: {e}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        other => Err(format!("Unsupported URL scheme: {other}")),
    }
}

fn open_in_default_browser(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to spawn xdg-open: {e}"))
}

fn handle(raw_message: &[u8]) -> Response {
    let request = match serde_json::from_slice::<Request>(raw_message) {
        Ok(value) => value,
        Err(err) => {
            return Response {
                ok: false,
                error: Some(format!("Invalid request payload: {err}")),
            }
        }
    };

    let parsed = match validate_url(&request.url) {
        Ok(value) => value,
        Err(err) => {
            return Response {
                ok: false,
                error: Some(err),
            }
        }
    };

    match open_in_default_browser(parsed.as_str()) {
        Ok(()) => Response {
            ok: true,
            error: None,
        },
        Err(err) => Response {
            ok: false,
            error: Some(err),
        },
    }
}

fn main() -> io::Result<()> {
    let stdin = io::stdin();
    let stdout = io::stdout();

    let mut input = stdin.lock();
    let mut output = stdout.lock();

    while let Some(message) = read_message(&mut input)? {
        let response = handle(&message);
        write_message(&mut output, &response)?;
    }

    Ok(())
}
