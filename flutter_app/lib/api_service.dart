import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import 'models.dart';

/// Thin client for the Mobile Attendance API. Persists the JWT with
/// shared_preferences and attaches it to every request.
class ApiService {
  static const _tokenKey = 'token';
  static const _userKey = 'user';

  String? _token;
  AppUser? currentUser;

  Future<void> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    final userJson = prefs.getString(_userKey);
    if (userJson != null) {
      currentUser = AppUser.fromJson(jsonDecode(userJson));
    }
  }

  bool get isLoggedIn => _token != null && currentUser != null;

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path) => Uri.parse('${Config.apiBaseUrl}/api$path');

  dynamic _decode(http.Response res) {
    final body = res.body.isEmpty ? {} : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      throw ApiException(
        body is Map && body['error'] != null
            ? body['error']
            : 'Request failed (${res.statusCode})',
        body is Map ? body : null,
      );
    }
    return body;
  }

  Future<AppUser> login(String email, String password) async {
    final res = await http.post(
      _uri('/auth/login'),
      headers: _headers(),
      body: jsonEncode({'email': email, 'password': password}),
    );
    final data = _decode(res);
    if (data['user']['role'] != 'student') {
      throw ApiException('This app is for students. Staff use the web dashboard.', null);
    }
    _token = data['token'];
    currentUser = AppUser.fromJson(data['user']);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _token!);
    await prefs.setString(_userKey, jsonEncode(data['user']));
    return currentUser!;
  }

  Future<void> logout() async {
    _token = null;
    currentUser = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
  }

  Future<List<ClassModel>> myClasses() async {
    final res = await http.get(_uri('/classes'), headers: _headers());
    final data = _decode(res);
    return (data['classes'] as List).map((c) => ClassModel.fromJson(c)).toList();
  }

  /// Returns the API JSON. On denial the API responds 403 with
  /// { status: 'denied', reason, attendance } — surfaced via ApiException.data.
  Future<Map<String, dynamic>> mark({
    required String type, // 'check_in' | 'check_out'
    required int classId,
    double? latitude,
    double? longitude,
  }) async {
    final path = type == 'check_in' ? '/attendance/check-in' : '/attendance/check-out';
    final res = await http.post(
      _uri(path),
      headers: _headers(),
      body: jsonEncode({
        'class_id': classId,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
      }),
    );
    return Map<String, dynamic>.from(_decode(res));
  }

  Future<List<AttendanceRecord>> myHistory() async {
    final res = await http.get(_uri('/attendance/me'), headers: _headers());
    final data = _decode(res);
    return (data['attendance'] as List)
        .map((a) => AttendanceRecord.fromJson(a))
        .toList();
  }
}

class ApiException implements Exception {
  final String message;
  final Map<String, dynamic>? data;
  ApiException(this.message, this.data);
  @override
  String toString() => message;
}
