use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::process::{Command, Stdio};
use url::Url;

#[derive(Debug, Deserialize)]
struct Request {
    url: String,
    #[serde(default)]
    action: Action,
}

#[derive(Debug, Default, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Action {
    #[default]
    Default,
    DeepLink {
        url: String,
    },
    Command {
        program: String,
        args: Vec<String>,
    },
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

fn open_url(url: &str) -> Result<(), String> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    spawn_command(opener, &[url.to_owned()])
}

fn spawn_command(program: &str, args: &[String]) -> Result<(), String> {
    if program.trim().is_empty() || program.contains(['\0', '\n', '\r']) {
        return Err("Invalid executable name".to_owned());
    }
    if args.iter().any(|arg| arg.contains('\0')) {
        return Err("Arguments cannot contain NUL characters".to_owned());
    }
    // No shell evaluation: each configured argument stays a single argument,
    // even when the URL contains spaces, quotes or shell metacharacters.
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to spawn {program}: {e}"))
}

fn execute_action(source: &Url, action: &Action) -> Result<(), String> {
    match action {
        Action::Default => open_url(source.as_str()),
        Action::DeepLink { url } => {
            let target = Url::parse(url).map_err(|e| format!("Invalid deep link: {e}"))?;
            if matches!(
                target.scheme(),
                "http"
                    | "https"
                    | "file"
                    | "data"
                    | "javascript"
                    | "vbscript"
                    | "about"
                    | "chrome"
                    | "resource"
                    | "moz-extension"
                    | "chrome-extension"
                    | "cloe"
            ) {
                return Err("Deep links must use an application protocol".to_owned());
            }
            open_url(target.as_str())
        }
        Action::Command { program, args } => spawn_command(program, args),
    }
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

    match execute_action(&parsed, &request.action) {
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
