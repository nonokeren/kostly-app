# KosMate (fullstack)

Stack: Node.js (>= 22.5) + Express + SQLite bawaan Node (node:sqlite) + JWT, frontend vanilla JS.
Tidak perlu Visual Studio / compiler C++.

## Menjalankan
    npm install
    npm start        # buka http://localhost:3000

Jika PowerShell memblokir npm:
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

Akun pertama menjadi Admin, berikutnya User. Semua user dapat mengisi dan mengubah data bersama. Budget bulanan bisa diedit atau ditambah pemasukan.
Notifikasi (lonceng): stok menipis, laundry siap diambil, tagihan, piket. Profil bisa diubah (foto, nama, password).
Ganti JWT_SECRET lewat environment variable sebelum deploy.
