"""Check real MP4 range bodies without downloading an unbounded 200 response.

Manual production diagnostic; intentionally separate from the static-site checks.
"""
import concurrent.futures
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def sample(url, start, total=None):
    end = start + 1023
    request = urllib.request.Request(url, headers={
        "Range": f"bytes={start}-{end}", "Accept-Encoding": "identity",
        "User-Agent": "PlutonoC-range-verification", "Cache-Control": "no-cache",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        status = response.status
        headers = response.headers
        # If Range was ignored, stop after 1 KB rather than reading the whole movie.
        body = response.read(1025 if status == 206 else 1024)
        content_range = headers.get("Content-Range", "")
        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
        size = int(match[3]) if match else int(headers.get("Content-Length", "0"))
        valid = bool(status == 206 and match and int(match[1]) == start
                     and int(match[2]) == end and len(body) == 1024
                     and int(headers.get("Content-Length", "-1")) == 1024
                     and (total is None or size == total))
        return {"requested": f"bytes={start}-{end}", "status": status,
                "contentRange": content_range, "contentLength": headers.get("Content-Length"),
                "acceptRanges": headers.get("Accept-Ranges"), "server": headers.get("Server"),
                "totalBytes": size, "sampleBytes": len(body),
                "sampleSha256": hashlib.sha256(body).hexdigest(), "passed": valid}


def check(video):
    try:
        first = sample(video["videoUrl"], 0)
        total = first["totalBytes"]
        if total < 2048:
            raise ValueError("Could not determine the MP4 length")
        samples = [first, sample(video["videoUrl"], total // 2, total),
                   sample(video["videoUrl"], total - 1024, total)]
        return {"id": video["id"], "url": video["videoUrl"], "samples": samples,
                "passed": all(row["passed"] for row in samples)}
    except Exception as error:
        return {"id": video["id"], "passed": False, "error": str(error)}


if __name__ == "__main__":
    videos = json.loads((ROOT / "content/videos.json").read_text(encoding="utf-8"))["items"]
    direct = [v for v in videos if ".tcloudbaseapp.com/" in v.get("videoUrl", "")]
    if not direct:
        raise SystemExit("No configured CloudBase videos")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        result = list(executor.map(check, direct))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if all(row["passed"] for row in result) else 1)
