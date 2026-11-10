import { KioskScreen } from './kiosk-screen';

export const metadata = { title: 'กล่องลงเวลา' };

/** Full-screen page for the กล่องลงเวลา (Android box, Chrome). No staff sign-in: the box proves itself with its own key. */
export default function KioskPage() {
  return <KioskScreen />;
}
