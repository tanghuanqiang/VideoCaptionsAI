import asyncio
import io

import pytest
from fastapi import UploadFile
from fastapi.exceptions import HTTPException
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
    request_id = "test-request-123"
    traced = local_client.get("/health", headers={"X-Request-ID": request_id})
    assert traced.headers["X-Request-ID"] == request_id


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


def test_queue_state_save_is_atomic_and_restart_safe(tmp_path):
    from src.utils.task_queue import Task, TaskQueue

    state_path = tmp_path / "queue" / "state.json"
    queue = TaskQueue(persistence_file=str(state_path))
    task_id = "task-1"
    queue.tasks[task_id] = Task(task_id, "demo", {})
    queue.save_state()

    restored = TaskQueue(persistence_file=str(state_path))
    restored.load_state()
    assert restored.get_task(task_id) is not None
    assert not list(state_path.parent.glob("*.tmp"))


def test_upload_uuid_index_recovers_after_process_restart(monkeypatch, tmp_path):
    from src.services import storage

    outputs = tmp_path / "outputs"
    outputs.mkdir()
    monkeypatch.setattr(storage, "OUTPUTS_DIR", str(outputs))
    storage.file_storage.clear()
    storage._index_loaded = False
    storage._index_loaded_path = None

    upload = UploadFile(filename="clip.mp4", file=io.BytesIO(b"video-bytes"))
    file_uuid, saved_path = storage.save_upload_with_uuid(upload, "user/with spaces")
    assert storage.get_file_path(file_uuid) == str((outputs / "uploads" / "user_with_spaces" / f"{file_uuid}.mp4").resolve())

    # Simulate a fresh process: only the durable index and file remain.
    storage.file_storage.clear()
    storage._index_loaded = False
    storage._index_loaded_path = None
    assert storage.get_file_path(file_uuid) == str(saved_path)


def test_copilot_sessions_are_isolated():
    import asyncio
    from src.connection_manager import ConnectionManager

    async def exercise():
        manager = ConnectionManager()
        first = await manager.connect("session-a")
        second = await manager.connect("session-b")
        await manager.send_personal_message("A", "session-a")
        await manager.send_personal_message("B", "session-b")
        assert await first.get() == "A"
        assert await second.get() == "B"
        manager.disconnect("session-a")
        manager.disconnect("session-b")

    asyncio.run(exercise())


def test_asr_cache_writer_never_leaves_partial_json(tmp_path):
    import json
    from concurrent.futures import ThreadPoolExecutor
    from src.routers.asr import _write_cache_atomically

    cache_file = tmp_path / "asr.json"

    def write(index):
        _write_cache_atomically(str(cache_file), {"index": index, "events": [index] * 3})

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(write, range(20)))

    payload = json.loads(cache_file.read_text(encoding="utf-8"))
    assert payload["index"] in range(20)
    assert payload["events"] == [payload["index"]] * 3
    assert not list(tmp_path.glob("*.tmp"))


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


def test_task_download_rejects_output_paths_outside_outputs(monkeypatch, tmp_path):
    from src.routers import tasks
    from src.utils.task_queue import Task, TaskStatus

    outputs = tmp_path / "outputs"
    outputs.mkdir()
    outside = tmp_path / "private.txt"
    outside.write_text("secret", encoding="utf-8")
    monkeypatch.setattr(tasks._config, "OUTPUTS_DIR", str(outputs))

    task = Task("deadbeef", "burn_task", {})
    task.status = TaskStatus.COMPLETED
    task.result = {"output_path": str(outside)}
    tasks.burn_queue.tasks[task.task_id] = task
    try:
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(tasks.download_burn_result(task.task_id, filename=None))
        assert exc_info.value.status_code == 404
        assert tasks._safe_download_filename("evil\r\n.mp4", "fallback.mp4") == "evil.mp4"
    finally:
        tasks.burn_queue.tasks.pop(task.task_id, None)
