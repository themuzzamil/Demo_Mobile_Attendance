/// Lightweight data models mirroring the API JSON.

class AppUser {
  final int id;
  final String name;
  final String email;
  final String role;

  AppUser({required this.id, required this.name, required this.email, required this.role});

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'],
        name: j['name'],
        email: j['email'],
        role: j['role'],
      );
}

class ClassModel {
  final int id;
  final String name;
  final String code;

  ClassModel({required this.id, required this.name, required this.code});

  factory ClassModel.fromJson(Map<String, dynamic> j) =>
      ClassModel(id: j['id'], name: j['name'], code: j['code']);
}

class AttendanceRecord {
  final int id;
  final String type; // check_in | check_out
  final String status; // allowed | denied
  final String? reason;
  final String classCode;
  final bool gpsOk;
  final bool ipOk;
  final double? distanceMeters;
  final DateTime createdAt;

  AttendanceRecord({
    required this.id,
    required this.type,
    required this.status,
    required this.reason,
    required this.classCode,
    required this.gpsOk,
    required this.ipOk,
    required this.distanceMeters,
    required this.createdAt,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> j) => AttendanceRecord(
        id: j['id'],
        type: j['type'],
        status: j['status'],
        reason: j['reason'],
        classCode: j['class_code'] ?? '',
        gpsOk: j['gps_ok'] ?? false,
        ipOk: j['ip_ok'] ?? false,
        distanceMeters: j['distance_meters'] == null
            ? null
            : (j['distance_meters'] as num).toDouble(),
        createdAt: DateTime.parse(j['created_at']),
      );
}
