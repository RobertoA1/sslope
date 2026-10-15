"""Remove dependency test suites from the disposable Vercel build environment."""
import os
from pathlib import Path
import shutil
import sys
import sysconfig


def main():
    configured = os.environ.get("VERCEL_PYTHON_VENV_PATH")
    if not configured:
        raise SystemExit("This build step requires VERCEL_PYTHON_VENV_PATH; it must not run in a local training environment.")
    venv = Path(configured).resolve()
    site_packages = Path(sysconfig.get_path("purelib")).resolve()
    if Path(sys.prefix).resolve() != venv or not site_packages.is_relative_to(venv):
        raise SystemExit("Refusing to modify packages outside the Vercel build virtual environment.")

    removed_bytes = 0
    removed_folders = 0
    for name in ("numpy", "pandas", "scipy", "sklearn"):
        package = site_packages / name
        # Library test data and suites are unnecessary for exploration/previews.
        # Preserve runtime modules, native libraries, metadata, and licenses.
        for tests in sorted(package.rglob("tests"), key=lambda p: len(p.parts)):
            if not tests.is_dir() or tests.is_symlink():
                continue
            removed_bytes += sum(file.stat().st_size for file in tests.rglob("*") if file.is_file() and not file.is_symlink())
            shutil.rmtree(tests)
            removed_folders += 1
    print(f"Vercel backend: removed {removed_folders} dependency test folders ({removed_bytes / 1024**2:.2f} MiB).")


if __name__ == "__main__":
    main()
