# Bản Windows

Bản desktop chạy nguyên frontend Next.js và backend Spring Boot trên hai cổng
`localhost` được chọn động. Bộ cài chứa sẵn Java 17 và FFmpeg, vì vậy máy người dùng
không cần cài Node.js, Java hay Docker.

GitHub Actions tạo hai tệp:

- `RapPhim-WareHouse-Setup-...exe`: bộ cài NSIS.
- `RapPhim-WareHouse-Portable-...exe`: bản chạy trực tiếp.

Quy trình build thủ công trên Windows:

1. Build backend bằng `backend\\mvnw.cmd -B test package`.
2. Chạy `npm ci` và `npm run build` trong `frontend`.
3. Chạy `npm ci` và `npm run prepare:resources` trong `desktop`.
4. Đặt Java runtime vào `desktop/build-resources/jre` và `ffmpeg.exe` vào
   `desktop/build-resources/ffmpeg`.
5. Chạy `npm run verify:resources` rồi `npm run dist:win` trong `desktop`.

Các file đầu ra nằm trong `desktop/release`.

