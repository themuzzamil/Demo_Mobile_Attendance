import 'package:flutter/material.dart';
import 'api_service.dart';
import 'login_screen.dart';
import 'home_screen.dart';

void main() {
  runApp(const AttendanceApp());
}

class AttendanceApp extends StatefulWidget {
  const AttendanceApp({super.key});

  @override
  State<AttendanceApp> createState() => _AttendanceAppState();
}

class _AttendanceAppState extends State<AttendanceApp> {
  final ApiService _api = ApiService();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _api.loadSession().then((_) => setState(() => _ready = true));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mobile Attendance',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF2563EB),
        useMaterial3: true,
      ),
      home: !_ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : (_api.isLoggedIn ? HomeScreen(api: _api) : LoginScreen(api: _api)),
    );
  }
}
