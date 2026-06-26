import 'package:flutter/material.dart';
import 'api_service.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  final ApiService api;
  const LoginScreen({super.key, required this.api});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'muzzamil@demo.com');
  final _password = TextEditingController(text: 'student123');
  String? _error;
  bool _busy = false;

  Future<void> _login() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    try {
      await widget.api.login(_email.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => HomeScreen(api: widget.api)),
      );
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.location_on, size: 56, color: Color(0xFF2563EB)),
              const SizedBox(height: 8),
              const Text('Mobile Attendance',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              const Text('Student check-in',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 24),
              if (_error != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626))),
                ),
              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : _login,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(_busy ? 'Signing in…' : 'Sign in'),
                ),
              ),
              const SizedBox(height: 8),
              const Text('Demo: muzzamil@demo.com / student123',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}
