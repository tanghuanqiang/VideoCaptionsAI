import io

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient

from src.routers import burn
from src.security import is_loopback_host, redact_config_for_client
from src.services import caption_payload
from src.services.storage import UploadTooLargeError, save_upload_to_path


def test_loopback_detection_rejects_lan_and_public_addresses():
    assert is_loopback_host("127.0.0.1")
    assert is_loopback_host("::1")
    assert is_loopback_host("localhost")
    assert not is_loopback_host("192.168.1.10")
    assert not is_loopback_host("8.8.8.8")


def test_client_config_redacts_secret_values_but_reports_configuration():
    public = redact_config_for_client(
        {
            "llm_api_key": "secret-openai-key",
            "tavily_api_key": "secret-search-key",
            "llm_model_name": "gpt-4o",
        }
    )

    assert public["llm_api_key"] == ""
    assert public["tavily_api_key"] == ""
    assert public["llm_api_key_configured"] is True
    assert public["tavily_api_key_configured"] is True
    assert public["llm_model_name"] == "gpt-4o"


def test_local_service_blocks_remote_clients_and_never_returns_keys(monkeypatch):
    from src import app as application

    monkeypatch.setattr(
        application,
        "get_config",
        lambda: {
            "llm_api_key": "secret-openai-key",
            "tavily_api_key": "secret-search-key",
            "llm_model_name": "gpt-4o",
        },
    )

    remote_response = TestClient(application.app, client=("192.168.1.10", 4321)).get("/health")
    local_client = TestClient(application.app)
    local_response = local_client.get("/api/config")
    denied_origin = local_client.get("/health", headers={"Origin": "http://evil.example"})
    allowed_origin = local_client.options(
        "/api/config",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert remote_response.status_code == 403
    assert local_response.status_code == 200
    assert "secret-openai-key" not in local_response.text
    assert "secret-search-key" not in local_response.text
    assert local_response.json()["llm_api_key_configured"] is True
    assert denied_origin.headers.get("access-control-allow-origin") is None
    assert allowed_origin.status_code == 200
    assert allowed_origin.headers["access-control-allow-origin"] == "http://localhost:8080"


def test_ass_payload_limit_prevents_oversized_documents(monkeypatch):
    monkeypatch.setattr(caption_payload, "MAX_ASS_PAYLOAD_BYTES", 32)
    with pytest.raises(ValueError, match="maximum allowed size"):
        caption_payload.require_ass_text({"ass": "[Script Info]\n[Events]\n" + "x" * 100})


def test_streamed_upload_limit_removes_partial_file(tmp_path):
    destination = tmp_path / "upload.mp4"
    upload = UploadFile(filename="upload.mp4", file=io.BytesIO(b"0123456789"))

    with pytest.raises(UploadTooLargeError):
        save_upload_to_path(upload, str(destination), max_bytes=5)

    assert not destination.exists()
    assert upload.file.tell() == 0


def test_hard_burn_path_must_stay_inside_outputs(monkeypatch, tmp_path):
    outputs = tmp_path / "outputs"
    uploads = outputs / "uploads"
    uploads.mkdir(parents=True)
    persisted_video = uploads / "clip.mp4"
    persisted_video.write_bytes(b"video")
    external_video = tmp_path / "private.mp4"
    external_video.write_bytes(b"private")
    monkeypatch.setattr(burn._config, "OUTPUTS_DIR", str(outputs))

    assert burn._resolve_video_path("/outputs/uploads/clip.mp4") == str(persisted_video.resolve())
    assert burn._resolve_video_path(str(persisted_video.resolve())) == str(persisted_video.resolve())
    assert burn._resolve_video_path("../private.mp4") is None
    assert burn._resolve_video_path(str(external_video.resolve())) is None
