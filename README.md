# Codex Switch

Web UI chạy local để lưu và chuyển nhanh giữa nhiều account Codex CLI.

Không dependency ngoài — chỉ cần Node.js >= 18.

## Chạy

```bash
node server.js
```

Mở http://127.0.0.1:6677

Đổi port:

```bash
PORT=6688 node server.js
```

## Nó hoạt động thế nào

Codex CLI giữ credential đang dùng ở **một file duy nhất**: `~/.codex/auth.json`. File này
phục vụ cả hai chế độ đăng nhập:

| `auth_mode` | Nội dung |
|---|---|
| `chatgpt` | OAuth — `tokens.access_token`, `refresh_token`, `id_token`, `account_id` |
| `apikey` | `OPENAI_API_KEY` |

Vì vậy chuyển account = swap nguyên file đó. Một **profile** là một bản snapshot của file này.

## Cách dùng với 3 account

1. Bấm **Login account mới** → browser mở ra, đăng nhập account thứ nhất.
2. Nhập tên (ví dụ `acc1`) → bấm **Lưu profile**.
3. Bấm **Login account mới** lần nữa, đăng nhập account thứ hai → lưu thành `acc2`.
4. Lặp lại cho `acc3`.
5. Từ đó bấm **Switch sang account này** để đổi qua lại. Tức thì, không cần login lại.

Card nào có viền xanh + nhãn `ĐANG DÙNG` là account đang active. Tool xác định điều này bằng
cách so sánh SHA-256 giữa `~/.codex/auth.json` và từng snapshot, nên nó luôn phản ánh trạng
thái thật trên đĩa — kể cả khi bạn login bằng `codex` trực tiếp ở terminal.

## Dữ liệu lưu ở đâu

```
~/.codex-switch/
├── profiles.json          # index: id, tên, thời điểm tạo/cập nhật
├── profiles/<uuid>.json   # snapshot auth.json của từng account
└── backups/auth-<ts>.json # bản backup file hiện tại, tạo trước mỗi lần switch
```

## Về bảo mật

Các snapshot là **credential thật, lưu plaintext** — giống như cách Codex CLI lưu
`~/.codex/auth.json`. Vài điểm đã xử lý:

- Server **chỉ bind `127.0.0.1`**, không bind `0.0.0.0` — không truy cập được từ máy khác.
- API **không bao giờ trả token thô** về browser. Chỉ trả `auth_mode` và identity đã mask:
  email lấy từ payload của `id_token` (OAuth), hoặc API key dạng `sk-pro…a1b4`.
- Mỗi lần switch đều **backup** file hiện tại vào `backups/` trước khi ghi đè.
- Ghi file theo kiểu atomic (temp + rename) để không để lại file bị cắt dở khi crash.
- Đường dẫn static được chặn path traversal.

Không commit `~/.codex-switch/` vào git. Không expose port này ra ngoài.

### Token OAuth sẽ hết hạn

`access_token` của chế độ `chatgpt` có thời hạn, và Codex tự refresh nó — nghĩa là file
`auth.json` sẽ thay đổi sau khi refresh. Nếu một snapshot cũ quá và refresh token cũng đã
hết hiệu lực, switch sang nó sẽ cần login lại. Khi đó dùng nút **Cập nhật lại từ account
hiện tại** để làm mới snapshot. Cột "token hết hạn" trên mỗi card cho biết thời hạn đọc
được từ `id_token`.

## API

| Method | Endpoint | Việc |
|---|---|---|
| `GET` | `/api/state` | Trạng thái hiện tại + danh sách profile |
| `POST` | `/api/profiles` | Lưu `auth.json` hiện tại thành profile mới |
| `POST` | `/api/profiles/:id/activate` | Switch sang profile (có backup) |
| `POST` | `/api/profiles/:id/recapture` | Cập nhật snapshot từ file hiện tại |
| `PATCH` | `/api/profiles/:id` | Đổi tên |
| `DELETE` | `/api/profiles/:id` | Xoá profile + snapshot |
| `POST` | `/api/jobs` | Chạy `codex login` / `login --device-auth` / `login status` / `logout` |
| `GET` | `/api/jobs/:id` | Poll output của job |
