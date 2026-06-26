/// App configuration.
///
/// Point this at your running Next.js API (the `web/` app on port 3000).
///
///  - Android emulator:   http://10.0.2.2:3000   (10.0.2.2 = host's localhost)
///  - iOS simulator:      http://localhost:3000
///  - Physical phone:     http://<your-computer-LAN-IP>:3000  (e.g. 192.168.100.25)
///                        — phone and computer must be on the same Wi-Fi.
///  - Deployed (Vercel):  https://your-app.vercel.app
///
/// Override at build/run time without editing code:
///   flutter run --dart-define=API_BASE_URL=http://192.168.100.25:3000
class Config {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
}
