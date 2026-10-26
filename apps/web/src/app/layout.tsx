import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'ระบบ Back Office | โรงพยาบาลวาริชภูมิ',
  description: 'ระบบบริหารงานภายในโรงพยาบาลวาริชภูมิ'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Falls back to the system Thai font when the hospital network blocks Google Fonts. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
