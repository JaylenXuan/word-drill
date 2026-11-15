# 鲸鱼娘素材（仅个人自用）

本目录的图片**不是我的作品**，是社区现成素材，按原样放在这里，没有重绘、没有改色、没有裁剪。

## 来源

- 仓库：<https://github.com/fornarwhal/deepseek-whale-girl-icon>
- 版本：`bc2ac790e6f6a0cbc88879c56383b6f08ed3ef83`（main 分支，2026-11-15 拉取）
- 协议：**CC BY-NC-SA 4.0**（署名 / 非商业 / 相同方式共享）

## 署名（原作与贡献者）

- 角色形象原作：**上善无形**（原创 OC「溟月」）
- DeepSeek 元素二创：**ZipZipPipe**
- 改进版去伪影修复：**QYQCAMIAO**
- Live2D 相关：**氵六青**

## 文件

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `whale-girl-transparent.png` | 910×941，透明底 | 完成页大图 |
| `icon-preview.png` | 256×256，透明底 | 小尺寸场景 |
| `icons/apple-touch-icon-180.png` | 180×180 | iOS 主屏图标 |
| `icons/icon-192.png` | 192×192 | manifest |
| `icons/icon-512.png` | 512×512 | manifest |
| `icons/maskable-512.png` | 512×512 | Android 自适应图标（留白更大） |

`icons/` 里的四个文件是**从 `icon-preview.png` 派生**的：等比缩放 + 垫一层奶油底
（`#FBF9F5`，因为 iOS 会把透明区域渲染成黑色）。**没有重绘、没有改色、没有修图**，
原图两个文件一字未动。生成脚本：`tools/make-icons.py`。

## 使用限制

仅作者本人**个人、非商业、自用**，不对外分发、不公开部署成他人可访问的站点。
若将来要分享这个项目，必须先移除本目录的图片，或单独取得授权。
