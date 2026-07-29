# Codex Switch

Web app chạy local để lưu và chuyển nhanh giữa nhiều account **Codex CLI** và **Claude Code**.

Next.js 16 · React 19 · Tailwind v4 · TypeScript · không dependency runtime nào ngoài Next.

```bash
npm install
npm run dev
```

Mở http://127.0.0.1:6677

## Menu bar macOS

App companion native Swift nằm trong `menubar/`. Build thủ công bằng:

```bash
npm run menubar
open menubar/CodexSwitchBar.app
```

Icon `⚡` trên menu bar hiển thị quota còn lại của account đang dùng. Popover có:

- Hai cửa sổ quota của account hiện tại, thời gian reset và độ tươi dữ liệu.
- Danh sách account dự phòng xếp theo quota.
- Nút **Đổi sang** ngay trên từng account.
- Làm mới quota, mở dashboard và đường dẫn đăng nhập lại khi token bị thu hồi.

Menu bar đọc trạng thái mỗi 30 giây và sweep quota mỗi 5 phút. Sweep cũng lưu lại cặp token mới
sau khi refresh, nên chuỗi refresh token của các profile không bị cũ khi browser dashboard đóng.

## Tự chạy khi đăng nhập macOS

Chạy một lệnh để build production và cài hai LaunchAgent:

```bash
npm run autostart:install
```

Từ lần đăng nhập macOS tiếp theo:

1. `local.codexswitch.server` chạy `next start` tại `127.0.0.1:6677`.
2. `local.codexswitch.menubar` mở `CodexSwitchBar.app`.
3. Server được tự khởi động lại nếu chết. Menu bar tự mở lại nếu crash, nhưng tôn trọng khi người
   dùng bấm **Thoát** và sẽ chỉ mở lại ở lần đăng nhập tiếp theo.

Không cần build lại sau khi restart máy. Chỉ chạy lại `autostart:install` sau khi source thay đổi.

```bash
npm run autostart:status
npm run autostart:install
npm run autostart:uninstall
```

Hai file được cài vào `~/Library/LaunchAgents/`; log nằm ở `~/.codex-switch/logs/`. Khi cần kiểm
tra:

```bash
tail -f ~/.codex-switch/logs/server.log
tail -f ~/.codex-switch/logs/server.error.log
tail -f ~/.codex-switch/logs/menubar.error.log
```

Các agent chạy bằng chính user macOS hiện tại, không qua Docker, và dùng trực tiếp
`~/.codex-switch` cùng `~/.codex`. Vì vậy profile, active account và quyền file giữ nguyên.
`autostart:uninstall` chỉ gỡ LaunchAgent, không xoá profile, credential hay backup.

## Ý tưởng

Kiến trúc lấy từ [xoay-config](https://github.com/lploc94/xoay-config): một **profile** là tập
hợp các **config item**, và **switch** là áp toàn bộ item của profile đó lên đĩa.

Ba loại config item:

| Loại | Việc | Ghi chú |
|---|---|---|
| `file-replace` | Ghi nội dung đã lưu vào một đường dẫn | Loại chính — credential nằm ở đây |
| `env-var` | Ghi `NAME=value` vào file shell | POSIX dùng `export`, Windows dùng `$env:` |
| `run-command` | Chạy một lệnh | POSIX dùng `sh -c`, Windows dùng `powershell` |

## Vì sao là những file này

**Codex CLI** giữ credential đang dùng ở một file duy nhất, `~/.codex/auth.json`, dùng cho cả
hai chế độ:

| `auth_mode` | Nội dung |
|---|---|
| `chatgpt` | OAuth — `tokens.access_token`, `refresh_token`, `id_token`, `account_id` |
| `apikey` | `OPENAI_API_KEY` |

Nên chuyển account = swap nguyên file đó.

**Claude Code** thì khác: preset `claude-code` của xoay-config chỉ swap
`~/.claude/settings.json`, mà file đó **không chứa credential** — nên nó không đổi được account.
Session OAuth nằm ở `~/.claude/.credentials.json`, còn account identity (`oauthAccount`) nằm ở
`~/.claude.json`. Preset ở đây swap đúng hai file này.

## Cách dùng với 3 account Codex

1. Ở card **Codex CLI**, bấm **Login (browser)** → đăng nhập account thứ nhất.
2. Bấm **Lưu account** ở thanh trên, chọn preset **Codex CLI**, đặt tên `acc1`, giữ nguyên tuỳ
   chọn *Chụp luôn config đang có trên đĩa* → **Tạo profile**.
3. Lặp lại cho `acc2`, `acc3`.
4. Ở card **Accounts**, bấm **đổi sang** trên dòng account muốn dùng.

Account đang chạy hiện ở card **Account đang dùng** và ở card ghim dưới sidebar. Trạng thái này
**suy ra từ đĩa**, không phải từ một cờ lưu sẵn: nội dung item được so byte-for-byte với file
thật. Nên nó luôn đúng, kể cả khi bạn login bằng `codex` trực tiếp ở terminal.

### Các view

| View | Nội dung |
|---|---|
| Tổng quan | Account đang dùng, số liệu, đồng hồ token, lịch sử switch, bảng account, console |
| Accounts | Bảng đầy đủ + trạng thái capture của từng file |
| Backups | Lịch sử switch, mỗi lần một bản backup |
| Console | Chạy `codex login` / `status` và xem output |

Nhóm tool ở mục **TOOLS** trong sidebar quyết định đang xem Codex CLI hay Claude Code.

## Switch engine

`src/lib/switch-engine.ts`. Mỗi lần switch:

1. **Lock** — chỉ một switch chạy tại một thời điểm.
2. **Backup** — copy mọi file sẽ bị ghi vào `~/.codex-switch/backups/<id>/`, kèm `_meta.json`.
   Tên file backup là base64url của đường dẫn tuyệt đối nên không bao giờ trùng.
3. **Phase 1** `file-replace` → **Phase 2** `env-var` → **Phase 3** `run-command`, tuần tự.
4. **Rollback** — nếu phase 1 hoặc 2 lỗi, phục hồi toàn bộ file từ backup. Phase 3 lỗi thì
   *không* rollback: side effect của lệnh không undo được.
5. Ghi file theo kiểu **atomic**: ghi ra file tạm cùng thư mục rồi `rename`. Không bao giờ để
   lại file ghi dở.

## Dữ liệu lưu ở đâu

```
~/.codex-switch/
├── state.json              # categories, profiles, config items (kèm nội dung file)
└── backups/<id>/           # bản backup trước mỗi lần switch
    ├── _meta.json
    └── <base64url-path>
```

## Bảo mật

Nội dung `auth.json` được lưu **plaintext** trong `state.json` — giống như cách Codex CLI lưu
`~/.codex/auth.json`. Những điểm đã xử lý:

- Server **chỉ bind `127.0.0.1`** (`next dev` và `next start`), không nghe trên `0.0.0.0`.
- API **không trả token thô** về browser. Chỉ trả `auth_mode` + identity đã suy ra: email đọc
  từ payload của `id_token`, hoặc API key dạng `sk-pro…a1b4`.
- Job runner chỉ chạy các lệnh **whitelist** (`codex login`, `login --device-auth`,
  `login status`). Không có gì từ request đi vào argv.
- Backup trước mỗi lần ghi, atomic write, rollback khi lỗi.

Đừng commit `~/.codex-switch/`. Đừng expose port này ra ngoài máy.

### Token OAuth sẽ hết hạn

`access_token` của chế độ `chatgpt` có thời hạn. Trước khi đọc quota hoặc switch, app tự refresh
khi cần rồi lưu lại cặp token mới vào profile; với account đang live, file `~/.codex/auth.json`
cũng được cập nhật để không đứt chuỗi token rotation.

Không chạy `codex logout` để đổi account: Codex CLI thu hồi refresh token phía server và làm bản
đang lưu trong profile chết theo. Dùng nút switch của app. Nếu token đã bị thu hồi, bấm
**Đăng nhập lại** trên dashboard để import credential mới vào đúng profile cũ.

## API

| Method | Endpoint | Việc |
|---|---|---|
| `GET` | `/api/state` | Categories, profiles, trạng thái active suy từ đĩa |
| `GET` | `/api/presets` | Preset có sẵn |
| `POST` | `/api/categories` | Tạo category |
| `DELETE` | `/api/categories/:id` | Xoá category rỗng |
| `POST` | `/api/profiles` | Tạo profile từ preset, tuỳ chọn chụp config hiện tại |
| `PATCH` | `/api/profiles/:id` | Đổi tên / cập nhật items |
| `DELETE` | `/api/profiles/:id` | Xoá profile |
| `POST` | `/api/profiles/:id/switch` | Chạy switch engine |
| `POST` | `/api/profiles/:id/import` | Chụp config trên đĩa vào profile |
| `POST` | `/api/jobs` | Chạy lệnh auth của Codex |
| `GET` | `/api/jobs/:id` | Poll output |
| `POST` | `/api/usage` | Refresh credential khi cần và cập nhật quota mọi profile |

## Thêm tool khác

Presets là code trong `src/lib/presets.ts`. Thêm một entry với các file mang account identity
của tool đó là xong — không cần sửa gì khác.
