"""A minimal mock of an OpenAI-compatible chat-completions endpoint.

Used to verify the provider path end to end (request shape, headers, JSON
parsing, citation grounding) without sending anything to a real provider.

    python scripts/mock_llm_provider.py [port]
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099

ANSWER = {
    "answer": "The published express fee is 6325 taka.",
    "used_chunk_ids": ["__FIRST_CHUNK__"],
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the test output quiet
        pass

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            request = json.loads(raw.decode("utf-8"))
        except ValueError:
            request = {}

        prompt = ""
        for message in request.get("messages", []):
            prompt += str(message.get("content", ""))

        chunk_id = "__FIRST_CHUNK__"
        for candidate in prompt.split("chunk_id=")[1:]:
            chunk_id = candidate.split(" ")[0]
            break

        payload = {
            "answer": ANSWER["answer"],
            "used_chunk_ids": [chunk_id],
        }
        body = json.dumps({
            "choices": [{"message": {"content": json.dumps(payload, ensure_ascii=False)}}],
            "usage": {"total_tokens": 42},
        }).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"mock provider listening on http://127.0.0.1:{PORT}/v1")
    server.serve_forever()
