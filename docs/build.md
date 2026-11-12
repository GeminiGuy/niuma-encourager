# 构建与发布

## 小红书 H5

`h5/` 是静态资源目录。打包时压缩目录里的文件，确保 `index.html` 位于 ZIP 根目录。随 Release 附带的 H5 ZIP 与小红书已发布的 v1.3.4 代码包一致。

## 桌面版

在 macOS 上使用 Python 3.11 或更高版本打包。准备 [Electron v45.3.0](https://github.com/electron/electron/releases/tag/v45.3.0) 的 `SHASUMS256.txt`，以及对应版本的 `darwin-arm64`、`darwin-x64` 和 `win32-x64` ZIP，并放在同一个目录。脚本会先核对官方校验值，再解包、写入应用并重新打包。

```sh
python3 desktop/package-desktop.py /path/to/electron-archives build/staging build/packages darwin-arm64 darwin-x64 win32-x64
```

请使用新的暂存目录进行每次打包。Mac 包做本地签名校验。Windows 包包含运行所需的整个文件夹。

## GitHub Release

用 `v1.3.4` 标签创建 Release 草稿，发布文案使用 [RELEASE-v1.3.4.md](RELEASE-v1.3.4.md)，上传四个 ZIP 和 `SHA256SUMS.txt`。这些附件保存在本地的 `release-assets/`，通过 GitHub Release 分发。 [GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
