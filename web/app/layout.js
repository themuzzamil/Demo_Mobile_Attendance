import './globals.css';

export const metadata = {
  title: 'Mobile Attendance',
  description: 'Location + IP based attendance system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
