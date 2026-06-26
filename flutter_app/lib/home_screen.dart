import 'package:flutter/material.dart';
import 'api_service.dart';
import 'location_service.dart';
import 'models.dart';
import 'login_screen.dart';

class HomeScreen extends StatefulWidget {
  final ApiService api;
  const HomeScreen({super.key, required this.api});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<ClassModel> _classes = [];
  int? _selectedClassId;
  List<AttendanceRecord> _history = [];
  String _gpsText = 'GPS: not captured yet';
  double? _lat;
  double? _lng;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _loadClasses();
    await _loadHistory();
    _captureLocation();
  }

  Future<void> _loadClasses() async {
    try {
      final classes = await widget.api.myClasses();
      setState(() {
        _classes = classes;
        if (classes.isNotEmpty) _selectedClassId = classes.first.id;
      });
    } catch (e) {
      _snack(e.toString());
    }
  }

  Future<void> _loadHistory() async {
    try {
      final h = await widget.api.myHistory();
      setState(() => _history = h);
    } catch (e) {
      _snack(e.toString());
    }
  }

  Future<void> _captureLocation() async {
    setState(() => _gpsText = 'GPS: locating…');
    try {
      final pos = await LocationService.getCurrentPosition();
      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
        _gpsText =
            'GPS: ${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)} (±${pos.accuracy.round()}m)';
      });
    } catch (e) {
      setState(() {
        _lat = null;
        _lng = null;
        _gpsText = 'GPS: ${e.toString().replaceAll('Exception: ', '')}';
      });
    }
  }

  Future<void> _mark(String type) async {
    if (_selectedClassId == null) {
      _snack('No class selected');
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.mark(
        type: type,
        classId: _selectedClassId!,
        latitude: _lat,
        longitude: _lng,
      );
      _snack(type == 'check_in' ? '✅ Checked in' : '✅ Checked out', ok: true);
    } on ApiException catch (e) {
      // denied or other API error — show the reason
      _snack('❌ ${e.message}');
    } catch (e) {
      _snack('❌ $e');
    } finally {
      await _loadHistory();
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg, {bool ok = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: ok ? const Color(0xFF16A34A) : const Color(0xFFB91C1C),
    ));
  }

  Future<void> _logout() async {
    await widget.api.logout();
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => LoginScreen(api: widget.api)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('📍 Attendance'),
        actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout))],
      ),
      body: RefreshIndicator(
        onRefresh: _init,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Signed in as ${widget.api.currentUser?.name ?? ''}',
                style: const TextStyle(color: Colors.grey)),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Class'),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<int>(
                      value: _selectedClassId,
                      decoration: const InputDecoration(border: OutlineInputBorder()),
                      items: _classes
                          .map((c) => DropdownMenuItem(
                                value: c.id,
                                child: Text('${c.code} — ${c.name}'),
                              ))
                          .toList(),
                      onChanged: (v) => setState(() => _selectedClassId = v),
                    ),
                    const SizedBox(height: 10),
                    Text(_gpsText, style: const TextStyle(color: Colors.grey, fontSize: 13)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A)),
                            onPressed: _busy ? null : () => _mark('check_in'),
                            child: const Padding(padding: EdgeInsets.all(12), child: Text('Check In')),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB45309)),
                            onPressed: _busy ? null : () => _mark('check_out'),
                            child: const Padding(padding: EdgeInsets.all(12), child: Text('Check Out')),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _captureLocation,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Refresh location'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Text('Recent attendance',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (_history.isEmpty)
              const Text('No attendance yet.', style: TextStyle(color: Colors.grey)),
            ..._history.take(20).map(_historyTile),
          ],
        ),
      ),
    );
  }

  Widget _historyTile(AttendanceRecord a) {
    final allowed = a.status == 'allowed';
    return Card(
      child: ListTile(
        leading: Icon(
          a.type == 'check_in' ? Icons.login : Icons.logout,
          color: allowed ? const Color(0xFF16A34A) : const Color(0xFFB91C1C),
        ),
        title: Text(
            '${a.type == 'check_in' ? 'Check-in' : 'Check-out'} · ${a.classCode}'),
        subtitle: Text(
          '${a.createdAt.toLocal()}\nGPS ${a.gpsOk ? '✅' : '❌'} · IP ${a.ipOk ? '✅' : '❌'}'
          '${a.distanceMeters != null ? ' · ${a.distanceMeters!.round()}m' : ''}'
          '${a.reason != null ? '\n${a.reason}' : ''}',
        ),
        isThreeLine: true,
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: allowed ? const Color(0xFFDCFCE7) : const Color(0xFFFEE2E2),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(a.status,
              style: TextStyle(
                  color: allowed ? const Color(0xFF166534) : const Color(0xFF991B1B),
                  fontSize: 12)),
        ),
      ),
    );
  }
}
