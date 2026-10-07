import type { Screen } from '../../app/router';
import { footer, header } from '../components';
import { h } from '../dom';
import { lang, t } from '../i18n';

const EN = [
  ['Your camera stays on your device', 'Vanillate Motion turns your movement into game controls using on-device AI (MediaPipe Pose) that runs inside your browser. Camera video is processed frame by frame in memory and is never uploaded, recorded or stored by us.'],
  ['What we keep (on your device only)', 'Settings (player names, sound, sensitivity) and local statistics (matches played, personal bests, recent results) are saved in your browser’s local storage. You can delete them any time in Settings.'],
  ['Photos in share cards', 'When a match ends, the result screen can include a still photo from the camera in the share image — only if you switch it on. The image is generated locally and only leaves your device if you choose to share or download it.'],
  ['Anonymous gameplay statistics', 'If enabled by the site operator, anonymous gameplay events (e.g. “game started”, game name, mode, round length, camera setup failures) may be collected to improve the games. They never include camera images, body landmarks, names or identifiers. You can opt out in Settings, and Do-Not-Track is respected.'],
  ['No accounts, no ads', 'You do not need an account to play. There is no advertising and no third-party tracking.'],
  ['Turning the camera off', 'The camera stays on while you move between games so you don’t have to set up again. Use “Exit” after a match, close the tab, or turn the camera off from the header to stop it immediately.'],
];
const ID = [
  ['Kameramu tetap di perangkatmu', 'Vanillate Motion mengubah gerakanmu menjadi kontrol game dengan AI di perangkat (MediaPipe Pose) yang berjalan di browser. Video kamera diproses frame demi frame di memori dan tidak pernah diunggah, direkam, atau disimpan oleh kami.'],
  ['Yang kami simpan (hanya di perangkatmu)', 'Pengaturan (nama pemain, suara, sensitivitas) dan statistik lokal (pertandingan, rekor pribadi, hasil terakhir) disimpan di local storage browser. Kamu bisa menghapusnya kapan saja di Pengaturan.'],
  ['Foto di kartu hasil', 'Setelah pertandingan, layar hasil dapat menyertakan foto diam dari kamera di gambar yang dibagikan — hanya jika kamu menyalakannya. Gambar dibuat di perangkat dan hanya keluar dari perangkat jika kamu membagikan atau mengunduhnya.'],
  ['Statistik permainan anonim', 'Jika diaktifkan oleh pengelola situs, event permainan anonim (misalnya “game dimulai”, nama game, mode, durasi ronde, kegagalan kamera) dapat dikumpulkan untuk memperbaiki game. Tidak pernah berisi gambar kamera, titik tubuh, nama, atau pengenal. Kamu bisa menonaktifkannya di Pengaturan, dan Do-Not-Track dihormati.'],
  ['Tanpa akun, tanpa iklan', 'Kamu tidak perlu akun untuk bermain. Tidak ada iklan dan tidak ada pelacakan pihak ketiga.'],
  ['Mematikan kamera', 'Kamera tetap menyala saat kamu berpindah game agar tidak perlu setup ulang. Pakai “Keluar” setelah pertandingan, tutup tab, atau matikan kamera dari header untuk menghentikannya seketika.'],
];

export function privacyScreen(): Screen {
  const items = lang() === 'id' ? ID : EN;
  const el = h(
    'div',
    { class: 'page' },
    header(''),
    h('main', { id: 'main', class: 'section narrow prose' }, h('h1', null, '🛡️ ', t('privacy.title')), items.map(([title, body]) => h('section', null, h('h2', null, title), h('p', null, body)))),
    footer(),
  );
  return { el, title: `${t('privacy.title')} — Vanillate Motion` };
}
