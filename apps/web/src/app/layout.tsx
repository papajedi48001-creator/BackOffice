import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'ระบบ Back Office | โรงพยาบาลวาริชภูมิ',
  description: 'ระบบบริหารงานภายในโรงพยาบาลวาริชภูมิ'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
