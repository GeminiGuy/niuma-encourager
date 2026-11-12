"""Package the desktop app using verified Electron release archives on macOS."""
import argparse
import hashlib
import plistlib
import shutil
import subprocess
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

RUNTIME = "45.3.0"
TITLE = "牛马鼓励器"
TARGETS = ("darwin-arm64", "darwin-x64", "win32-x64")
PROJECT = Path(__file__).resolve().parent
SOURCE = PROJECT / "app"


def run(*args):
    subprocess.run(args, check=True)


def verify(archive, checksums):
    expected = checksums[archive.name]
    with archive.open("rb") as file:
        actual = hashlib.file_digest(file, "sha256").hexdigest()
    if actual != expected:
        raise ValueError(f"Electron archive checksum mismatch: {archive.name}")


def brand_mac(staging):
    bundle = staging / "Electron.app"
    destination = staging / f"{TITLE}.app"
    bundle.rename(destination)
    contents = destination / "Contents"
    resources = contents / "Resources"
    shutil.copytree(SOURCE, resources / "app")
    with (contents / "Info.plist").open("rb") as file:
        info = plistlib.load(file)
    info.update(
        CFBundleName=TITLE,
        CFBundleDisplayName=TITLE,
        CFBundleIdentifier="cn.niuma.desktop",
        CFBundleIconFile="Niuma.icns",
        CFBundleShortVersionString="1.3.4",
        CFBundleVersion="1.3.4",
    )
    with (contents / "Info.plist").open("wb") as file:
        plistlib.dump(info, file)
    shutil.copy2(SOURCE / "assets" / "Niuma.icns", resources / "Niuma.icns")
    run("codesign", "--force", "--deep", "--sign", "-", str(destination))
    run("codesign", "--verify", "--deep", "--strict", str(destination))
    return destination


def brand_windows(staging):
    shutil.copytree(SOURCE, staging / "resources" / "app")
    (staging / "electron.exe").rename(staging / "Niuma.exe")
    (staging / "打开说明.txt").write_text(
        "先解压整个文件夹，再双击 Niuma.exe。\n"
        "隐藏后从任务栏右下角的系统托盘恢复。\n",
        encoding="utf-8-sig",
    )
    return staging


def package(target, runtime, staging, output, checksums):
    archive = runtime / f"electron-v{RUNTIME}-{target}.zip"
    verify(archive, checksums)
    mac = target.startswith("darwin")
    platform = target.replace("darwin", "macOS").replace("win32", "Windows10")
    stage = staging / (target if mac else f"Niuma-{platform}")
    stage.mkdir()
    run("ditto", "-x", "-k", str(archive), str(stage))
    app_dir = brand_mac(stage) if mac else brand_windows(stage)
    result = output / f"{TITLE}-v1.3.4-{platform}.zip"
    if result.exists():
        raise FileExistsError(result)
    run("ditto", "-c", "-k", "--norsrc", "--keepParent", str(app_dir), str(result))
    if mac:
        with ZipFile(result, "a", ZIP_DEFLATED, compresslevel=9) as package:
            for name in ("LICENSE", "LICENSES.chromium.html"):
                package.write(stage / name, name)
    print(f"{target}: {result}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("runtime", type=Path)
    parser.add_argument("staging", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("targets", nargs="*", choices=TARGETS)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    args.staging.mkdir(parents=True, exist_ok=True)
    checksums = {}
    for line in (args.runtime / "SHASUMS256.txt").read_text().splitlines():
        checksum, filename = line.split(maxsplit=1)
        checksums[filename.lstrip("*")] = checksum
    for target in args.targets or TARGETS:
        package(target, args.runtime, args.staging, args.output, checksums)


if __name__ == "__main__":
    main()
