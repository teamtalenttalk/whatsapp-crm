const express = require('express');
const { v4: uuid } = require('uuid');
const { db } = require('../database');
const { authMiddleware } = require('../middleware/auth');

// Migrate new columns onto the existing appointments table
try { db.exec(`ALTER TABLE appointments ADD COLUMN duration_minutes INTEGER DEFAULT 30`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN location TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN meeting_link TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN completed_at TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE appointments ADD COLUMN cancelled_at TEXT`); } catch(e) {}

const router = express.Router();

const DEFAULT_WORK_START = '09:00';
const DEFAULT_WORK_END = '18:00';
const DEFAULT_SLOT_DURATION = 30; // minutes

/**
 * Helper: get today's date as YYYY-MM-DD in local time
 */
function todayDate() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

/**
 * Helper: get a date 7 days from now as YYYY-MM-DD
 */
function weekFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Helper: generate time slots between start and end at given interval
 * Returns array of "HH:MM" strings
 */
function generateTimeSlots(startTime, endTime, intervalMinutes) {
  const slots = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let current = startH * 60 + startM;
  const end = endH * 60 + endM;

  while (current < end) {
    const h = String(Math.floor(current / 60)).padStart(2, '0');
    const m = String(current % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    current += intervalMinutes;
  }
  return slots;
}

/**
 * Helper: check if two time ranges overlap
 * Times are "HH:MM" strings, durations in minutes
 */
function slotsOverlap(time1, duration1, time2, duration2) {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const start1 = toMin(time1);
  const end1 = start1 + duration1;
  const start2 = toMin(time2);
  const end2 = start2 + duration2;
  return start1 < end2 && start2 < end1;
}

// ─── GET /available-slots?date=YYYY-MM-DD&duration=30 ────────────────────────
// Must be registered before /:id to avoid route conflict
router.get('/available-slots', authMiddleware, (req, res) => {
  try {
    const { date, duration } = req.query;
    if (!date) return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });

    const slotDuration = parseInt(duration) || DEFAULT_SLOT_DURATION;
    const allSlots = generateTimeSlots(DEFAULT_WORK_START, DEFAULT_WORK_END, slotDuration);

    // Fetch existing bookings for this date (exclude cancelled)
    const booked = db.prepare(
      `SELECT time, duration_minutes FROM appointments
       WHERE tenant_id = ? AND date = ? AND status != 'cancelled'`
    ).all(req.tenant.id, date);

    const slots = allSlots.map((time) => {
      const overlapping = booked.some((b) =>
        slotsOverlap(time, slotDuration, b.time, b.duration_minutes || DEFAULT_SLOT_DURATION)
      );
      return { time, available: !overlapping };
    });

    res.json({ date, slot_duration: slotDuration, slots });
  } catch (err) {
    console.error('Error fetching available slots:', err);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// ─── GET /today ──────────────────────────────────────────────────────────────
router.get('/today', authMiddleware, (req, res) => {
  try {
    const today = todayDate();
    const meetings = db.prepare(
      `SELECT a.*, c.name as linked_contact_name, c.phone as linked_contact_phone
       FROM appointments a
       LEFT JOIN contacts c ON a.contact_id = c.id
       WHERE a.tenant_id = ? AND a.date = ?
       ORDER BY a.time ASC`
    ).all(req.tenant.id, today);

    res.json({ date: today, count: meetings.length, meetings });
  } catch (err) {
    console.error('Error fetching today meetings:', err);
    res.status(500).json({ error: 'Failed to fetch today meetings' });
  }
});

// ─── GET /upcoming ───────────────────────────────────────────────────────────
router.get('/upcoming', authMiddleware, (req, res) => {
  try {
    const today = todayDate();
    const endDate = weekFromNow();
    const meetings = db.prepare(
      `SELECT a.*, c.name as linked_contact_name, c.phone as linked_contact_phone
       FROM appointments a
       LEFT JOIN contacts c ON a.contact_id = c.id
       WHERE a.tenant_id = ? AND a.date >= ? AND a.date <= ? AND a.status != 'cancelled'
       ORDER BY a.date ASC, a.time ASC`
    ).all(req.tenant.id, today, endDate);

    res.json({ from: today, to: endDate, count: meetings.length, meetings });
  } catch (err) {
    console.error('Error fetching upcoming meetings:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming meetings' });
  }
});

// ─── GET /stats ──────────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const today = todayDate();
    const endOfWeek = weekFromNow();

    const todayCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM appointments WHERE tenant_id = ? AND date = ? AND status != 'cancelled'`
    ).get(req.tenant.id, today).cnt;

    const thisWeekCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM appointments WHERE tenant_id = ? AND date >= ? AND date <= ? AND status != 'cancelled'`
    ).get(req.tenant.id, today, endOfWeek).cnt;

    const pendingCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM appointments WHERE tenant_id = ? AND status = 'pending'`
    ).get(req.tenant.id).cnt;

    const completedCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM appointments WHERE tenant_id = ? AND status = 'completed'`
    ).get(req.tenant.id).cnt;

    const cancelledCount = db.prepare(
      `SELECT COUNT(*) as cnt FROM appointments WHERE tenant_id = ? AND status = 'cancelled'`
    ).get(req.tenant.id).cnt;

    res.json({
      today: todayCount,
      this_week: thisWeekCount,
      pending: pendingCount,
      completed: completedCount,
      cancelled: cancelledCount
    });
  } catch (err) {
    console.error('Error fetching meeting stats:', err);
    res.status(500).json({ error: 'Failed to fetch meeting stats' });
  }
});

// ─── GET / ───────────────────────────────────────────────────────────────────
// Query params: date_from, date_to, status, upcoming (bool), limit, offset
router.get('/', authMiddleware, (req, res) => {
  try {
    const { date_from, date_to, status, upcoming, limit = 50, offset = 0 } = req.query;
    let query = `SELECT a.*, c.name as linked_contact_name, c.phone as linked_contact_phone
                 FROM appointments a
                 LEFT JOIN contacts c ON a.contact_id = c.id
                 WHERE a.tenant_id = ?`;
    const params = [req.tenant.id];

    if (date_from) {
      query += ' AND a.date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      query += ' AND a.date <= ?';
      params.push(date_to);
    }
    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (upcoming === 'true') {
      query += ' AND a.date >= ? AND a.status != ?';
      params.push(todayDate(), 'cancelled');
    }

    const countQuery = query.replace(/SELECT a\.\*.*?FROM/, 'SELECT COUNT(*) as cnt FROM');
    const total = db.prepare(countQuery).get(...params).cnt;

    query += ' ORDER BY a.date ASC, a.time ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const meetings = db.prepare(query).all(...params);
    res.json({ meetings, total });
  } catch (err) {
    console.error('Error listing meetings:', err);
    res.status(500).json({ error: 'Failed to list meetings' });
  }
});

// ─── GET /:id ────────────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const meeting = db.prepare(
      `SELECT a.*, c.name as linked_contact_name, c.phone as linked_contact_phone
       FROM appointments a
       LEFT JOIN contacts c ON a.contact_id = c.id
       WHERE a.id = ? AND a.tenant_id = ?`
    ).get(req.params.id, req.tenant.id);

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    console.error('Error fetching meeting:', err);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// ─── POST / ──────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  try {
    const {
      contact_id, contact_phone, contact_name,
      date, time, duration_minutes, service,
      notes, location, meeting_link
    } = req.body;

    if (!date || !time) {
      return res.status(400).json({ error: 'date and time are required' });
    }
    if (!contact_phone && !contact_name && !contact_id) {
      return res.status(400).json({ error: 'At least one of contact_phone, contact_name, or contact_id is required' });
    }

    const dur = parseInt(duration_minutes) || DEFAULT_SLOT_DURATION;

    // Check for overlapping bookings
    const existing = db.prepare(
      `SELECT id, time, duration_minutes FROM appointments
       WHERE tenant_id = ? AND date = ? AND status != 'cancelled'`
    ).all(req.tenant.id, date);

    const conflict = existing.find((b) =>
      slotsOverlap(time, dur, b.time, b.duration_minutes || DEFAULT_SLOT_DURATION)
    );
    if (conflict) {
      return res.status(409).json({
        error: 'Time slot conflicts with an existing meeting',
        conflicting_meeting_id: conflict.id
      });
    }

    // Resolve contact_id from phone if not provided
    let resolvedContactId = contact_id || null;
    if (!resolvedContactId && contact_phone) {
      const contact = db.prepare(
        'SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?'
      ).get(req.tenant.id, contact_phone);
      if (contact) resolvedContactId = contact.id;
    }

    const id = uuid();
    db.prepare(
      `INSERT INTO appointments (id, tenant_id, contact_id, contact_phone, contact_name,
        date, time, duration_minutes, service, notes, location, meeting_link, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      id, req.tenant.id, resolvedContactId,
      contact_phone || null, contact_name || null,
      date, time, dur, service || null,
      notes || null, location || null, meeting_link || null
    );

    const meeting = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    res.status(201).json(meeting);
  } catch (err) {
    console.error('Error creating meeting:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// ─── PUT /:id ────────────────────────────────────────────────────────────────
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT * FROM appointments WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });

    const {
      contact_id, contact_phone, contact_name,
      date, time, duration_minutes, service,
      notes, status, location, meeting_link
    } = req.body;

    const newDate = date || existing.date;
    const newTime = time || existing.time;
    const newDur = duration_minutes != null ? parseInt(duration_minutes) : (existing.duration_minutes || DEFAULT_SLOT_DURATION);

    // Check for conflicts if date or time changed
    if (date || time || duration_minutes != null) {
      const others = db.prepare(
        `SELECT id, time, duration_minutes FROM appointments
         WHERE tenant_id = ? AND date = ? AND status != 'cancelled' AND id != ?`
      ).all(req.tenant.id, newDate, req.params.id);

      const conflict = others.find((b) =>
        slotsOverlap(newTime, newDur, b.time, b.duration_minutes || DEFAULT_SLOT_DURATION)
      );
      if (conflict) {
        return res.status(409).json({
          error: 'Updated time slot conflicts with an existing meeting',
          conflicting_meeting_id: conflict.id
        });
      }
    }

    db.prepare(
      `UPDATE appointments SET
        contact_id = ?, contact_phone = ?, contact_name = ?,
        date = ?, time = ?, duration_minutes = ?, service = ?,
        notes = ?, status = ?, location = ?, meeting_link = ?
       WHERE id = ? AND tenant_id = ?`
    ).run(
      contact_id !== undefined ? contact_id : existing.contact_id,
      contact_phone !== undefined ? contact_phone : existing.contact_phone,
      contact_name !== undefined ? contact_name : existing.contact_name,
      newDate, newTime, newDur,
      service !== undefined ? service : existing.service,
      notes !== undefined ? notes : existing.notes,
      status || existing.status,
      location !== undefined ? location : existing.location,
      meeting_link !== undefined ? meeting_link : existing.meeting_link,
      req.params.id, req.tenant.id
    );

    const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error updating meeting:', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT id FROM appointments WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });

    db.prepare('DELETE FROM appointments WHERE id = ? AND tenant_id = ?')
      .run(req.params.id, req.tenant.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting meeting:', err);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// ─── POST /:id/complete ─────────────────────────────────────────────────────
router.post('/:id/complete', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT * FROM appointments WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });

    if (existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot complete a cancelled meeting' });
    }

    const { notes } = req.body || {};
    const updatedNotes = notes ? (existing.notes ? `${existing.notes}\n${notes}` : notes) : existing.notes;

    db.prepare(
      `UPDATE appointments SET status = 'completed', notes = ?, completed_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`
    ).run(updatedNotes, req.params.id, req.tenant.id);

    const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error completing meeting:', err);
    res.status(500).json({ error: 'Failed to complete meeting' });
  }
});

// ─── POST /:id/cancel ───────────────────────────────────────────────────────
router.post('/:id/cancel', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare(
      'SELECT * FROM appointments WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenant.id);
    if (!existing) return res.status(404).json({ error: 'Meeting not found' });

    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed meeting' });
    }

    db.prepare(
      `UPDATE appointments SET status = 'cancelled', cancelled_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`
    ).run(req.params.id, req.tenant.id);

    const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    console.error('Error cancelling meeting:', err);
    res.status(500).json({ error: 'Failed to cancel meeting' });
  }
});

module.exports = router;
