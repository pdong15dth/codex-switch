# Codex Switch

Web app chạy local để lưu và chuyển nhanh giữa nhiều account **Codex CLI** và **Claude Code**.

Next.js 16 · React 19 · Tailwind v4 · TypeScript · không dependency runtime nào ngoài Next.

```bash
npm install
npm run dev
```

Mở http://127.0.0.1:6677

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
| Console | Chạy `codex login` / `status` / `logout` và xem output |

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

- Server **chỉ bind `127.0.0.1`** (`next dev -H 127.0.0.1`), không nghe trên `0.0.0.0`.
- API **không trả token thô** về browser. Chỉ trả `auth_mode` + identity đã suy ra: email đọc
  từ payload của `id_token`, hoặc API key dạng `sk-pro…a1b4`.
- Job runner chỉ chạy các lệnh **whitelist** (`codex login`, `login --device-auth`,
  `login status`, `logout`). Không có gì từ request đi vào argv.
- Backup trước mỗi lần ghi, atomic write, rollback khi lỗi.

Đừng commit `~/.codex-switch/`. Đừng expose port này ra ngoài máy.

### Token OAuth sẽ hết hạn

`access_token` của chế độ `chatgpt` có thời hạn và Codex tự refresh — nghĩa là `auth.json` thay
đổi sau mỗi lần refresh, và profile sẽ hiện *khác đĩa*. Đó là bình thường. Nếu một snapshot cũ
tới mức refresh token cũng hết hiệu lực, switch sang nó sẽ phải login lại; khi đó dùng
**Import từ đĩa** để làm mới. Cột *token hết hạn* trên mỗi profile đọc từ `id_token`.

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

## Thêm tool khác

Presets là code trong `src/lib/presets.ts`. Thêm một entry với các file mang account identity
của tool đó là xong — không cần sửa gì khác.
