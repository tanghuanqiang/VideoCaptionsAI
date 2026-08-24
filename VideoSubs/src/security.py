"""Security helpers shared by the local FastAPI service."""

from ipaddress import ip_address
from typing import Any, Mapping, Optional


LOCAL_ORIGIN_REGEX = r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$"
SECRET_CONFIG_FIELDS = ("llm_api_key", "tavily_api_key")


def is_loopback_host(host: Optional[str]) -> bool:
    """Return whether an HTTP peer is local to this machine."""
    if not host:
        return False
    normalized = host.split("%", 1)[0].strip().lower()
    if normalized in {"localhost", "testclient"}:
        return True
    try:
        return ip_address(normalized).is_loopback
    except ValueError:
        return False


def redact_config_for_client(config: Mapping[str, Any]) -> dict[str, Any]:
    """Keep configuration metadata usable by the UI without exposing secrets."""
    public_config = dict(config)
    for field in SECRET_CONFIG_FIELDS:
        public_config[f"{field}_configured"] = bool(public_config.get(field))
        public_config[field] = ""
    return public_config
