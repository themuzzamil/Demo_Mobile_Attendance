# Mobile Attendance — Flutter Student App

> ⚠️ **Out of date.** This app was built for the earlier **GPS + class** model and
> the old `email/role` login. The backend has since moved to an **email-auth +
> approval workflow + IP-session** model (see `../web`). The Dart code here will
> not work against the current API until it is updated to: profile-based signup,
> pending/approval screens, and session-based attendance via public IP (no GPS).
> Until then, use the **web student page at `/student`**. Tracked as a follow-up.

Native Android/iOS student app. Logs in and calls the same Next.js API (`web/`).

## Prerequisites
- Flutter SDK 3.x — https://docs.flutter.dev/get-started/install
- The API running and reachable (the `web/` Next.js app on port 3000, or a
  deployed URL).

## First-time setup

This folder ships `lib/` + `pubspec.yaml`. Generate the platform folders
(`android/`, `ios/`) once, then install packages:

```bash
cd flutter_app
flutter create .          # generates android/ ios/ without touching lib/
flutter pub get
```

### Point the app at your API
Default is `http://10.0.2.2:3000` (Android emulator → host localhost). Override:

```bash
# physical phone on same Wi-Fi as your computer:
flutter run --dart-define=API_BASE_URL=http://192.168.100.25:3000
```
(see `lib/config.dart` for all cases).

### Add location permissions
`flutter create` generates default manifests. Add these so `geolocator` works:

**Android** — `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```
> For a release build over plain `http://` (not https), also allow cleartext:
> set `android:usesCleartextTraffic="true"` on the `<application>` tag.

**iOS** — `ios/Runner/Info.plist`, inside the top `<dict>`:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We use your location to verify you are in class when marking attendance.</string>
```

## Run
```bash
flutter run                    # with a device/emulator connected
```

## Files
```
lib/
  main.dart            app entry + session restore
  config.dart          API base URL (--dart-define overridable)
  models.dart          User / Class / AttendanceRecord
  api_service.dart     HTTP client + JWT persistence (shared_preferences)
  location_service.dart  geolocator permission + current position
  login_screen.dart    student login
  home_screen.dart     class picker, GPS, check-in/out, history
```

## Demo login
`muzzamil@demo.com` / `student123`  (also `rijja@demo.com` / `student123`)

## Notes
- The app sends GPS coords; the **IP is read server-side** from the request, so
  the phone must be on the authorized network for the IP check to pass (configure
  the class `allowed_subnet` from the web dashboard).
- A denied check-in returns HTTP 403 with a reason, shown in a snackbar and in
  the history list.
