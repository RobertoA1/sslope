"""Ensure build-only dependency cleanup cannot modify local training packages."""
import importlib.util
from pathlib import Path

import pytest


@pytest.fixture
def build_step():
    script = Path(__file__).resolve().parents[1] / "scripts/prepare-vercel-backend.py"
    spec = importlib.util.spec_from_file_location("vercel_backend_build", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_cleanup_refuses_local_training_environment(build_step, monkeypatch):
    monkeypatch.delenv("VERCEL_PYTHON_VENV_PATH", raising=False)
    with pytest.raises(SystemExit, match="must not run in a local training environment"):
        build_step.main()


def test_cleanup_refuses_an_unrelated_environment(build_step, monkeypatch, tmp_path):
    monkeypatch.setenv("VERCEL_PYTHON_VENV_PATH", str(tmp_path / "other-venv"))
    with pytest.raises(SystemExit, match="Refusing to modify packages"):
        build_step.main()


def test_cleanup_preserves_runtime_files_licenses_and_external_symlinks(build_step, monkeypatch, tmp_path):
    venv = tmp_path / "vercel-venv"
    site = venv / "lib/python3.12/site-packages"
    outside = tmp_path / "external-tests"
    outside.mkdir()
    (outside / "keep.py").write_text("external data")
    for package in ("numpy", "pandas", "scipy", "sklearn"):
        root = site / package
        (root / "tests/nested/tests").mkdir(parents=True)
        (root / "tests/test_runtime.py").write_text("test fixtures")
        (root / "runtime.py").write_text("runtime code")
        (root / "LICENSE").write_text("license")
    (site / "numpy/submodule").mkdir()
    (site / "numpy/submodule/tests").symlink_to(outside, target_is_directory=True)
    monkeypatch.setenv("VERCEL_PYTHON_VENV_PATH", str(venv))
    monkeypatch.setattr(build_step.sys, "prefix", str(venv))
    monkeypatch.setattr(build_step.sysconfig, "get_path", lambda _: str(site))

    build_step.main()

    for package in ("numpy", "pandas", "scipy", "sklearn"):
        assert not (site / package / "tests").exists()
        assert (site / package / "runtime.py").read_text() == "runtime code"
        assert (site / package / "LICENSE").read_text() == "license"
    assert (outside / "keep.py").read_text() == "external data"
    assert (site / "numpy/submodule/tests").is_symlink()
