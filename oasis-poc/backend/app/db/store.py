from __future__ import annotations

import json
import os
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import Depends

from app.core.config import Settings, get_settings


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp_path, path)


def _empty_state() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "projects": {},
        "assessments": {},
        "versions": {},
        "feedback": {},
        "prompt_templates": {},
    }


class OasisStore:
    """
    Minimal JSON-file persistence for PoC workflows (projects -> assessments -> versioned runs).

    This is intentionally lightweight (no DB) and should not be treated as production storage.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = Lock()

    def _load_unlocked(self) -> dict[str, Any]:
        if not self._path.exists():
            return _empty_state()
        raw = self._path.read_text(encoding="utf-8").strip()
        if not raw:
            return _empty_state()
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Invalid store format: expected JSON object.")
        return {
            **_empty_state(),
            **data,
        }

    def _save_unlocked(self, data: dict[str, Any]) -> None:
        _atomic_write_json(self._path, data)

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock:
            data = self._load_unlocked()
            projects = list(data["projects"].values())
        return sorted(projects, key=lambda p: p.get("updated_at") or "", reverse=True)

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._load_unlocked()
            return data["projects"].get(project_id)

    def create_project(self, name: str, description: str | None = None) -> dict[str, Any]:
        now = _utc_now_iso()
        project_id = uuid4().hex
        record: dict[str, Any] = {
            "project_id": project_id,
            "name": name,
            "description": description,
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            data = self._load_unlocked()
            data["projects"][project_id] = record
            self._save_unlocked(data)
        return record

    def list_assessments(self, project_id: str) -> list[dict[str, Any]]:
        with self._lock:
            data = self._load_unlocked()
            assessments = [
                a for a in data["assessments"].values() if a.get("project_id") == project_id
            ]
        return sorted(assessments, key=lambda a: a.get("updated_at") or "", reverse=True)

    def get_assessment(self, assessment_id: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._load_unlocked()
            return data["assessments"].get(assessment_id)

    def create_assessment(
        self,
        project_id: str,
        title: str,
        template_id: str | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        assessment_id = uuid4().hex
        record: dict[str, Any] = {
            "assessment_id": assessment_id,
            "project_id": project_id,
            "title": title,
            "template_id": template_id,
            "created_at": now,
            "updated_at": now,
            "payload": payload,
            "version_count": 0,
            "version_ids": [],
            "latest_version_id": None,
        }
        with self._lock:
            data = self._load_unlocked()
            if project_id not in data["projects"]:
                raise KeyError("Project not found.")
            data["assessments"][assessment_id] = record
            data["projects"][project_id]["updated_at"] = now
            self._save_unlocked(data)
        return record

    def create_version(
        self,
        assessment_id: str,
        *,
        request_payload: dict[str, Any],
        response_payload: dict[str, Any],
        trace_id: str,
        mode: str,
        resolved_mode: str,
        llm_provider: str,
        llm_model: str,
        prompt_variant: str,
        system_prompt_sha256: str,
        user_prompt: str,
        rag_enabled: bool | None = None,
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        version_id = uuid4().hex
        with self._lock:
            data = self._load_unlocked()
            assessment = data["assessments"].get(assessment_id)
            if not assessment:
                raise KeyError("Assessment not found.")
            version_number = int(assessment.get("version_count") or 0) + 1
            record: dict[str, Any] = {
                "version_id": version_id,
                "assessment_id": assessment_id,
                "version_number": version_number,
                "created_at": now,
                "trace_id": trace_id,
                "mode": mode,
                "resolved_mode": resolved_mode,
                "llm_provider": llm_provider,
                "llm_model": llm_model,
                "prompt_variant": prompt_variant,
                "system_prompt_sha256": system_prompt_sha256,
                "user_prompt": user_prompt,
                "rag_enabled": rag_enabled,
                "request": request_payload,
                "response": response_payload,
                "feedback_ids": [],
            }

            data["versions"][version_id] = record
            assessment["version_count"] = version_number
            assessment.setdefault("version_ids", []).append(version_id)
            assessment["latest_version_id"] = version_id
            assessment["payload"] = request_payload
            assessment["updated_at"] = now

            project_id = assessment.get("project_id")
            if project_id and project_id in data["projects"]:
                data["projects"][project_id]["updated_at"] = now
            self._save_unlocked(data)
        return record

    def list_versions(self, assessment_id: str) -> list[dict[str, Any]]:
        with self._lock:
            data = self._load_unlocked()
            assessment = data["assessments"].get(assessment_id)
            if not assessment:
                raise KeyError("Assessment not found.")
            version_ids = assessment.get("version_ids") or []
            versions = [data["versions"][vid] for vid in version_ids if vid in data["versions"]]
        return sorted(versions, key=lambda v: int(v.get("version_number") or 0), reverse=True)

    def get_version(self, version_id: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._load_unlocked()
            return data["versions"].get(version_id)

    def list_recent_versions(self, limit: int = 50) -> list[dict[str, Any]]:
        capped = max(1, min(int(limit), 200))
        with self._lock:
            data = self._load_unlocked()
            versions = list(data.get("versions", {}).values())
        versions_sorted = sorted(versions, key=lambda v: v.get("created_at") or "", reverse=True)
        return versions_sorted[:capped]

    def create_feedback(
        self,
        assessment_id: str,
        version_id: str,
        *,
        rating: int | None,
        flags: list[str],
        comment: str | None,
        recommended_edits: str | None,
        reviewer: str | None,
    ) -> dict[str, Any]:
        now = _utc_now_iso()
        feedback_id = uuid4().hex
        record: dict[str, Any] = {
            "feedback_id": feedback_id,
            "assessment_id": assessment_id,
            "version_id": version_id,
            "created_at": now,
            "rating": rating,
            "flags": flags,
            "comment": comment,
            "recommended_edits": recommended_edits,
            "reviewer": reviewer,
        }
        with self._lock:
            data = self._load_unlocked()
            version = data["versions"].get(version_id)
            if not version:
                raise KeyError("Version not found.")
            if version.get("assessment_id") != assessment_id:
                # keep compatibility with older clients that may send mismatched assessment IDs
                assessment_id = version.get("assessment_id") or assessment_id
                record["assessment_id"] = assessment_id
            data["feedback"][feedback_id] = record
            version.setdefault("feedback_ids", []).append(feedback_id)
            self._save_unlocked(data)
        return record

    def list_feedback(self, assessment_id: str, version_id: str) -> list[dict[str, Any]]:
        with self._lock:
            data = self._load_unlocked()
            version = data["versions"].get(version_id)
            if not version:
                raise KeyError("Version not found.")
            if version.get("assessment_id") != assessment_id:
                assessment_id = version.get("assessment_id") or assessment_id
            feedback_ids = version.get("feedback_ids") or []
            items = [data["feedback"][fid] for fid in feedback_ids if fid in data["feedback"]]
        return sorted(items, key=lambda f: f.get("created_at") or "", reverse=True)

    def list_recent_feedback(self, limit: int = 50) -> list[dict[str, Any]]:
        capped = max(1, min(int(limit), 200))
        with self._lock:
            data = self._load_unlocked()
            feedback_items = list(data.get("feedback", {}).values())
        feedback_sorted = sorted(feedback_items, key=lambda f: f.get("created_at") or "", reverse=True)
        return feedback_sorted[:capped]

    def list_prompt_templates(self) -> list[dict[str, Any]]:
        with self._lock:
            data = self._load_unlocked()
            templates = list(data.get("prompt_templates", {}).values())
        return sorted(templates, key=lambda t: t.get("updated_at") or "", reverse=True)

    def get_prompt_template(self, name: str) -> dict[str, Any] | None:
        key = name.strip()
        if not key:
            return None
        with self._lock:
            data = self._load_unlocked()
            return (data.get("prompt_templates") or {}).get(key)

    def upsert_prompt_template(
        self,
        name: str,
        *,
        content: str,
        notes: str | None = None,
    ) -> dict[str, Any]:
        key = name.strip()
        if not key:
            raise ValueError("Template name is required.")
        if not content.strip():
            raise ValueError("Template content is required.")

        now = _utc_now_iso()
        sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
        with self._lock:
            data = self._load_unlocked()
            templates = data.setdefault("prompt_templates", {})
            existing = templates.get(key)
            if existing:
                current_version = int(existing.get("current_version") or 0) + 1
                existing["current_version"] = current_version
                existing["updated_at"] = now
                existing.setdefault("versions", []).append(
                    {
                        "version": current_version,
                        "created_at": now,
                        "sha256": sha,
                        "notes": notes,
                        "content": content,
                    }
                )
                templates[key] = existing
                self._save_unlocked(data)
                return existing

            record: dict[str, Any] = {
                "name": key,
                "created_at": now,
                "updated_at": now,
                "current_version": 1,
                "versions": [
                    {
                        "version": 1,
                        "created_at": now,
                        "sha256": sha,
                        "notes": notes,
                        "content": content,
                    }
                ],
            }
            templates[key] = record
            self._save_unlocked(data)
            return record


_STORE_CACHE: dict[str, OasisStore] = {}
_STORE_CACHE_LOCK = Lock()


def get_store(settings: Settings = Depends(get_settings)) -> OasisStore:
    with _STORE_CACHE_LOCK:
        store = _STORE_CACHE.get(settings.store_path)
        if store is None:
            store = OasisStore(Path(settings.store_path))
            _STORE_CACHE[settings.store_path] = store
        return store
